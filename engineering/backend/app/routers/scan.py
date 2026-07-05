import uuid
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import List
from app.services.scan_engine import run_scan, current_scan

router = APIRouter()

class ScanPath(BaseModel):
    path: str
    is_exclude: bool = False

class ScanStartReq(BaseModel):
    scan_paths: List[ScanPath]

@router.post("/start")
async def start_scan(req: ScanStartReq, background_tasks: BackgroundTasks):
    if current_scan.status in ["phase1", "phase2"]:
        return {"error": "Scan already running"}
    
    # Reset any lingering cancel_flag from a previous (cancelled) scan
    current_scan.cancel_flag = False
    
    # Pre-generate session_id so frontend can know it immediately
    session_id = str(uuid.uuid4())
    current_scan.session_id = session_id
    
    paths = [p.dict() for p in req.scan_paths]
    # We do NOT pass `db` here because BackgroundTasks run after response.
    # The `db` session injected by FastAPI would be closed!
    background_tasks.add_task(run_scan, paths, session_id)
    return {"message": "Scan started", "session_id": session_id}

@router.get("/status")
def get_status():
    return {
        "status": current_scan.status,
        "session_id": current_scan.session_id,
        "scanned_total": current_scan.scanned_total
    }

@router.post("/cancel")
def cancel_scan():
    if current_scan.status in ["phase1", "phase2"]:
        current_scan.cancel_flag = True
        return {"message": "Cancelling scan..."}
    return {"message": "No active scan"}
