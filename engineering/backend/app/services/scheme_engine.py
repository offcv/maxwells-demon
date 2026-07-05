import os
import asyncio
from collections import defaultdict
from sqlalchemy.orm import Session
from app.models import ScanFile, FolderMark, FileOverride, FileAction, FileActionType, MarkSourceType
from app.ws.manager import manager

class CachedScheme:
    """缓存方案生成结果，确保手动调整不重分类"""
    def __init__(self):
        self.data = None  # 缓存的分类数据
        self.session_id = None  # 所属会话ID

    def is_valid(self, session_id: str) -> bool:
        return self.session_id == session_id and self.data is not None

    def set(self, session_id: str, data: dict):
        self.session_id = session_id
        self.data = data

    def clear(self):
        self.data = None
        self.session_id = None

class SchemeState:
    def __init__(self):
        self.status = "idle"  # idle, running, done, error
        self.processed = 0
        self.total = 0

current_scheme = SchemeState()
scheme_cache = CachedScheme()

class SchemeEngine:
    def __init__(self, db: Session, session_id: str):
        self.db = db
        self.session_id = session_id
        
        # Load overrides
        overrides = db.query(FileOverride).filter(FileOverride.session_id == session_id).all()
        self.overrides_map = {o.file_path: o.action for o in overrides}
        
        # Load folder marks
        marks = db.query(FolderMark).filter(FolderMark.session_id == session_id).all()
        self.marks_map = {m.path: m.mark for m in marks}

    def resolve_action(self, filepath: str) -> FileAction:
        # 1. Check overrides
        if filepath in self.overrides_map:
            act = self.overrides_map[filepath]
            return FileAction(
                path=filepath,
                action=FileActionType(act),
                mark_source_type=MarkSourceType.OVERRIDE,
                mark_source="override"
            )
            
        # 2. Check folder marks inheritance
        current_dir = os.path.dirname(filepath)
        while current_dir and current_dir != "/":
            if current_dir in self.marks_map:
                act = self.marks_map[current_dir]
                return FileAction(
                    path=filepath,
                    action=FileActionType(act),
                    mark_source_type=MarkSourceType.FOLDER_MARK,
                    mark_source=f"inherited:{current_dir}"
                )
            parent = os.path.dirname(current_dir)
            if parent == current_dir:
                break
            current_dir = parent
            
        # 3. Default keep
        return FileAction(
            path=filepath,
            action=FileActionType.KEEP,
            mark_source_type=MarkSourceType.DEFAULT,
            mark_source="default:keep"
        )

    def generate_scheme(self):
        files = self.db.query(ScanFile).filter(ScanFile.session_id == self.session_id).all()
        
        groups = defaultdict(list)
        for f in files:
            groups[f.group_id].append(f)
            
        categories = {
            "keep_one": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "partial_keep": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "keep_all": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "delete_all": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0}
        }
        
        # Base classification uses initial categorization without manual overrides causing re-categorization?
        # Specification says: "组分类不变：该组仍然属于原来的分类... 统计数字始终基于方案生成时的初始分类，不会随手动调整而更新"
        # Since this method generates the scheme based on CURRENT marks, it IS the initial categorization for the current run.
        # But wait: "若用户返回标记页修改了文件夹标记并重新调用 /scheme/generate，分类将基于最新标记完全重新计算。"
        # Yes, so generate_scheme evaluates current overrides and marks.
        
        for group_id, group_files in groups.items():
            total = len(group_files)
            if total <= 1:
                continue

            keep_count = 0
            delete_files_count = 0
            delete_size_sum = 0
            total_size_sum = 0
            
            for f in group_files:
                total_size_sum += f.size
                action = self.resolve_action(f.path)
                if action.action == FileActionType.KEEP:
                    keep_count += 1
                else:
                    delete_files_count += 1
                    delete_size_sum += f.size
                    
            total = len(group_files)
            
            if keep_count == 1:
                cat = "keep_one"
            elif 1 < keep_count < total:
                cat = "partial_keep"
            elif keep_count == total:
                cat = "keep_all"
            else:
                cat = "delete_all"
                
            categories[cat]["groups"].append(group_id)
            categories[cat]["file_count"] += delete_files_count
            categories[cat]["size"] += delete_size_sum
            categories[cat]["total_file_count"] += total
            categories[cat]["total_size"] += total_size_sum
            
        return categories

async def generate_scheme_async(session_id: str):
    from app.database import SessionLocal
    global current_scheme
    current_scheme.status = "running"
    current_scheme.processed = 0
    
    db = SessionLocal()
    try:
        engine = SchemeEngine(db, session_id)
        
        # Count total groups
        files = db.query(ScanFile).filter(ScanFile.session_id == session_id).all()
        groups = defaultdict(list)
        for f in files:
            groups[f.group_id].append(f)
        total_groups = len(groups)
        current_scheme.total = total_groups
        
        categories = {
            "keep_one": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "partial_keep": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "keep_all": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "delete_all": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0}
        }
        
        import time
        start_time = time.time()
        processed = 0
        for group_id, group_files in groups.items():
            total = len(group_files)
            if total <= 1:
                processed += 1
                continue

            keep_count = 0
            delete_files_count = 0
            delete_size_sum = 0
            total_size_sum = 0
            
            for f in group_files:
                total_size_sum += f.size
                action = engine.resolve_action(f.path)
                if action.action == FileActionType.KEEP:
                    keep_count += 1
                else:
                    delete_files_count += 1
                    delete_size_sum += f.size
            
            total = len(group_files)
            
            if keep_count == 1:
                cat = "keep_one"
            elif 1 < keep_count < total:
                cat = "partial_keep"
            elif keep_count == total:
                cat = "keep_all"
            else:
                cat = "delete_all"
            
            categories[cat]["groups"].append(group_id)
            categories[cat]["file_count"] += delete_files_count
            categories[cat]["size"] += delete_size_sum
            categories[cat]["total_file_count"] += total
            categories[cat]["total_size"] += total_size_sum
            
            processed += 1
            if processed % 5 == 0 or processed == total_groups:
                percent = (processed / total_groups) * 100 if total_groups > 0 else 100
                elapsed = time.time() - start_time
                remaining = (elapsed / percent * (100 - percent)) if percent > 0 else 0
                current_scheme.processed = processed
                await manager.broadcast("scan", {
                    "type": "scheme_progress",
                    "session_id": session_id,
                    "stage": "应用文件夹标记",
                    "processed": processed,
                    "total": total_groups,
                    "percent": percent,
                    "elapsed_sec": elapsed,
                    "remaining_estimate_sec": remaining
                })
                await asyncio.sleep(0)
        
        current_scheme.status = "done"
        # 缓存生成的分类结果，供后续 GET /categories 使用
        scheme_cache.set(session_id, categories)
        
        # 更新数据库中该会话的 finished_at 为当前时间，作为"最后更新时间"
        from datetime import datetime
        from app.models import ScanSession
        session_record = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if session_record:
            session_record.finished_at = datetime.utcnow()
            db.commit()
        
        await manager.broadcast("scan", {
            "type": "scheme_progress",
            "session_id": session_id,
            "status": "done",
            "processed": total_groups,
            "total": total_groups,
            "percent": 100.0
        })
        
        db.close()
        return categories
        
    except Exception as e:
        print(f"Scheme generation error: {e}")
        current_scheme.status = "error"
        await manager.broadcast("scan", {
            "type": "scheme_progress",
            "session_id": session_id,
            "status": "error"
        })
        db.close()
        return None
