import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../engineering/backend')))
"""
麦克斯韦妖 后端测试共享 fixtures

提供：
- 内存 SQLite 数据库
- FastAPI TestClient
- 临时文件系统（用于扫描/移动测试）
- 预置测试数据（会话、文件记录、文件夹标记、文件覆盖）
- WebSocket Manager 模拟
"""

import os
import sys
import json
import uuid
import time
import pytest
import tempfile
import shutil
from typing import Generator, List, Dict
from datetime import datetime

# ── 确保 backend 包可导入 ──────────────────────────────────────────────
BACKEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backend",
)
sys.path.insert(0, BACKEND_DIR)

# ── 在 import 任何 app 模块之前先 mock 配置 ────────────────────────────
os.environ["DOCKER_MODE"] = "false"

import tempfile

# 使用临时文件数据库代替 :memory:，因为 SQLite 的 :memory: 每个连接独立
_test_db_path = tempfile.mktemp(suffix="_maxwells_demon_test.db")
_test_db_url = f"sqlite:///{_test_db_path}"

import app.config as cfg
cfg.settings.DB_PATH = _test_db_url

# ── 屏蔽 WebSocket 广播 ───────────────────────────────────────────────
import app.ws.manager as ws_mgr
from fastapi import WebSocket
from typing import Any

class FakeConnectionManager:
    """Mock 版 WebSocket 管理器，避免测试中产生真实 WS 连接"""

    def __init__(self):
        self.broadcast_history: List[Dict[str, Any]] = []

    async def connect(self, websocket: WebSocket, channel: str):
        pass

    def disconnect(self, websocket: WebSocket, channel: str):
        pass

    async def broadcast(self, channel: str, message: dict):
        self.broadcast_history.append({"channel": channel, **message})

    @property
    def active_connections(self):
        return {"scan": [], "action": []}

# ── 重要：在 app 模块被 import 前替换掉 manager ──────────────────────
fake_manager = FakeConnectionManager()
ws_mgr.manager = fake_manager  # type: ignore

# ── 现在可以安全地 import app 模块 ─────────────────────────────────────
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from app.database import Base, get_db
from app.main import app
from app.models import (
    ScanSession,
    ScanFile,
    FolderMark,
    FileOverride,
    FileAction,
    FileActionType,
    MarkSourceType,
)
from app.services.scan_engine import current_scan
from app.services.scheme_engine import current_scheme, scheme_cache
from app.services.action_engine import current_action

# ── 重置各全局状态 ────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def reset_global_state():
    """每个测试自动重置全局单例状态"""
    current_scan.status = "idle"
    current_scan.cancel_flag = False
    current_scan.scanned_total = 0
    current_scan.session_id = None
    current_scan.unreadable_files = []
    current_scheme.status = "idle"
    current_scheme.processed = 0
    current_scheme.total = 0
    scheme_cache.clear()
    current_action.session_id = None
    current_action.cancel_flag = False
    current_action.running = False
    yield

# ── 测试数据库 ────────────────────────────────────────────────────────
# 重用 app.database 的 SessionLocal (绑定到文件数据库)，
# 确保 scan_engine.py 直接调用的 SessionLocal() 与测试 fixtures 使用同一个数据库
from app.database import SessionLocal as AppSessionLocal

TestingSessionLocal = AppSessionLocal


def override_get_db() -> Generator[Session, None, None]:
    """覆盖 FastAPI 的 get_db 依赖"""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """提供独立的数据库会话"""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def cleanup_db():
    """测试会话结束后清理临时数据库文件"""
    yield
    import os
    if os.path.exists(_test_db_path):
        os.unlink(_test_db_path)


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """提供独立的数据库会话"""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── FastAPI TestClient ──────────────────────────────────────────────
@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """提供 FastAPI 测试客户端"""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def fake_ws() -> FakeConnectionManager:
    """获取 FakeConnectionManager 实例，可检查 broadcast_history"""
    return fake_manager


# ── 临时文件系统 ──────────────────────────────────────────────────────
@pytest.fixture
def tmp_fs() -> Generator[str, None, None]:
    """创建临时根目录，返回路径"""
    tmpdir = tempfile.mkdtemp(suffix="_maxwells_demon_test")
    yield tmpdir
    shutil.rmtree(tmpdir, ignore_errors=True)


def create_file(path: str, content: str = "test", size: int = None) -> str:
    """
    在指定路径创建文件。
    如果指定了 size，则用随机字节填充到指定大小。
    否则写入 content 字符串。
    """
    parent = os.path.dirname(path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)
    if size is not None:
        with open(path, "wb") as f:
            f.write(os.urandom(size))
    else:
        with open(path, "w") as f:
            f.write(content)
    return path


