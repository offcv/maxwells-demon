import os
import uuid
import time
import json
import asyncio
import hashlib
import xxhash
from collections import defaultdict
from sqlalchemy.orm import Session
from app.models import ScanSession, ScanFile
from app.ws.manager import manager
from app.config import settings
from app.database import SessionLocal
from datetime import datetime

class ScanState:
    def __init__(self):
        self.session_id = None
        self.status = "idle" # idle, phase1, phase2, done, cancelled, error
        self.cancel_flag = False
        self.scanned_total = 0
        self.start_time = 0
        self.unreadable_files = []  # 无读权限文件列表

current_scan = ScanState()

import platform

def get_creation_time(stat_result) -> float:
    """跨平台获取文件真实创建时间"""
    # 尝试获取真正的创建时间 (macOS / 新版 Linux / Windows)
    if hasattr(stat_result, 'st_birthtime'):
        return stat_result.st_birthtime
        
    if platform.system() == 'Windows':
        # Windows 的 st_ctime 就是创建时间
        return stat_result.st_ctime
    else:
        # 老版本 Linux/群晖 的兜底策略：取 ctime 和 mtime 中的较小值作为推测的创建时间
        return min(stat_result.st_ctime, stat_result.st_mtime)

def get_xxhash64_64kb(filepath: str, size: int) -> str:
    try:
        with open(filepath, 'rb') as f:
            head = f.read(65536)
            h = xxhash.xxh64()
            h.update(head)
            h.update(str(size).encode('utf-8'))
            return h.hexdigest()
    except Exception:
        return None


async def get_xxhash64_64kb_async(filepath: str, size: int) -> str:
    """Run xxhash64 computation in a thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(get_xxhash64_64kb, filepath, size)

def get_sha256(filepath: str) -> str:
    try:
        h = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


async def get_sha256_async(filepath: str) -> str:
    """Run SHA256 computation in a thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(get_sha256, filepath)

async def _list_dir_async(path: str):
    """Run os.scandir in a thread pool so it never blocks the event loop."""
    def _sync():
        try:
            with os.scandir(path) as it:
                dirs, files = [], []
                for e in it:
                    if e.is_dir():
                        dirs.append(e.name)
                    else:
                        files.append(e.name)
                return dirs, files
        except PermissionError:
            return [], []
        except Exception:
            return [], []
    return await asyncio.to_thread(_sync)


async def _walk_async(root_path: str, excludes: list):
    """
    Async directory walker. Yields (dir_path, dir_names, file_names) tuples
    without ever blocking the event loop (os.scandir runs in a thread pool).
    """
    stack = [root_path]
    while stack:
        path = stack.pop()
        dirs, files = await _list_dir_async(path)
        yield path, dirs, files
        # Add subdirectories for further traversal (reversed for natural order)
        for d in reversed(sorted(dirs)):
            # 自动跳过群晖索引目录、系统废纸篓，以及隐藏目录
            if d == '@eaDir' or d == '#recycle' or d.startswith('.'):
                continue
                
            full = os.path.join(path, d)
            # Use normcase for OS-agnostic / case-insensitive comparison
            norm_full = os.path.normcase(os.path.normpath(full))
            if not any(norm_full.startswith(os.path.normcase(os.path.normpath(ex))) for ex in excludes):
                stack.append(full)


