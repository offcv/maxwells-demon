import os
import shutil
import asyncio
import math
from app.ws.manager import manager
from app.database import SessionLocal
from app.models import ScanFile, FileOverride, FileActionType
from app.services.scheme_engine import scheme_cache, SchemeEngine

# Global action state for cancel support
class ActionState:
    def __init__(self):
        self.session_id = None
        self.cancel_flag = False
        self.running = False
        self.status = "idle"
        self.action = None
        self.done = 0
        self.total = 0
        self.failed = 0
        self.total_size = 0

current_action = ActionState()

def _update_cache_after_action(db, session_id: str):
    """清理操作后，不重置分类，而是修剪失效的组，并更新剩余组的统计"""
    if not scheme_cache.is_valid(session_id):
        return
        
    engine = SchemeEngine(db, session_id)
    for cat_name, cat_data in scheme_cache.data.items():
        valid_groups = []
        cat_data["file_count"] = 0
        cat_data["size"] = 0
        cat_data["total_file_count"] = 0
        cat_data["total_size"] = 0
        
        for group_id in cat_data["groups"]:
            group_files = db.query(ScanFile).filter(ScanFile.session_id == session_id, ScanFile.group_id == group_id).all()
            total = len(group_files)
            
            # 过滤逻辑：如果组内文件数 <= 1，视为已彻底清理或无需处理的无效组，剔除
            if total <= 1:
                continue
                
            valid_groups.append(group_id)
            cat_data["total_file_count"] += total
            
            for f in group_files:
                cat_data["total_size"] += f.size
                act = engine.resolve_action(f.path)
                if act.action.value == "delete":
                    cat_data["file_count"] += 1
                    cat_data["size"] += f.size
                    
        # 更新修剪后的组列表
        cat_data["groups"] = valid_groups

async def execute_move_to_folder(session_id: str, files_to_move: list, dest_path: str):
    global current_action
    current_action.session_id = session_id
    current_action.cancel_flag = False
    current_action.running = True
    current_action.status = "running"
    current_action.action = "move_to_folder"
    current_action.total = len(files_to_move)
    current_action.done = 0
    current_action.failed = 0
    current_action.total_size = sum(f.get("size", 0) for f in files_to_move)

    total = len(files_to_move)
    batch_size = 100
    num_batches = math.ceil(total / batch_size) if total > 0 else 1

    if not os.path.exists(dest_path):
        os.makedirs(dest_path, exist_ok=True)

    batches = []
    for b in range(num_batches):
        start = b * batch_size
        end = min(start + batch_size, total)
        batch_files = files_to_move[start:end]
        batches.append({
            "id": b + 1,
            "total": len(batch_files),
            "done": 0,
            "current_file": "",
            "status": "pending" if b > 0 else "running",
            "files": batch_files
        })

    def build_message(final_status: str = None):
        msg_batches = []
        for b in batches:
            msg_batches.append({
                "id": b["id"],
                "total": b["total"],
                "done": b["done"],
                "current_file": b["current_file"],
                "status": b["status"]
            })
        msg = {
            "type": "action_progress",
            "session_id": session_id,
            "action": "move_to_folder",
            "batches": msg_batches,
            "done": sum(b["done"] for b in batches),
            "total": total
        }
        if final_status:
            msg["status"] = final_status
        return msg

    db = SessionLocal()
    try:
        cancelled = False
        for batch in batches:
            if current_action.cancel_flag:
                cancelled = True
                break
            batch["status"] = "running"
            await manager.broadcast("action", build_message())
            await asyncio.sleep(0.01)

            for f_info in batch["files"]:
                if current_action.cancel_flag:
                    cancelled = True
                    break
                try:
                    base = os.path.basename(f_info["path"])
                    target = os.path.join(dest_path, base)
                    counter = 1
                    while os.path.exists(target):
                        name, ext = os.path.splitext(base)
                        target = os.path.join(dest_path, f"{name}_{counter}{ext}")
                        counter += 1
                    shutil.move(f_info["path"], target)
                    
                    db.query(ScanFile).filter(ScanFile.session_id == session_id, ScanFile.path == f_info["path"]).delete()
                    db.query(FileOverride).filter(FileOverride.session_id == session_id, FileOverride.file_path == f_info["path"]).delete()
                    db.commit()
                except Exception as e:
                    print(f"Failed to move {f_info['path']}: {e}")
                    current_action.failed += 1

                batch["done"] += 1
                batch["current_file"] = f_info["path"]
                current_action.done += 1

                if batch["done"] % 10 == 0 or batch["done"] == batch["total"]:
                    await manager.broadcast("action", build_message())
                    await asyncio.sleep(0.01)

            if not current_action.cancel_flag:
                batch["status"] = "done"

        if scheme_cache.session_id == session_id:
            _update_cache_after_action(db, session_id)

        final_status = "cancelled" if cancelled else "done"
        current_action.running = False
        current_action.status = final_status
        await manager.broadcast("action", build_message(final_status))

    except Exception as e:
        print(f"Move error: {e}")
        current_action.running = False
        current_action.status = "error"
    finally:
        db.close()