# ── 预置测试数据 ──────────────────────────────────────────────────────
@pytest.fixture
def test_session(db_session: Session) -> ScanSession:
    """创建一个基本的扫描会话记录"""
    session = ScanSession(
        id=str(uuid.uuid4()),
        scan_paths=json.dumps([{"path": "/test", "is_exclude": False}]),
        status="done",
        scanned_total=10,
        file_count=6,
        group_count=2,
        total_size=6000,
        reclaimable_size=4000,
        created_at=datetime.utcnow(),
        finished_at=datetime.utcnow(),
        scan_duration_sec=1.5,
    )
    db_session.add(session)
    db_session.commit()
    return session


@pytest.fixture
def test_scan_files_group1(db_session: Session, test_session: ScanSession) -> List[ScanFile]:
    """创建重复组 #1 的 3 个重复文件（2 delete + 1 keep）"""
    files = [
        ScanFile(
            session_id=test_session.id,
            path="/test/photos/photo_a.jpg",
            size=1000,
            sha256="aaa",
            created_time=1000.0,
            modified_time=2000.0,
            group_id=1,
        ),
        ScanFile(
            session_id=test_session.id,
            path="/test/backup/photo_a.jpg",
            size=1000,
            sha256="aaa",
            created_time=1000.0,
            modified_time=2000.0,
            group_id=1,
        ),
        ScanFile(
            session_id=test_session.id,
            path="/test/tmp/photo_a.jpg",
            size=1000,
            sha256="aaa",
            created_time=1000.0,
            modified_time=2000.0,
            group_id=1,
        ),
    ]
    db_session.add_all(files)
    db_session.commit()
    return files


@pytest.fixture
def test_scan_files_group2(db_session: Session, test_session: ScanSession) -> List[ScanFile]:
    """创建重复组 #2 的 2 个重复文件（1 delete + 1 keep）"""
    files = [
        ScanFile(
            session_id=test_session.id,
            path="/test/docs/report_v1.pdf",
            size=2000,
            sha256="bbb",
            created_time=3000.0,
            modified_time=4000.0,
            group_id=2,
        ),
        ScanFile(
            session_id=test_session.id,
            path="/test/docs/report_v2.pdf",
            size=2000,
            sha256="bbb",
            created_time=3000.0,
            modified_time=4000.0,
            group_id=2,
        ),
    ]
    db_session.add_all(files)
    db_session.commit()
    return files


@pytest.fixture
def test_folder_marks(db_session: Session, test_session: ScanSession) -> Dict[str, FolderMark]:
    """创建文件夹标记：
    /test/photos → keep
    /test/backup → delete
    """
    marks = {
        "keep_photos": FolderMark(session_id=test_session.id, path="/test/photos", mark="keep"),
        "delete_backup": FolderMark(session_id=test_session.id, path="/test/backup", mark="delete"),
    }
    db_session.add_all(marks.values())
    db_session.commit()
    return marks


@pytest.fixture
def test_file_overrides(db_session: Session, test_session: ScanSession) -> List[FileOverride]:
    """创建文件级覆盖：
    /test/tmp/photo_a.jpg → delete（覆盖文件夹继承）
    """
    overrides = [
        FileOverride(
            session_id=test_session.id,
            file_path="/test/tmp/photo_a.jpg",
            action="delete",
            updated_at=datetime.utcnow(),
        ),
    ]
    db_session.add_all(overrides)
    db_session.commit()
    return overrides


@pytest.fixture
def full_test_data(
    db_session: Session,
    test_session: ScanSession,
    test_scan_files_group1: List[ScanFile],
    test_scan_files_group2: List[ScanFile],
    test_folder_marks: Dict[str, FolderMark],
    test_file_overrides: List[FileOverride],
):
    """组合所有测试数据，模拟完整扫描后的场景"""
    return {
        "session": test_session,
        "group1": test_scan_files_group1,
        "group2": test_scan_files_group2,
        "marks": test_folder_marks,
        "overrides": test_file_overrides,
    }


# ── 工具函数：生成测试用重复文件对 ─────────────────────────────────────
@pytest.fixture
def dup_file_pair(tmp_fs: str) -> Dict[str, str]:
    """
    在 tmp_fs 下创建一对内容完全相同的文件。
    返回 {"a": "/path/to/a.txt", "b": "/path/to/b.txt"}
    """
    content = "duplicate content " + str(uuid.uuid4())
    a = create_file(os.path.join(tmp_fs, "a.txt"), content)
    b = create_file(os.path.join(tmp_fs, "b.txt"), content)
    return {"a": a, "b": b}


@pytest.fixture
def tmp_scan_paths(tmp_fs: str) -> list:
    """生成符合 scan_paths 格式的路径列表"""
    return [{"path": tmp_fs, "is_exclude": False}]
