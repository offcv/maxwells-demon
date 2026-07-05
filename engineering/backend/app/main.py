import subprocess, sys, os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.database import engine, Base
from app.routers import scan, results, folders, scheme, action, ws_routes

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="麦克斯韦妖 API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_routes.router, tags=["websocket"])
app.include_router(scan.router, prefix="/api/scan", tags=["scan"])
app.include_router(results.router, prefix="/api/sessions", tags=["results"])
app.include_router(folders.router, prefix="/api", tags=["folders"])
app.include_router(scheme.router, prefix="/api/sessions", tags=["scheme"])
app.include_router(action.router, prefix="/api/sessions", tags=["action"])

class RevealPath(BaseModel):
    path: str

@app.post("/api/reveal-file")
def reveal_file(data: RevealPath):
    """在系统文件管理器中打开文件所在目录"""
    path = data.path
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-R", path])
        elif sys.platform == "linux":
            parent = os.path.dirname(path)
            subprocess.Popen(["xdg-open", parent])
        return {"message": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "麦克斯韦妖 API is running"}