async def execute_move_to_trash(session_id: str, files_to_move: list):
    global current_action
    current_action.session_id = session_id
    current_action.cancel_flag = False
    current_action.running = True
    current_action.status = "running"
    current_action.action = "move_to_trash"
    current_action.total = len(files_to_move)
    current_action.done = 0
    current_action.failed = 0
    current_action.total_size = sum(f.get("size", 0) for f in files_to_move)

    from app.config import settings

    def docker_trash(p):
        import shutil
        trash_dir = os.path.join(settings.NAS_ROOT, "#recycle")
        os.makedirs(trash_dir, exist_ok=True)
        # Avoid naming collision in trash
        base = os.path.basename(p)
        target = os.path.join(trash_dir, base)
        counter = 1
        while os.path.exists(target):
            name, ext = os.path.splitext(base)
            target = os.path.join(trash_dir, f"{name}_{counter}{ext}")
            counter += 1
        shutil.move(p, target)

    if settings.DOCKER_MODE:
        trash_func = docker_trash
    else:
        try:
            from send2trash import send2trash
            trash_func = send2trash
        except ImportError:
            trash_func = docker_trash

    total = len(files_to_move)
    batch_size = 100
    num_batches = math.ceil(total / batch_size) if total > 0 else 1

    batches = []
    for b in range(num_batches):
        start = b * batch_size
        end = min(start + batch_size, total)
        batch_files = files_to_move[start:end]
        batches.append({
            "id": b + 1,
            "total": len(batch_files),
            "done": 0,
            "current_file": "",
            "status": "pending" if b > 0 else "running",
            "files": batch_files
        })

    def build_message(final_status: str = None):
        msg_batches = []
        for b in batches:
            msg_batches.append({
                "id": b["id"],
                "total": b["total"],
                "done": b["done"],
                "current_file": b["current_file"],
                "status": b["status"]
            })
        msg = {
            "type": "action_progress",
            "session_id": session_id,
            "action": "move_to_trash",
            "batches": msg_batches,
            "done": sum(b["done"] for b in batches),
            "total": total
        }
        if final_status:
            msg["status"] = final_status
        return msg

    db = SessionLocal()
    try:
        cancelled = False
        for batch in batches:
            if current_action.cancel_flag:
                cancelled = True
                break
            batch["status"] = "running"
            await manager.broadcast("action", build_message())
            await asyncio.sleep(0.01)

            for f_info in batch["files"]:
                if current_action.cancel_flag:
                    cancelled = True
                    break
                try:
                    trash_func(f_info["path"])

                    db.query(ScanFile).filter(ScanFile.session_id == session_id, ScanFile.path == f_info["path"]).delete()
                    db.query(FileOverride).filter(FileOverride.session_id == session_id, FileOverride.file_path == f_info["path"]).delete()
                    db.commit()
                except Exception as e:
                    print(f"Failed to trash {f_info['path']}: {e}")
                    current_action.failed += 1

                batch["done"] += 1
                batch["current_file"] = f_info["path"]
                current_action.done += 1

                if batch["done"] % 10 == 0 or batch["done"] == batch["total"]:
                    await manager.broadcast("action", build_message())
                    await asyncio.sleep(0.01)

            if not current_action.cancel_flag:
                batch["status"] = "done"

        if scheme_cache.session_id == session_id:
            _update_cache_after_action(db, session_id)

        final_status = "cancelled" if cancelled else "done"
        current_action.running = False
        current_action.status = final_status
        await manager.broadcast("action", build_message(final_status))

    except Exception as e:
        print(f"Trash error: {e}")
        current_action.running = False
        current_action.status = "error"
    finally:
        db.close()
