"""
执行操作 API 路由测试

覆盖范围：
  新增：移动到文件夹、移动到废纸篓、取消操作、参数验证
"""

import pytest
from app.services.action_engine import current_action


class TestActionAPI:
    """执行操作 API"""

    # ── 移动到文件夹 ──
    def test_move_to_folder_no_dest(self, client, test_session, test_scan_files_group1):
        """目标路径为空时返回错误"""
        resp = client.post(
            f"/api/sessions/{test_session.id}/action/move-to-folder",
            json={"category": "keep_one"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data

    def test_move_to_folder_invalid_category(self, client, test_session):
        """无效分类返回错误"""
        resp = client.post(
            f"/api/sessions/{test_session.id}/action/move-to-folder",
            json={"category": "invalid_cat", "dest_path": "/tmp"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data

    # ── 移动到废纸篓 ──
    def test_move_to_trash(self, client, test_session, test_scan_files_group1):
        """移动到废纸篓"""
        resp = client.post(
            f"/api/sessions/{test_session.id}/action/move-to-trash",
            json={"category": "keep_one"},
        )
        # 可能因为没有 delete 文件而移动 0 个
        assert resp.status_code == 200

    def test_move_to_trash_invalid_category(self, client, test_session):
        """无效分类返回错误"""
        resp = client.post(
            f"/api/sessions/{test_session.id}/action/move-to-trash",
            json={"category": "bad_cat"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data

    # ── 取消操作 ──
    def test_cancel_action_running(self, client, test_session):
        """取消正在运行的操作"""
        current_action.running = True
        current_action.session_id = test_session.id

        resp = client.post(f"/api/sessions/{test_session.id}/action/cancel")
        assert resp.status_code == 200
        assert current_action.cancel_flag is True

        current_action.running = False
        current_action.cancel_flag = False

    def test_cancel_action_no_active(self, client, test_session):
        """无活跃操作时取消"""
        current_action.running = False

        resp = client.post(f"/api/sessions/{test_session.id}/action/cancel")
        assert resp.status_code == 200
        assert "No active action" in resp.json()["message"]

    # ── reveal-file 端点 ──
    def test_reveal_file_not_found(self, client):
        """reveal 不存在的文件返回 404"""
        resp = client.post("/api/reveal-file", json={"path": "/nonexistent/file.txt"})
        assert resp.status_code == 404
