import os
import subprocess
import platform
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import FolderMark
from app.services.folder_tree import get_folder_tree
from app.config import settings

router = APIRouter()

class RevealReq(BaseModel):
    path: str

@router.get("/sessions/{id}/folders/tree")
def get_tree(id: str, parent: str = "/", db: Session = Depends(get_db)):
    return get_folder_tree(db, id, parent)

class MarkReq(BaseModel):
    path: str
    mark: str

@router.put("/sessions/{id}/folders/mark")
def set_folder_mark(id: str, req: MarkReq, db: Session = Depends(get_db)):
    mark = db.query(FolderMark).filter(FolderMark.session_id == id, FolderMark.path == req.path).first()
    if mark:
        mark.mark = req.mark
    else:
        mark = FolderMark(session_id=id, path=req.path, mark=req.mark)
        db.add(mark)
        
    db.commit()
    return {"message": "Success"}

@router.delete("/sessions/{id}/folders/mark")
def delete_folder_mark(id: str, path: str, db: Session = Depends(get_db)):
    db.query(FolderMark).filter(FolderMark.session_id == id, FolderMark.path == path).delete()
    
    db.commit()
    return {"message": "Success"}

@router.get("/sessions/{id}/folders/marks")
def get_marks(id: str, db: Session = Depends(get_db)):
    marks = db.query(FolderMark).filter(FolderMark.session_id == id).all()
    return {m.path: m.mark for m in marks}

@router.get("/folders/default-root")
def get_default_root():
    return {"root": settings.NAS_ROOT}

@router.get("/folders/browse")
def browse_folders(path: str = "/"):
    # Windows special case for root drives
    if platform.system() == "Windows" and path == "/":
        try:
            import string
            from ctypes import windll
            drives = []
            bitmask = windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    drive_path = f"{letter}:\\"
                    drives.append({"name": f"本地磁盘 ({letter}:)", "path": drive_path})
                bitmask >>= 1
            return drives
        except Exception:
            # Fallback if ctypes fails
            return [{"name": "C:", "path": "C:\\"}]

    if not os.path.exists(path):
        path = settings.NAS_ROOT
        
    try:
        items = os.listdir(path)
        dirs = []
        for item in items:
            if item.startswith('.'):
                continue
            full_path = os.path.join(path, item)
            if os.path.isdir(full_path):
                dirs.append({"name": item, "path": full_path})
        return sorted(dirs, key=lambda x: x["name"])
    except Exception as e:
        return []
