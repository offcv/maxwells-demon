"""
文件夹树服务测试

覆盖范围：
  - get_folder_tree 基本功能
  - 空目录处理
  - 根路径 "/" 处理
  - 统计信息（n_files, n_groups）
  - 按字母序排序
"""

import pytest
from app.services.folder_tree import get_folder_tree


class TestFolderTree:
    """文件夹树懒加载服务"""

    def test_basic_tree(self, db_session, test_session, test_scan_files_group1):
        """基本树形结构：按 parent 获取子目录"""
        # group1 的文件路径:
        # /test/photos/photo_a.jpg
        # /test/backup/photo_a.jpg
        # /test/tmp/photo_a.jpg

        # 获取 /test 的子目录
        result = get_folder_tree(db_session, test_session.id, parent="/test")
        assert len(result) == 3

        names = {r["name"] for r in result}
        assert "photos" in names
        assert "backup" in names
        assert "tmp" in names

    def test_tree_stats(self, db_session, test_session, test_scan_files_group1):
        """节点统计：n_files 和 n_groups"""
        result = get_folder_tree(db_session, test_session.id, parent="/test")
        for r in result:
            if r["name"] == "photos":
                assert r["n_files"] == 1  # photo_a.jpg
                assert r["n_groups"] == 1  # group_id=1
            elif r["name"] == "backup":
                assert r["n_files"] == 1
                assert r["n_groups"] == 1
            elif r["name"] == "tmp":
                assert r["n_files"] == 1
                assert r["n_groups"] == 1

    def test_alpha_sorted(self, db_session, test_session, test_scan_files_group1):
        """同级目录按字母序返回"""
        result = get_folder_tree(db_session, test_session.id, parent="/test")
        names = [r["name"] for r in result]
        assert names == sorted(names), f"目录未按字母序排序: {names}"

    def test_empty_parent_returns_empty(self, db_session, test_session):
        """不存在的父路径返回空列表"""
        result = get_folder_tree(db_session, test_session.id, parent="/nonexistent")
        assert result == []

    def test_root_parent(self, db_session, test_session, test_scan_files_group1):
        """根路径 "/" 作为 parent"""
        result = get_folder_tree(db_session, test_session.id, parent="/")
        assert len(result) >= 1
        # 应包含 test
        names = {r["name"] for r in result}
        assert "test" in names

    def test_no_files_returns_empty(self, db_session, test_session):
        """会话中没有任何文件时返回空"""
        result = get_folder_tree(db_session, test_session.id, parent="/")
        assert result == []

    def test_multiple_groups_in_one_dir(self, db_session, test_session):
        """同一目录涉及多个重复组"""
        from app.models import ScanFile

        files = [
            # 文件位于 /multi/subdir/ 下，这样 subdir 是 /multi 的直接子目录
            ScanFile(
                session_id=test_session.id, path="/multi/subdir/group_a.txt",
                size=100, sha256="s1", group_id=1,
            ),
            ScanFile(
                session_id=test_session.id, path="/multi/subdir/group_b.txt",
                size=200, sha256="s2", group_id=2,
            ),
        ]
        db_session.add_all(files)
        db_session.commit()

        result = get_folder_tree(db_session, test_session.id, parent="/multi")
        assert len(result) == 1  # 应返回 subdir
        assert result[0]["name"] == "subdir"
        assert result[0]["n_groups"] == 2  # 两个组
        assert result[0]["n_files"] == 2  # 两个文件
