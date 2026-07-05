from app.database import SessionLocal
from app.services.scheme_engine import scheme_cache, SchemeEngine
from app.models import ScanFile, FileOverride

db = SessionLocal()
id = "5db9f58a-aeed-4f86-ba20-578950ff4cd4"

# 1. 制造一个初始状态（没有 override）
db.query(FileOverride).delete()
db.commit()

# 2. 生成初始缓存
engine = SchemeEngine(db, id)
scheme = engine.generate_scheme()
scheme_cache.set(id, scheme)
print("Initial keep_all file_count:", scheme_cache.data["keep_all"]["file_count"])

# 3. 模拟前端修改文件
override = FileOverride(session_id=id, file_path="/Users/charles_min/OneSync/CodingFiles/测试/排除文件夹测试/扫描文件夹/1.dmg", action="delete")
db.add(override)
db.commit()

# 4. 执行我修改后的 update_file_action 的缓存同步代码
if scheme_cache.is_valid(id):
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
