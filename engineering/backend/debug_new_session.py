from app.database import SessionLocal
from app.models import ScanSession, ScanFile, FileOverride
from app.services.scheme_engine import scheme_cache, SchemeEngine

db = SessionLocal()
id = "e5fa69a2-c491-4076-90c9-c18996a90912"

# 1. Reset overrides for this group
file1 = "/Users/charles_min/OneSync/CodingFiles/测试/排除文件夹测试_副本/扫描文件夹/1.dmg"
file2 = "/Users/charles_min/OneSync/CodingFiles/测试/排除文件夹测试_副本/扫描文件夹/排除文件夹/0.dmg"
db.query(FileOverride).filter(FileOverride.session_id == id).delete()
db.commit()

# 2. Generate cache (like get_categories)
engine = SchemeEngine(db, id)
scheme_cache.set(id, engine.generate_scheme())
print("Initial keep_all file_count:", scheme_cache.data["keep_all"]["file_count"])

# 3. Add override (like update_file_action)
db.add(FileOverride(session_id=id, file_path=file1, action="delete"))
db.add(FileOverride(session_id=id, file_path=file2, action="delete"))
db.commit()

# 4. Run update_file_action cache update logic
if scheme_cache.is_valid(id):
    engine2 = SchemeEngine(db, id)
    for cat_name, cat_data in scheme_cache.data.items():
        cat_data["file_count"] = 0
        cat_data["size"] = 0
        if not cat_data["groups"]: continue
        files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(cat_data["groups"])).all()
        for f in files:
            act = engine2.resolve_action(f.path)
            if act.action.value == "delete":
                cat_data["file_count"] += 1

print("Updated keep_all file_count:", scheme_cache.data["keep_all"]["file_count"])