async def run_scan(scan_paths: list, session_id: str = None):
    global current_scan
    current_scan.session_id = session_id or str(uuid.uuid4())
    current_scan.status = "phase1"
    # Save cancel state before resetting — user may have cancelled before we started running
    was_cancelled = current_scan.cancel_flag
    current_scan.cancel_flag = False
    current_scan.scanned_total = 0
    current_scan.start_time = time.time()
    current_scan.unreadable_files = []
    
    if was_cancelled:
        current_scan.status = "cancelled"
        await manager.broadcast("scan", {"status": "cancelled", "session_id": current_scan.session_id})
        return
    
    db = SessionLocal()
    
    try:
        includes = [p["path"] for p in scan_paths if not p.get("is_exclude")]
        excludes = [p["path"] for p in scan_paths if p.get("is_exclude")]
        
        # Phase 1
        phase1_groups = defaultdict(list)
        count = 0
        
        for inc_path in includes:
            async for root, dirs, files in _walk_async(inc_path, excludes):
                # Yield control after the (now non-blocking) scandir completes
                await asyncio.sleep(0)
                
                if current_scan.cancel_flag:
                    current_scan.status = "cancelled"
                    await manager.broadcast("scan", {"status": "cancelled", "session_id": current_scan.session_id})
                    return
                
                for file in files:
                    # Yield control BEFORE every single file for max cancel responsiveness
                    await asyncio.sleep(0)
                    if current_scan.cancel_flag:
                        current_scan.status = "cancelled"
                        await manager.broadcast("scan", {"status": "cancelled", "session_id": current_scan.session_id})
                        return

                    filepath = os.path.join(root, file)
                    
                    norm_filepath = os.path.normcase(os.path.normpath(filepath))
                    if any(norm_filepath.startswith(os.path.normcase(os.path.normpath(ex))) for ex in excludes):
                        continue
                    
                    # 优先级判断 (Hidden, 0-byte, Symlink, No-Perm)
                    if file.startswith('.'):
                        continue # Hide file, skip
                        
                    if os.path.islink(filepath):
                        continue # Symlink, skip
                    
                    try:
                        stat = os.stat(filepath)
                        size = stat.st_size
                    except Exception:
                        count += 1
                        continue # No perm or missing
                        
                    count += 1
                    current_scan.scanned_total = count
                    
                    if size == 0:
                        continue # 0 byte, counted but skipped
                        
                    if not os.access(filepath, os.R_OK):
                        current_scan.unreadable_files.append(filepath)
                        continue
                        
                    # Calculate xxhash (run in thread pool to avoid blocking)
                    xxh = await get_xxhash64_64kb_async(filepath, size)
                    # Re-check cancel after potentially slow I/O
                    if current_scan.cancel_flag:
                        current_scan.status = "cancelled"
                        await manager.broadcast("scan", {"status": "cancelled", "session_id": current_scan.session_id})
                        return
                    if xxh:
                        ctime = get_creation_time(stat)
                        phase1_groups[(xxh, size)].append((filepath, size, ctime, stat.st_mtime))

                    # 每次广播，实现实时更新
                    await manager.broadcast("scan", {
                        "type": "scan_progress",
                        "session_id": current_scan.session_id,
                        "status": "phase1",
                        "phase1": {
                            "scanned": count,
                            "current_file": filepath
                        },
                        "phase2": None,
                        "elapsed_sec": time.time() - current_scan.start_time
                    })
                    await asyncio.sleep(0)

        # 确保 Phase1 即便 0 个文件，也能广播至少一次
        if count == 0:
            await manager.broadcast("scan", {
                "type": "scan_progress",
                "session_id": current_scan.session_id,
                "status": "phase1",
                "phase1": {
                    "scanned": count,
                    "current_file": "扫描结束"
                },
                "phase2": None,
                "elapsed_sec": time.time() - current_scan.start_time
            })
            await asyncio.sleep(0)

        # Filter phase 1 candidates
        candidates = []
        for (xxh, size), file_list in phase1_groups.items():
            if len(file_list) >= 2:
                candidates.extend(file_list)
                
        # Phase 2
        current_scan.status = "phase2"
        total_candidates = len(candidates)
        computed = 0
        
        phase2_groups = defaultdict(list)
        
        # 如果根本没有候选文件，也要确保广播一次 Phase2 的状态
        if total_candidates == 0:
            await manager.broadcast("scan", {
                "type": "scan_progress",
                "session_id": current_scan.session_id,
                "status": "phase2",
                "phase1": None,
                "phase2": {
                    "computed": 0,
                    "total_candidates": 0,
                    "percent": 100.0,
                    "current_file": "无匹配项"
                },
                "elapsed_sec": time.time() - current_scan.start_time,
                "remaining_estimate_sec": 0
            })
            await asyncio.sleep(0)

        for filepath, size, ctime, mtime in candidates:
            # Yield before each candidate for cancel responsiveness
            await asyncio.sleep(0)
            if current_scan.cancel_flag:
                current_scan.status = "cancelled"
                await manager.broadcast("scan", {"status": "cancelled", "session_id": current_scan.session_id})
                return
                
            sha256 = await get_sha256_async(filepath)
            # Re-check cancel after potentially slow I/O
            if current_scan.cancel_flag:
                current_scan.status = "cancelled"
                await manager.broadcast("scan", {"status": "cancelled", "session_id": current_scan.session_id})
                return
            if sha256:
                phase2_groups[sha256].append({
                    "path": filepath,
                    "size": size,
                    "created_time": ctime,
                    "modified_time": mtime,
                    "sha256": sha256
                })
                
            computed += 1
            percent = (computed / total_candidates) * 100 if total_candidates > 0 else 100
            elapsed = time.time() - current_scan.start_time
            remaining = (elapsed / percent * (100 - percent)) if percent > 0 else 0
            
            if computed % 10 == 0 or computed == total_candidates:
                await manager.broadcast("scan", {
                    "type": "scan_progress",
                    "session_id": current_scan.session_id,
                    "status": "phase2",
                    "phase1": None,
                    "phase2": {
                        "computed": computed,
                        "total_candidates": total_candidates,
                        "percent": percent,
                        "current_file": filepath
                    },
                    "elapsed_sec": elapsed,
                    "remaining_estimate_sec": remaining
                })
                await asyncio.sleep(0)

        # Save to DB
        duration = time.time() - current_scan.start_time
        
        group_id = 1
        db_files = []
        total_size = 0
        reclaimable_size = 0
        file_count = 0
        group_count = 0
        
        for sha256, files in phase2_groups.items():
            if len(files) >= 2:
                group_count += 1
                group_size = files[0]["size"]
                file_count += len(files)
                total_size += group_size * len(files)
                reclaimable_size += group_size * (len(files) - 1)
                
                for f in files:
                    db_files.append(ScanFile(
                        session_id=current_scan.session_id,
                        path=f["path"],
                        size=f["size"],
                        sha256=f["sha256"],
                        created_time=f["created_time"],
                        modified_time=f["modified_time"],
                        group_id=group_id
                    ))
                group_id += 1

        session_record = ScanSession(
            id=current_scan.session_id,
            scan_paths=json.dumps(scan_paths),
            status="done",
            created_at=datetime.utcfromtimestamp(current_scan.start_time),
            scanned_total=current_scan.scanned_total,
            file_count=file_count,
            group_count=group_count,
            total_size=total_size,
            reclaimable_size=reclaimable_size,
            finished_at=datetime.utcnow(),
            scan_duration_sec=duration
        )
        
        db.add(session_record)
        db.bulk_save_objects(db_files)
        db.commit()
        
        current_scan.status = "done"
        await manager.broadcast("scan", {"status": "done", "session_id": current_scan.session_id})
        
    except Exception as e:
        print(f"Scan error: {e}")
        current_scan.status = "error"
        # Rollback any pending transaction before trying to save error record
        db.rollback()
        session_record = ScanSession(
            id=current_scan.session_id,
            scan_paths=json.dumps(scan_paths),
            status="error",
            created_at=datetime.utcfromtimestamp(current_scan.start_time),
            scanned_total=current_scan.scanned_total,
            finished_at=datetime.utcnow()
        )
        db.add(session_record)
        db.commit()
        await manager.broadcast("scan", {"status": "error", "session_id": current_scan.session_id})
    finally:
        db.close()