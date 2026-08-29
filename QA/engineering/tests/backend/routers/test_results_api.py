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
    def test_get_summary(self, client, test_session, test_scan_files_group1, test_scan_files_group2):
        """GET /api/sessions/{id}/summary → 统计数据（按有效重复组实时计算）

        动态口径：group1(3 文件 x 1000) + group2(2 文件 x 2000)
        → 2 组 / 5 文件 / 总 7000 / 可释放 4000（每组保留一份）。
        scanned_total 为扫描时的历史事实，保持静态值。
        """
        resp = client.get(f"/api/sessions/{test_session.id}/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["scanned_total"] == 10
        assert data["group_count"] == 2
        assert data["file_count"] == 5
        assert data["total_size"] == 7000
        assert data["reclaimable_size"] == 4000

    def test_get_summary_not_found(self, client):
        """不存在的会话摘要 → 404"""
        resp = client.get(f"/api/sessions/{uuid.uuid4()}/summary")
        assert resp.status_code == 404

    # ── 动态统计口径（清理后数字自动更新）──

    def _cleanup_group1_partial(self, db_session, test_session):
        """模拟清理：将 group1 的 3 个文件移走 2 个（组剩 1 个成为孤儿）"""
        g1_files = db_session.query(ScanFile).filter(
            ScanFile.session_id == test_session.id, ScanFile.group_id == 1
        ).all()
        assert len(g1_files) == 3
        for f in g1_files[:2]:
            db_session.delete(f)
        db_session.commit()

    def test_summary_reflects_cleanup(self, client, db_session, test_session, test_scan_files_group1, test_scan_files_group2):
        """清理使组成为孤儿后，summary 不再统计该组（数字随清理收缩）"""
        self._cleanup_group1_partial(db_session, test_session)

        resp = client.get(f"/api/sessions/{test_session.id}/summary")
        data = resp.json()
        # 仅剩 group2（2 文件 x 2000）为有效组
        assert data["group_count"] == 1
        assert data["file_count"] == 2
        assert data["total_size"] == 4000
        assert data["reclaimable_size"] == 2000
        # 历史事实字段不受清理影响
        assert data["scanned_total"] == 10

    def test_sessions_list_dynamic_stats(self, client, db_session, test_session, test_scan_files_group1, test_scan_files_group2):
        """列表端点统计与 summary 一致（清理后同步收缩，不再显示老数字）"""
        self._cleanup_group1_partial(db_session, test_session)

        resp = client.get("/api/sessions/")
        target = next(s for s in resp.json() if s["id"] == test_session.id)
        assert target["group_count"] == 1
        assert target["file_count"] == 2
        assert target["total_size"] == 4000
        assert target["reclaimable_size"] == 2000

    def test_session_detail_dynamic_stats(self, client, test_session, test_scan_files_group1, test_scan_files_group2):
        """详情端点统计动态化，且其余字段完整保留"""
        resp = client.get(f"/api/sessions/{test_session.id}")
        data = resp.json()
        assert data["group_count"] == 2
        assert data["file_count"] == 5
        assert data["reclaimable_size"] == 4000
        # 历史事实字段保持静态原样
        assert data["scanned_total"] == 10
        assert data["scan_duration_sec"] == 1.5
        assert data["created_at"] is not None
        assert data["scan_paths"] is not None

    def test_summary_empty_session_stats_zero(self, client, test_session):
        """无文件记录的会话统计为全 0（不报错）"""
        resp = client.get(f"/api/sessions/{test_session.id}/summary")
        data = resp.json()
        assert data["group_count"] == 0
        assert data["file_count"] == 0
        assert data["total_size"] == 0
        assert data["reclaimable_size"] == 0

    def test_groups_excludes_orphan_groups(self, client, db_session, test_session, test_scan_files_group1, test_scan_files_group2):
        """组列表不返回只剩 1 个文件的孤儿组"""
        self._cleanup_group1_partial(db_session, test_session)

        resp = client.get(f"/api/sessions/{test_session.id}/groups?page=1&page_size=10")
        data = resp.json()["data"]
        assert [g["group_id"] for g in data] == [2]

    def test_dynamic_stats_equal_static_when_no_cleanup(self, client, db_session):
        """零跳变锁定：未清理时动态统计与扫描写入的静态值必然相等

        模拟真实扫描写入（静态字段按实际文件数据计算）：
        group1: 3x1000 + group2: 2x2000 → 2 组 / 5 文件 / 7000 / 4000。
        保证用户刚扫描完看列表时数字与扫描结果页一致。
        """
        session = ScanSession(
            id=f"sess-static-{uuid.uuid4().hex[:8]}",
            scan_paths=json.dumps([{"path": "/test", "is_exclude": False}]),
            status="done",
            scanned_total=10,
            file_count=5,
            group_count=2,
            total_size=7000,
            reclaimable_size=4000,
        )
        db_session.add(session)
        db_session.add_all([
            ScanFile(session_id=session.id, path="/test/photos/photo_a.jpg", size=1000, sha256="aaa", group_id=1),
            ScanFile(session_id=session.id, path="/test/backup/photo_a.jpg", size=1000, sha256="aaa", group_id=1),
            ScanFile(session_id=session.id, path="/test/tmp/photo_a.jpg", size=1000, sha256="aaa", group_id=1),
            ScanFile(session_id=session.id, path="/test/docs/report_v1.pdf", size=2000, sha256="bbb", group_id=2),
            ScanFile(session_id=session.id, path="/test/docs/report_v2.pdf", size=2000, sha256="bbb", group_id=2),
        ])
        db_session.commit()

        resp = client.get(f"/api/sessions/{session.id}/summary")
        data = resp.json()
        assert data["group_count"] == session.group_count == 2
        assert data["file_count"] == session.file_count == 5
        assert data["total_size"] == session.total_size == 7000
        assert data["reclaimable_size"] == session.reclaimable_size == 4000

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
