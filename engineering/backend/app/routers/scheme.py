from fastapi import APIRouter, Depends, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models import FileOverride, ScanFile
from app.services.scheme_engine import SchemeEngine, generate_scheme_async, current_scheme, scheme_cache

router = APIRouter()

class FileActionReq(BaseModel):
    path: str
    action: str

@router.post("/{id}/scheme/generate")
async def generate_scheme(id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 每次重新生成方案前，清除该会话的单文件手动覆盖记录（以确保完全按最新的文件夹标记生成）
    db.query(FileOverride).filter(FileOverride.session_id == id).delete()
    db.commit()
    
    # 清除旧缓存，准备重新生成
    scheme_cache.clear()
    background_tasks.add_task(generate_scheme_async, id)
    return {"message": "Scheme generation started", "session_id": id}

@router.get("/{id}/scheme/categories")
def get_categories(id: str, db: Session = Depends(get_db)):
    # 优先返回缓存的分类结果（手动调整不重分类）
    if scheme_cache.is_valid(id):
        return scheme_cache.data
    
    # 无缓存时实时计算（首次调用 /scheme/generate 之前）
    engine = SchemeEngine(db, id)
    result = engine.generate_scheme()
    scheme_cache.set(id, result)
    return result

@router.get("/{id}/scheme/categories/{cat}/groups")
def get_cat_groups(id: str, cat: str, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1), db: Session = Depends(get_db)):
    engine = SchemeEngine(db, id)
    
    # 优先使用缓存的分类（手动调整不重分类）
    if scheme_cache.is_valid(id) and cat in scheme_cache.data:
        scheme = scheme_cache.data
    else:
        scheme = engine.generate_scheme()
        
    if cat not in scheme:
        return {"error": "Invalid category"}
        
    group_ids = scheme[cat]["groups"]
    paged_group_ids = group_ids[(page-1)*page_size : page*page_size]
    
    files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(paged_group_ids)).all()
    
    from collections import defaultdict
    groups = defaultdict(list)
    for f in files:
        act = engine.resolve_action(f.path)
        f_dict = {
            "path": f.path,
            "size": f.size,
            "created_time": f.created_time,
            "modified_time": f.modified_time,
            "action": act.action.value,
            "mark_source_type": act.mark_source_type.value,
            "mark_source": act.mark_source
        }
        groups[f.group_id].append(f_dict)
        
    # Sort groups: override groups first, then by reclaimable size desc
    from app.models import FileOverride
    override_paths = {o.file_path for o in db.query(FileOverride).filter(FileOverride.session_id == id).all()}
    
    def group_sort_key(item):
        gid, gfiles = item
        has_override = any(f.get("mark_source_type") == "override" for f in gfiles)
        reclaimable = sum(f["size"] for f in gfiles if f["action"] == "delete")
        return (0 if has_override else 1, -reclaimable, gid)
    
    sorted_groups = sorted(groups.items(), key=group_sort_key)
    
    # Sort files in group (stable sort by path only)
    for gid in groups:
        groups[gid].sort(key=lambda x: x["path"])
        
    return {"data": [{"group_id": k, "files": v} for k, v in sorted_groups], "page": page, "page_size": page_size, "total_groups": len(group_ids)}

@router.get("/{id}/scheme/status")
def get_scheme_status(id: str):
    return {
        "status": current_scheme.status,
        "processed": current_scheme.processed,
        "total": current_scheme.total
    }

@router.put("/{id}/scheme/file-action")
def update_file_action(id: str, req: FileActionReq, db: Session = Depends(get_db)):
    override = db.query(FileOverride).filter(FileOverride.session_id == id, FileOverride.file_path == req.path).first()
    if override:
        override.action = req.action
    else:
        override = FileOverride(session_id=id, file_path=req.path, action=req.action)
        db.add(override)
        
    # 同时更新会话的最后更新时间
    from datetime import datetime
    from app.models import ScanSession
    session_record = db.query(ScanSession).filter(ScanSession.id == id).first()
    if session_record:
        session_record.finished_at = datetime.utcnow()
        
    db.commit()
    
    # 同步更新缓存中的统计数据，确保页面获取到的数字是实时的，同时保持组分类不变
    from app.services.scheme_engine import scheme_cache, SchemeEngine
    from app.models import ScanFile
    if scheme_cache.is_valid(id):
        engine = SchemeEngine(db, id)
        for cat_name, cat_data in scheme_cache.data.items():
            cat_data["file_count"] = 0
            cat_data["size"] = 0
            if not cat_data["groups"]:
                continue
                
            files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(cat_data["groups"])).all()
            for f in files:
                act = engine.resolve_action(f.path)
                if act.action.value == "delete":
                    cat_data["file_count"] += 1
                    cat_data["size"] += f.size

    return {"message": "Success"}
