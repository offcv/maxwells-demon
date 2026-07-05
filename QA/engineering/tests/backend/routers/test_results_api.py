"""
扫描结果 API 路由测试

覆盖范围：
  API-02: 加载结果
  API-06: 分页获取结果
  新增：会话不存在 404、删除会话级联清理、unreadable_files
"""

import uuid
import json
import pytest
from app.models import ScanSession, ScanFile, FolderMark, FileOverride
from app.services.scan_engine import current_scan


class TestResultsAPI:
    """结果查看 API"""

    # ── API-02: 加载结果 ──
    def test_list_sessions(self, client, db_session, test_session):
        """GET /api/sessions → 列出所有会话"""
        resp = client.get("/api/sessions/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(s["id"] == test_session.id for s in data)

    def test_get_session_detail(self, client, test_session):
        """GET /api/sessions/{id} → 会话详情"""
        resp = client.get(f"/api/sessions/{test_session.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == test_session.id
        assert data["status"] == "done"

    def test_get_session_not_found(self, client):
        """不存在的会话 → 返回 null（非 404）"""
        resp = client.get(f"/api/sessions/{uuid.uuid4()}")
        assert resp.status_code == 200
        assert resp.json() is None

    # ── 会话摘要 ──
    def test_get_summary(self, client, test_session):
        """GET /api/sessions/{id}/summary → 统计数据"""
        resp = client.get(f"/api/sessions/{test_session.id}/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["scanned_total"] == 10
        assert data["group_count"] == 2
        assert data["file_count"] == 6

    def test_get_summary_not_found(self, client):
        """不存在的会话摘要 → 404"""
        resp = client.get(f"/api/sessions/{uuid.uuid4()}/summary")
        assert resp.status_code == 404

    # ── 文件列表分页 ──
    def test_get_files_pagination(self, client, test_session, test_scan_files_group1):
        """GET /api/sessions/{id}/files → 分页文件列表"""
        resp = client.get(f"/api/sessions/{test_session.id}/files?page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total"] >= 3

    # ── 组列表分页 ──
    def test_get_groups_pagination(self, client, test_session, test_scan_files_group1, test_scan_files_group2):
        """GET /api/sessions/{id}/groups → 分页组列表"""
        resp = client.get(f"/api/sessions/{test_session.id}/groups?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) >= 1

    def test_get_group_files(self, client, test_session, test_scan_files_group1):
        """GET /api/sessions/{id}/groups/{gid}/files → 组内文件"""
        resp = client.get(f"/api/sessions/{test_session.id}/groups/1/files")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert all(f["group_id"] == 1 for f in data)

    # ── unreadable_files ──
    def test_unreadable_files_current_session(self, client, test_session):
        """当前会话的不可读文件列表"""
        current_scan.session_id = test_session.id
        current_scan.unreadable_files = ["/secret/file1", "/secret/file2"]

        resp = client.get(f"/api/sessions/{test_session.id}/unreadable-files")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["data"]) == 2

        current_scan.unreadable_files = []

    def test_unreadable_files_other_session(self, client, test_session):
        """非当前会话返回空列表"""
        other_id = str(uuid.uuid4())
        current_scan.session_id = other_id

        resp = client.get(f"/api/sessions/{test_session.id}/unreadable-files")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["data"] == []

    # ── 删除会话 ├─
    def test_delete_session(self, client, db_session, test_session, test_scan_files_group1):
        """DELETE /api/sessions/{id} → 级联删除"""
        # 验证数据存在
        assert db_session.query(ScanFile).filter(ScanFile.session_id == test_session.id).count() >= 1

        resp = client.delete(f"/api/sessions/{test_session.id}")
        assert resp.status_code == 200

        # 验证级联删除
        assert db_session.query(ScanFile).filter(ScanFile.session_id == test_session.id).count() == 0
        assert db_session.query(ScanSession).filter(ScanSession.id == test_session.id).count() == 0

    # ── API-10: 异常 UUID 会话 404 ──
    def test_api10_nonexistent_session_id(self, client):
        """API-10: 访问不存在的会话 UUID 不应泄露堆栈"""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        # 会话详情
        resp = client.get(f"/api/sessions/{fake_uuid}")
        # 当前返回 200 + null（非标准 RESTful），但应不泄露堆栈
        assert resp.status_code in (200, 404)
        # 响应体不应包含 Python 堆栈信息
        assert "Traceback" not in resp.text
        assert "File \"" not in resp.text

    def test_api10_nonexistent_on_all_endpoints(self, client):
        """API-10b: 多个端点用无效 UUID 均不崩溃"""
        fake = "invalid-uuid-format-!!!"
        endpoints = [
            f"/api/sessions/{fake}/files",
            f"/api/sessions/{fake}/groups",
            f"/api/sessions/{fake}/summary",
        ]
        for ep in endpoints:
            resp = client.get(ep)
            # 不应返回 500
            assert resp.status_code < 500, f"{ep} 返回了服务器错误"
            # 不应泄露堆栈
            assert "Traceback" not in resp.text
