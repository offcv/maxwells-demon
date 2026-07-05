from app.database import SessionLocal
from app.models import ScanSession, ScanFile, FileOverride
from app.services.scheme_engine import scheme_cache, SchemeEngine

db = SessionLocal()
id = "e5fa69a2-c491-4076-90c9-c18996a90912"

engine = SchemeEngine(db, id)
scheme = engine.generate_scheme()

for cat_name, cat_data in scheme.items():
    if not cat_data["groups"]: continue
    print(f"Cat: {cat_name}")
    for gid in cat_data["groups"]:
        print(f"  Group {gid}")
        files = db.query(ScanFile).filter(ScanFile.session_id == id, ScanFile.group_id == gid).all()
        for f in files:
            act = engine.resolve_action(f.path)
            print(f"    {f.path} -> {act.action.value}")
