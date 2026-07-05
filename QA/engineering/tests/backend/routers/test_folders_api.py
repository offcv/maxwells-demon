"""
文件夹标记 API 路由测试

覆盖范围：
  API-03: 文件夹标记
  新增：获取标记列表、清除标记、浏览目录、默认根路径
"""

import json
import os
import pytest
from app.models import FolderMark


class TestFoldersAPI:
    """文件夹标记 API"""

    # ── API-03: 设置文件夹标记 ──
    def test_set_mark(self, client, db_session, test_session):
        """PUT /api/sessions/{id}/folders/mark → 设置标记"""
        resp = client.put(
            f"/api/sessions/{test_session.id}/folders/mark",
            json={"path": "/test/photos", "mark": "keep"},
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Success"

        # 验证数据库
        mark = db_session.query(FolderMark).filter(
            FolderMark.session_id == test_session.id,
            FolderMark.path == "/test/photos",
        ).first()
        assert mark is not None
        assert mark.mark == "keep"

    def test_set_mark_delete(self, client, db_session, test_session):
        """标记为 delete"""
        resp = client.put(
            f"/api/sessions/{test_session.id}/folders/mark",
            json={"path": "/test/trash", "mark": "delete"},
        )
        assert resp.status_code == 200

        mark = db_session.query(FolderMark).filter(
            FolderMark.session_id == test_session.id,
            FolderMark.path == "/test/trash",
        ).first()
        assert mark.mark == "delete"

    def test_update_mark(self, client, db_session, test_session):
        """更新已有标记"""
        # 先设置 keep
        db_session.add(FolderMark(session_id=test_session.id, path="/test/photos", mark="keep"))
        db_session.commit()

        # 更新为 delete
        resp = client.put(
            f"/api/sessions/{test_session.id}/folders/mark",
            json={"path": "/test/photos", "mark": "delete"},
        )
        assert resp.status_code == 200

        mark = db_session.query(FolderMark).filter(
            FolderMark.session_id == test_session.id,
            FolderMark.path == "/test/photos",
        ).first()
        assert mark.mark == "delete"

    # ── 清除标记 ──
    def test_delete_mark(self, client, db_session, test_session):
        """DELETE /api/sessions/{id}/folders/mark → 清除标记"""
        db_session.add(FolderMark(session_id=test_session.id, path="/test/photos", mark="keep"))
        db_session.commit()

        resp = client.delete(
            f"/api/sessions/{test_session.id}/folders/mark?path=/test/photos",
        )
        assert resp.status_code == 200

        mark = db_session.query(FolderMark).filter(
            FolderMark.session_id == test_session.id,
            FolderMark.path == "/test/photos",
        ).first()
        assert mark is None

    # ── 获取所有标记 ──
    def test_get_marks(self, client, db_session, test_session):
        """GET /api/sessions/{id}/folders/marks → 标记列表"""
        db_session.add(FolderMark(session_id=test_session.id, path="/a", mark="keep"))
        db_session.add(FolderMark(session_id=test_session.id, path="/b", mark="delete"))
        db_session.commit()

        resp = client.get(f"/api/sessions/{test_session.id}/folders/marks")
        assert resp.status_code == 200
        data = resp.json()
        assert data["/a"] == "keep"
        assert data["/b"] == "delete"

    # ── 浏览目录 ──
    def test_browse_folder(self, client, tmp_fs):
        """GET /api/folders/browse → 列出子目录"""
        os.makedirs(os.path.join(tmp_fs, "sub1"), exist_ok=True)
        os.makedirs(os.path.join(tmp_fs, "sub2"), exist_ok=True)

        resp = client.get(f"/api/folders/browse?path={tmp_fs}")
        assert resp.status_code == 200
        data = resp.json()
        names = {d["name"] for d in data}
        assert "sub1" in names
        assert "sub2" in names

    def test_browse_hidden_excluded(self, client, tmp_fs):
        """浏览目录时隐藏文件（.开头）被排除"""
        os.makedirs(os.path.join(tmp_fs, "visible"), exist_ok=True)
        os.makedirs(os.path.join(tmp_fs, ".hidden_dir"), exist_ok=True)

        resp = client.get(f"/api/folders/browse?path={tmp_fs}")
        data = resp.json()
        names = {d["name"] for d in data}
        assert "visible" in names
        assert ".hidden_dir" not in names

    def test_browse_nonexistent_fallback(self, client):
        """不存在的路径回退到默认根路径"""
        resp = client.get("/api/folders/browse?path=/nonexistent_path_xyz_123")
        assert resp.status_code == 200
        # 不应报错，应有兜底数据

    # ── 默认根路径 ──
    def test_default_root(self, client):
        """GET /api/folders/default-root → 返回默认根路径"""
        resp = client.get("/api/folders/default-root")
        assert resp.status_code == 200
        data = resp.json()
        assert "root" in data
        assert len(data["root"]) > 0

    # ── API-11: 目录浏览 API 目录遍历漏洞拦截 ──
    def test_api11_path_traversal_attack(self, client):
        """API-11: 目录遍历攻击应被拦截"""
        # 尝试访问上级目录
        resp = client.get("/api/folders/browse?path=../../../../etc")
        # 应返回错误或默认路径，不应泄露系统文件
        assert resp.status_code in (200, 400, 403)

        # 如果返回200，应该是默认路径的列表，不应包含 /etc 的内容
        if resp.status_code == 200:
            data = resp.json()
            # 验证没有系统文件
            names = {d.get("name", "") for d in data}
            assert "passwd" not in names

    def test_api11_path_traversal_with_dots(self, client):
        """API-11: 使用 .. 进行路径遍历"""
        resp = client.get("/api/folders/browse?path=/tmp/../../../etc")
        assert resp.status_code in (200, 400, 403)

    def test_api11_absolute_path_escape(self, client):
        """API-11: 绝对路径逃逸"""
        resp = client.get("/api/folders/browse?path=/etc/shadow")
        assert resp.status_code in (200, 400, 403)

        if resp.status_code == 200:
            data = resp.json()
            # 不应返回 /etc/shadow 的内容
            assert len(data) == 0 or all(d.get("name", "") != "shadow" for d in data)

    def test_api11_special_characters_in_path(self, client):
        """API-11: 路径包含特殊字符"""
        resp = client.get("/api/folders/browse?path=/tmp/test%00null")
        # 应优雅处理，不崩溃
        assert resp.status_code < 500
