from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import ScanSession, ScanFile, FolderMark, FileOverride
from app.services.scan_engine import current_scan

router = APIRouter()

@router.get("/")
def get_sessions(db: Session = Depends(get_db)):
    sessions = db.query(ScanSession).order_by(ScanSession.created_at.desc()).all()
    return sessions

@router.get("/{id}")
def get_session(id: str, db: Session = Depends(get_db)):
    return db.query(ScanSession).filter(ScanSession.id == id).first()

@router.get("/{id}/summary")
def get_session_summary(id: str, db: Session = Depends(get_db)):
    session = db.query(ScanSession).filter(ScanSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = session.__dict__.copy()
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
    # Distinct group IDs
    group_ids = db.query(ScanFile.group_id).filter(ScanFile.session_id == id).distinct().offset((page - 1) * page_size).limit(page_size).all()
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
