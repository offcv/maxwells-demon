import os
import shutil
import asyncio
import math
import json
from app.ws.manager import manager
from app.database import SessionLocal
from app.models import ScanFile, FileOverride, FileActionType, FolderMark, ScanSession
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
        self.emptied_dirs = 0
        self.empty_dir_failed = 0

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


# ── 空文件夹清理阶段 ─────────────────────────────────────────────────

def _norm_path(p: str) -> str:
    """路径归一化（跨平台大小写兼容），用于保护名单与去重比较"""
    return os.path.normcase(os.path.normpath(p))


def _dir_is_empty_ignoring(path: str) -> bool:
    """
    判断目录是否“视为空”：
    排除隐藏条目（. 开头，如 .DS_Store）与群晖索引目录 @eaDir 后无任何条目。

    安全底线：0 字节普通文件、symlink 等真实存在的条目均视为“有内容”——
    它们是用户数据，绝不能因其所在目录被整体移走。
    """
    try:
        with os.scandir(path) as it:
            for entry in it:
                if entry.name.startswith('.') or entry.name == '@eaDir':
                    continue
                return False
        return True
    except OSError:
        return False


def _ancestor_chain(path: str) -> list:
    """返回 path 自身及其全部祖先路径（含文件系统根）"""
    chain = []
    cur = os.path.normpath(path)
    while True:
        chain.append(cur)
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return chain


def _delete_folder_marks_under(db, session_id: str, dir_path: str) -> int:
    """
    删除 dir_path 及其子路径上的 FolderMark 记录（清理空目录后的数据卫生）。
    - 严格限定 session_id，避免误删其他会话对同一目录的标记
    - 前缀匹配在 Python 侧完成（带路径分隔符边界），规避 SQL LIKE 通配符陷阱
    """
    marks = db.query(FolderMark).filter(FolderMark.session_id == session_id).all()
    prefix = dir_path.rstrip(os.sep) + os.sep
    removed = 0
    for m in marks:
        if m.path == dir_path or m.path.startswith(prefix):
            db.delete(m)
            removed += 1
    if removed:
        db.commit()
    return removed


async def _cleanup_empty_dirs(db, session_id: str, moved_paths: list, move_dir_func, dest_path: str = None):
    """
    清理阶段：文件全部移走后，将因此残留的空文件夹移动到废纸篓/目标目录。

    规则：
      - 候选目录 = 已移动文件的父目录；子目录被清后父目录可能级联变空，自底向上复检
      - 上溯止于扫描根（scan_paths 中的 include 根本身绝不移动）
      - “空”的口径见 _dir_is_empty_ignoring（忽略 ./开头 与 @eaDir）
      - 保护名单：扫描根本身、#recycle、dest_path 及其祖先链
      - 每移走一个空目录，同步删除其路径下的 FolderMark 残留
      - 单个目录失败不中断整体流程（empty_dir_failed 计数），全程响应取消标志
    """
    if not moved_paths:
        return

    # 会话不存在则无法确定扫描根上溯边界，跳过清理（正常流程中 session 必然存在于库中）
    session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
    if not session:
        return
    try:
        scan_paths = json.loads(session.scan_paths or "[]")
    except (ValueError, TypeError):
        scan_paths = []
    roots = [
        p.get("path") for p in scan_paths
        if isinstance(p, dict) and p.get("path") and not p.get("is_exclude")
    ]
    if not roots:
        return

    from app.config import settings

    roots_norm = {_norm_path(r) for r in roots}
    protected = set(roots_norm)
    protected.add(_norm_path(os.path.join(settings.NAS_ROOT, "#recycle")))
    if dest_path:
        for anc in _ancestor_chain(dest_path):
            protected.add(_norm_path(anc))

    # 初始候选：已移动文件的父目录（去重、排除扫描根本身）
    queue = []
    queued = set()
    for p in moved_paths:
        d = os.path.dirname(os.path.normpath(str(p)))
        nd = _norm_path(d)
        if nd in roots_norm or nd in queued:
            continue
        queued.add(nd)
        queue.append(d)
    # 自底向上：深层目录优先（减少重复复检）；级联追加的父目录天然更浅，追加尾部即可。
    # 正确性不依赖全局顺序：任何目录入队都发生在其某个子目录刚被移走之后。
    queue.sort(key=lambda d: d.count(os.sep), reverse=True)

    while queue:
        if current_action.cancel_flag:
            break
        d = queue.pop(0)
        queued.discard(_norm_path(d))

        nd = _norm_path(d)
        if nd in protected or nd in roots_norm:
            continue
        # 目录必须真实存在（API 测试可能传入磁盘上不存在的假路径）；symlink 目录不动
        if not os.path.isdir(d) or os.path.islink(d):
            continue
        if not _dir_is_empty_ignoring(d):
            continue

        try:
            move_dir_func(d)
            current_action.emptied_dirs += 1
            _delete_folder_marks_under(db, session_id, d)
            await manager.broadcast("action", {
                "type": "action_progress",
                "session_id": session_id,
                "action": current_action.action,
                "phase": "cleaning_empty_dirs",
                "current_dir": d,
                "emptied_dirs": current_action.emptied_dirs,
            })
        except Exception as e:
            print(f"Failed to clean empty dir {d}: {e}")
            current_action.empty_dir_failed += 1
            continue

        # 级联：父目录可能因此变空，重新入队复检（即使它此前被判定为非空）
        parent = os.path.dirname(d)
        np = _norm_path(parent)
        if parent and np != nd and np not in roots_norm and np not in queued:
            queued.add(np)
            queue.append(parent)


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
    current_action.emptied_dirs = 0
    current_action.empty_dir_failed = 0
    current_action.total_size = sum(f.get("size", 0) for f in files_to_move)

    # 收集成功移动的文件路径，供收尾的空文件夹清理阶段推导候选目录
    moved_paths = []

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
            "total": total,
            "emptied_dirs": current_action.emptied_dirs
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
                    moved_paths.append(f_info["path"])
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

        # 空文件夹清理阶段：文件移走后将残留空目录一并移到目标目录（主操作取消则跳过）
        if not cancelled:
            def _move_dir_to_dest(d):
                base = os.path.basename(d.rstrip(os.sep))
                target = os.path.join(dest_path, base)
                counter = 1
                while os.path.exists(target):
                    name, ext = os.path.splitext(base)
                    target = os.path.join(dest_path, f"{name}_{counter}{ext}")
                    counter += 1
                shutil.move(d, target)
            try:
                await _cleanup_empty_dirs(db, session_id, moved_paths, _move_dir_to_dest, dest_path=dest_path)
            except Exception as e:
                print(f"Empty dir cleanup error: {e}")

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
    current_action.emptied_dirs = 0
    current_action.empty_dir_failed = 0
    current_action.total_size = sum(f.get("size", 0) for f in files_to_move)

    # 收集成功移动的文件路径，供收尾的空文件夹清理阶段推导候选目录
    moved_paths = []

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
            "total": total,
            "emptied_dirs": current_action.emptied_dirs
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
                    moved_paths.append(f_info["path"])
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

        # 空文件夹清理阶段：文件移走后将残留空目录一并移到废纸篓（主操作取消则跳过）
        if not cancelled:
            try:
                await _cleanup_empty_dirs(db, session_id, moved_paths, trash_func)
            except Exception as e:
                print(f"Empty dir cleanup error: {e}")

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
