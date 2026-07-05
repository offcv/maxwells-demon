"""
方案生成与分类 API 路由测试

覆盖范围：
  API-04: 方案生成
  API-05: 文件级覆盖
  新增：分类获取、状态查询、缓存机制
"""

import json
import pytest
from app.models import FileOverride
from app.services.scheme_engine import scheme_cache, current_scheme


class TestSchemeAPI:
    """方案 API"""

    # ── API-04: 方案生成 ──
    def test_generate_scheme(self, client, test_session, test_scan_files_group1):
        """POST /api/sessions/{id}/scheme/generate → 启动方案生成"""
        resp = client.post(f"/api/sessions/{test_session.id}/scheme/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Scheme generation started"
        assert data["session_id"] == test_session.id

    def test_generate_clears_overrides(self, client, db_session, test_session):
        """重新生成方案前清除旧的 file_overrides"""
        db_session.add(FileOverride(
            session_id=test_session.id,
            file_path="/old/override.txt",
            action="keep",
        ))
        db_session.commit()

        resp = client.post(f"/api/sessions/{test_session.id}/scheme/generate")
        assert resp.status_code == 200

        # 验证旧覆盖已被清除
        remaining = db_session.query(FileOverride).filter(
            FileOverride.session_id == test_session.id,
        ).count()
        assert remaining == 0

    # ── 方案生成状态 ──
    def test_scheme_status(self, client, test_session):
        """GET /api/sessions/{id}/scheme/status → 当前状态"""
        resp = client.get(f"/api/sessions/{test_session.id}/scheme/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "processed" in data
        assert "total" in data

    # ── 方案分类获取 ──
    def test_get_categories(self, client, db_session, test_session, test_scan_files_group1):
        """GET /api/sessions/{id}/scheme/categories → 四类分类"""
        # 没有缓存时从 DB 实时计算
        resp = client.get(f"/api/sessions/{test_session.id}/scheme/categories")
        assert resp.status_code == 200
        data = resp.json()
        # 应包含四类分类
        for cat in ("keep_one", "partial_keep", "keep_all", "delete_all"):
            assert cat in data
        # 总组数应 >= 1
        total_groups = sum(len(v["groups"]) for v in data.values())
        assert total_groups >= 1

    def test_get_categories_with_cache(self, client, test_session):
        """有缓存时优先返回缓存"""
        scheme_cache.set(test_session.id, {
            "keep_one": {"groups": [1], "file_count": 2, "size": 2000, "total_file_count": 3, "total_size": 3000},
            "partial_keep": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "keep_all": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
            "delete_all": {"groups": [], "file_count": 0, "size": 0, "total_file_count": 0, "total_size": 0},
        })

        resp = client.get(f"/api/sessions/{test_session.id}/scheme/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert data["keep_one"]["groups"] == [1]

        scheme_cache.clear()

    # ── 分类明细 ──
    def test_get_cat_groups(self, client, db_session, test_session, test_scan_files_group1):
        """GET /api/sessions/{id}/scheme/categories/{cat}/groups → 分类下的组"""
        # 设置标记使分类可预期
        from app.models import FolderMark
        db_session.add(FolderMark(session_id=test_session.id, path="/test/photos", mark="keep"))
        db_session.add(FolderMark(session_id=test_session.id, path="/test/backup", mark="delete"))
        db_session.add(FolderMark(session_id=test_session.id, path="/test/tmp", mark="delete"))
        db_session.commit()

        resp = client.get(f"/api/sessions/{test_session.id}/scheme/categories/keep_one/groups?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        if len(data["data"]) > 0:
            assert "group_id" in data["data"][0]
            assert "files" in data["data"][0]
            # 验证每个文件都有 action/mark_source_type/mark_source
            for f in data["data"][0]["files"]:
                assert "action" in f
                assert "mark_source_type" in f
                assert "mark_source" in f

    # ── API-05: 文件级覆盖 ──
    def test_file_action_override(self, client, db_session, test_session):
        """PUT /api/sessions/{id}/scheme/file-action → 设置文件覆盖"""
        resp = client.put(
            f"/api/sessions/{test_session.id}/scheme/file-action",
            json={"path": "/my/file.txt", "action": "keep"},
        )
        assert resp.status_code == 200

        # 验证数据库
        override = db_session.query(FileOverride).filter(
            FileOverride.session_id == test_session.id,
            FileOverride.file_path == "/my/file.txt",
        ).first()
        assert override is not None
        assert override.action == "keep"

    def test_file_action_update(self, client, db_session, test_session):
        """更新已有文件覆盖"""
        db_session.add(FileOverride(
            session_id=test_session.id,
            file_path="/my/file.txt",
            action="keep",
        ))
        db_session.commit()

        resp = client.put(
            f"/api/sessions/{test_session.id}/scheme/file-action",
            json={"path": "/my/file.txt", "action": "delete"},
        )
        assert resp.status_code == 200

        override = db_session.query(FileOverride).filter(
            FileOverride.session_id == test_session.id,
            FileOverride.file_path == "/my/file.txt",
        ).first()
        assert override.action == "delete"

    def test_invalid_category(self, client, test_session):
        """不存在的分类返回 error"""
        resp = client.get(
            f"/api/sessions/{test_session.id}/scheme/categories/invalid_cat/groups",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
