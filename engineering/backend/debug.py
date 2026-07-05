from app.database import SessionLocal
from app.models import ScanSession, ScanFile, FileOverride
from app.services.scheme_engine import scheme_cache, SchemeEngine

db = SessionLocal()
id = "5db9f58a-aeed-4f86-ba20-578950ff4cd4"

session = db.query(ScanSession).filter(ScanSession.id == id).first()
if not session:
    print("Session not found")
else:
    print("Session found:", id)

engine = SchemeEngine(db, id)
scheme = engine.generate_scheme()
print("Generated scheme file_counts:")
for k, v in scheme.items():
    print(f"  {k}: {v['file_count']} files, {len(v['groups'])} groups")

