from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.services.action_engine import execute_move_to_folder, execute_move_to_trash, current_action
from app.services.scheme_engine import SchemeEngine
from app.models import ScanFile

router = APIRouter()

class MoveReq(BaseModel):
    category: str
    dest_path: Optional[str] = None

@router.post("/{id}/action/move-to-folder")
async def move_to_folder(id: str, req: MoveReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not req.dest_path:
        return {"error": "Destination path required"}
        
    engine = SchemeEngine(db, id)
    
    # 优先使用缓存的分类（遵循“组分类不变”规则）
    from app.services.scheme_engine import scheme_cache
    if scheme_cache.is_valid(id):
        scheme = scheme_cache.data
    else:
        scheme = engine.generate_scheme()
        
    if req.category not in scheme:
        return {"error": "Invalid category"}
        
    group_ids = scheme[req.category]["groups"]
    files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(group_ids)).all()
    
    files_to_move = []
    for f in files:
        act = engine.resolve_action(f.path)
        if act.action.value == "delete":
            files_to_move.append({"path": f.path, "size": f.size})
            
    background_tasks.add_task(execute_move_to_folder, id, files_to_move, req.dest_path)
    return {"message": f"Moving {len(files_to_move)} files to {req.dest_path}"}

@router.post("/{id}/action/move-to-trash")
async def move_to_trash(id: str, req: MoveReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    engine = SchemeEngine(db, id)
    
    # 优先使用缓存的分类（遵循“组分类不变”规则）
    from app.services.scheme_engine import scheme_cache
    if scheme_cache.is_valid(id):
        scheme = scheme_cache.data
    else:
        scheme = engine.generate_scheme()
        
    if req.category not in scheme:
        return {"error": "Invalid category"}
        
    group_ids = scheme[req.category]["groups"]
    files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(group_ids)).all()
    
    files_to_move = []
    for f in files:
        act = engine.resolve_action(f.path)
        if act.action.value == "delete":
            files_to_move.append({"path": f.path, "size": f.size})
            
    background_tasks.add_task(execute_move_to_trash, id, files_to_move)
    return {"message": f"Moving {len(files_to_move)} files to trash"}

@router.post("/{id}/action/cancel")
async def cancel_action(id: str):
    if current_action.running and current_action.session_id == id:
        current_action.cancel_flag = True
        return {"message": "Cancelling action..."}
    return {"message": "No active action"}

@router.get("/{id}/action/status")
async def get_action_status(id: str):
    if current_action.session_id == id:
        return {
            "status": current_action.status,
            "action": current_action.action,
            "done": current_action.done,
            "total": current_action.total,
            "failed": current_action.failed,
            "total_size": current_action.total_size
        }
    return {"status": "idle"}
