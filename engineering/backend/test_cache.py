from app.database import SessionLocal
from app.services.scheme_engine import scheme_cache, SchemeEngine
from app.models import ScanFile

db = SessionLocal()
id = "5db9f58a-aeed-4f86-ba20-578950ff4cd4"

print("Is cache valid?", scheme_cache.is_valid(id))

# Let's force load the cache if it's invalid
if not scheme_cache.is_valid(id):
    engine = SchemeEngine(db, id)
    scheme_cache.set(id, engine.generate_scheme())
    print("Cache loaded")

print("Before:", scheme_cache.data["keep_all"]["file_count"])

engine = SchemeEngine(db, id)
for cat_name, cat_data in scheme_cache.data.items():
    cat_data["file_count"] = 0
    cat_data["size"] = 0
    if not cat_data["groups"]:
        continue
    files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id.in_(cat_data["groups"])).all()
    print(f"Cat {cat_name} has {len(files)} files")
    for f in files:
        act = engine.resolve_action(f.path)
        print(f"File {f.path} action: {act.action.value}")
        if act.action.value == "delete":
            cat_data["file_count"] += 1
            cat_data["size"] += f.size

print("After:", scheme_cache.data["keep_all"]["file_count"])
