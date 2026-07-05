from app.database import SessionLocal
from app.services.scheme_engine import scheme_cache, SchemeEngine
from app.models import ScanFile, FileOverride

db = SessionLocal()
id = "5db9f58a-aeed-4f86-ba20-578950ff4cd4"

# Delete overrides to simulate initial state
db.query(FileOverride).delete()
db.commit()

# Generate initial cache
engine = SchemeEngine(db, id)
initial_scheme = engine.generate_scheme()
scheme_cache.set(id, initial_scheme)
print("Initial keep_all groups:", scheme_cache.data["keep_all"]["groups"])
print("Initial keep_all file_count:", scheme_cache.data["keep_all"]["file_count"])

# Simulate user clicking checkboxes
override1 = FileOverride(session_id=id, file_path="/Users/charles_min/OneSync/CodingFiles/测试/排除文件夹测试/扫描文件夹/1.dmg", action="delete")
override2 = FileOverride(session_id=id, file_path="/Users/charles_min/OneSync/CodingFiles/测试/排除文件夹测试/扫描文件夹/排除文件夹/0.dmg", action="delete")
db.add(override1)
db.add(override2)
db.commit()

# Run update_file_action logic
engine2 = SchemeEngine(db, id)
for cat_name, cat_data in scheme_cache.data.items():
    cat_data["file_count"] = 0
    cat_data["size"] = 0
    if not cat_data["groups"]:
        continue
    files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(cat_data["groups"])).all()
    for f in files:
        act = engine2.resolve_action(f.path)
        if act.action.value == "delete":
            cat_data["file_count"] += 1
            cat_data["size"] += f.size

print("Updated keep_all file_count:", scheme_cache.data["keep_all"]["file_count"])
