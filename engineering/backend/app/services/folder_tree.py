import os
import json
from sqlalchemy.orm import Session
from app.models import ScanFile, ScanSession

def get_folder_tree(db: Session, session_id: str, parent: str):
    # This needs to return direct child directories of `parent`
    # and their stats (N files, N groups) based on `ScanFile` table.
    
    # 1. Fetch all file paths for this session
    # In a real large DB, we'd use SQL aggregation, but for simplicity we'll fetch paths.
    files = db.query(ScanFile.path, ScanFile.group_id).filter(ScanFile.session_id == session_id).all()
    
    if parent == "roots":
        session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        raw_roots = []
        if session and session.scan_paths:
            paths = json.loads(session.scan_paths)
            raw_roots = [p["path"] for p in paths if not p.get("is_exclude", False)]
            
        unique_roots = []
        for r in raw_roots:
            clean_r = r.rstrip("/") if r != "/" else r
            if clean_r not in unique_roots:
                unique_roots.append(clean_r)
                
        roots = unique_roots
        if not roots:
            roots = ["/"]
            
        children_stats = {}
        for r in roots:
            name = os.path.basename(r)
            if not name:
                name = r
            children_stats[r] = {"name": name, "path": r, "files": 0, "groups": set()}
            
        for path, group_id in files:
            for r in roots:
                r_prefix = r if r.endswith("/") else r + "/"
                if path == r or path.startswith(r_prefix):
                    children_stats[r]["files"] += 1
                    children_stats[r]["groups"].add(group_id)
                    
        result = []
        for stat in children_stats.values():
            if stat["files"] > 0:
                result.append({
                    "name": stat["name"] if stat["name"] else "/",
                    "path": stat["path"],
                    "n_files": stat["files"],
                    "n_groups": len(stat["groups"]),
                    "has_children": True 
                })
        result.sort(key=lambda x: x["name"])
        return result

    # We want directories that are direct children of `parent`
    # and their stats.
    # parent = "/" or "/nas/photos"
    
    children_stats = {}
    
    for path, group_id in files:
        if parent == "/" or path.startswith(parent + "/"):
            # find the child dir
            rel_path = path[len(parent):] if parent != "/" else path
            if rel_path.startswith("/"):
                rel_path = rel_path[1:]
                
            parts = rel_path.split("/")
            if len(parts) > 1: # It's a directory
                child_name = parts[0]
                child_path = os.path.join(parent, child_name) if parent != "/" else "/" + child_name
                
                if child_path not in children_stats:
                    children_stats[child_path] = {"name": child_name, "path": child_path, "files": 0, "groups": set()}
                    
                children_stats[child_path]["files"] += 1
                children_stats[child_path]["groups"].add(group_id)
                
    # Format output
    result = []
    for stat in children_stats.values():
        result.append({
            "name": stat["name"],
            "path": stat["path"],
            "n_files": stat["files"],
            "n_groups": len(stat["groups"]),
            "has_children": True # simplify, assume yes
        })
        
    # Sort by pure alphabet
    result.sort(key=lambda x: x["name"])
    return result

