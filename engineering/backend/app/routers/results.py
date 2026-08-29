from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import ScanSession, ScanFile, FolderMark, FileOverride
from app.services.scan_engine import current_scan

router = APIRouter()


def _valid_group_stats(db: Session, session_id: str) -> dict:
    """
    按“有效重复组”（组内文件数 >= 2）实时计算会话统计。

    清理动作会删除 scan_files 中已移走文件的记录，某组只剩 1 个文件时
    该文件已不再重复（孤儿），不计入统计。与文件夹树/方案分类的口径一致。

    采用纯 SQL 两层聚合（内层按组聚合、外层汇总），整数运算，避免
    全量拉取 ORM 对象到内存；GROUP BY 可走 ix_scan_files_session_group 索引。
    """
    inner = (
        db.query(
            ScanFile.group_id.label("gid"),
            func.count(ScanFile.id).label("cnt"),
            func.min(ScanFile.size).label("sz"),
        )
        .filter(ScanFile.session_id == session_id)
        .group_by(ScanFile.group_id)
        .having(func.count(ScanFile.id) >= 2)
        .subquery()
    )
    row = db.query(
        func.count(inner.c.gid),
        func.coalesce(func.sum(inner.c.cnt), 0),
        func.coalesce(func.sum(inner.c.cnt * inner.c.sz), 0),
        func.coalesce(func.sum((inner.c.cnt - 1) * inner.c.sz), 0),
    ).first()
    return {
        "group_count": row[0] or 0,
        "file_count": row[1] or 0,
        "total_size": row[2] or 0,
        # 每组保留一份：可释放 = 单份大小 x (份数-1)，等价于写入端口径
        "reclaimable_size": row[3] or 0,
    }


def _serialize_session(db: Session, session: ScanSession) -> dict:
    """
    将会话 ORM 对象序列化为 dict，四个统计字段替换为实时值，
    其余字段（含 datetime、scan_paths 字符串）原样保留，
    与直接返回 ORM 对象的 FastAPI 序列化输出保持一致。
    """
    stats = _valid_group_stats(db, session.id)
    return {
        "id": session.id,
        "scan_paths": session.scan_paths,
        "status": session.status,
        "scanned_total": session.scanned_total,
        "file_count": stats["file_count"],
        "group_count": stats["group_count"],
        "total_size": stats["total_size"],
        "reclaimable_size": stats["reclaimable_size"],
        "created_at": session.created_at,
        "finished_at": session.finished_at,
        "scan_duration_sec": session.scan_duration_sec,
    }


@router.get("/")
def get_sessions(db: Session = Depends(get_db)):
    sessions = db.query(ScanSession).order_by(ScanSession.created_at.desc()).all()
    # 统计字段动态重算：清理后列表数字与「清理方案分类页」保持一致
    return [_serialize_session(db, s) for s in sessions]


@router.get("/{id}")
def get_session(id: str, db: Session = Depends(get_db)):
    session = db.query(ScanSession).filter(ScanSession.id == id).first()
    if not session:
        return None
    return _serialize_session(db, session)


@router.get("/{id}/summary")
def get_session_summary(id: str, db: Session = Depends(get_db)):
    session = db.query(ScanSession).filter(ScanSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = _serialize_session(db, session)
    # Add unreadable count from memory if this is the current session
    if current_scan.session_id == id:
        result["unreadable_count"] = len(current_scan.unreadable_files)
    else:
        result["unreadable_count"] = 0
    return result

@router.get("/{id}/files")
def get_files(id: str, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1), db: Session = Depends(get_db)):
    files = db.query(ScanFile).filter(ScanFile.session_id == id).offset((page - 1) * page_size).limit(page_size).all()
    total = db.query(func.count(ScanFile.id)).filter(ScanFile.session_id == id).scalar()
    return {"data": files, "total": total, "page": page, "page_size": page_size}

@router.get("/{id}/groups")
def get_groups(id: str, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1), db: Session = Depends(get_db)):
    # Only return groups that still have >= 2 files (valid duplicate groups)
    # Filter out orphan files left behind after cleanup actions
    valid_group_subquery = (
        db.query(ScanFile.group_id)
        .filter(ScanFile.session_id == id)
        .group_by(ScanFile.group_id)
        .having(func.count(ScanFile.id) >= 2)
        .subquery()
    )
    
    # Distinct group IDs from valid groups only
    group_ids = (
        db.query(ScanFile.group_id)
        .filter(ScanFile.session_id == id, ScanFile.group_id.in_(valid_group_subquery))
        .distinct()
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    gids = [g[0] for g in group_ids]
    
    files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(gids)).all()
    
    # group by group_id
    from collections import defaultdict
    groups = defaultdict(list)
    for f in files:
        groups[f.group_id].append(f)
        
    return {"data": [{"group_id": k, "files": v} for k, v in groups.items()], "page": page, "page_size": page_size}

@router.get("/{id}/groups/{group_id}/files")
def get_group_files(id: str, group_id: int, db: Session = Depends(get_db)):
    return db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id == group_id).all()

@router.get("/{id}/unreadable-files")
def get_unreadable_files(id: str):
    """获取扫描中发现的不可读取文件列表（仅在当前内存中的扫描会话有效）"""
    if current_scan.session_id == id and current_scan.unreadable_files:
        return {"data": current_scan.unreadable_files, "total": len(current_scan.unreadable_files)}
    return {"data": [], "total": 0}

@router.delete("/{id}")
def delete_session(id: str, db: Session = Depends(get_db)):
    # Delete related data first
    db.query(ScanFile).filter(ScanFile.session_id == id).delete()
    db.query(FolderMark).filter(FolderMark.session_id == id).delete()
    db.query(FileOverride).filter(FileOverride.session_id == id).delete()
    db.query(ScanSession).filter(ScanSession.id == id).delete()
    db.commit()
    return {"message": "Session deleted"}
