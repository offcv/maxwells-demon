"""
空文件夹清理阶段测试（清理动作收尾的第三阶段）

覆盖范围：
  - 空/非空判定口径（忽略 .开头 与 @eaDir；0 字节文件与 symlink 视为有内容）
  - 级联上溯与扫描根保护（根本身绝不移动）
  - dest_path 位于扫描树内时的保护
  - 去向跟随主操作（folder → dest；trash → #recycle）与重名后缀
  - FolderMark 级联删除（session 隔离 + 前缀边界）
  - 无 session 记录时跳过清理；主操作取消时跳过清理
"""

import os
import json
import uuid
import shutil
import pytest
from unittest.mock import patch

from app.services.action_engine import (
    execute_move_to_folder,
    execute_move_to_trash,
    current_action,
)
from app.models import ScanSession, FolderMark


# ── 辅助函数 ──────────────────────────────────────────────────────────

def _make_file(path: str, content: str = "x") -> str:
    parent = os.path.dirname(path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


def _make_session(db, root: str, sid: str = None) -> ScanSession:
    """创建 scan_paths 指向 root 的会话记录（空文件夹清理依赖它确定上溯边界）"""
    s = ScanSession(
        id=sid or f"sess-{uuid.uuid4().hex[:8]}",
        scan_paths=json.dumps([{"path": root, "is_exclude": False}]),
        status="done",
        scanned_total=0,
        file_count=0,
        group_count=0,
        total_size=0,
        reclaimable_size=0,
    )
    db.add(s)
    db.commit()
    return s


def _marks_of(db, session_id: str) -> dict:
    """返回 {path: mark} 便于断言"""
    rows = db.query(FolderMark).filter(FolderMark.session_id == session_id).all()
    return {m.path: m.mark for m in rows}


# ======================================================================
# 空/非空判定口径
# ======================================================================

class TestEmptyJudgement:
    """空目录判定口径"""

    @pytest.mark.asyncio
    async def test_truly_empty_dir_cleaned(self, tmp_fs, db_session):
        """真空目录被清理并移入目标目录"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(
            sess.id, [{"path": f, "size": 3}], dst
        )

        assert not os.path.exists(src), "移空后的目录应被清理"
        assert os.path.isdir(os.path.join(dst, "src_dup")), "空目录应被移到目标目录"
        assert current_action.emptied_dirs == 1

    @pytest.mark.asyncio
    async def test_ignored_entries_treated_as_empty(self, tmp_fs, db_session):
        """只剩 .DS_Store 与 @eaDir 的目录视为空（NAS/macOS 常见残留）"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        _make_file(os.path.join(src, ".DS_Store"), "junk")
        _make_file(os.path.join(src, "@eaDir", "thumb"), "junk")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert not os.path.exists(src)
        assert current_action.emptied_dirs == 1

    @pytest.mark.asyncio
    async def test_zero_byte_file_keeps_dir(self, tmp_fs, db_session):
        """目录中残留 0 字节普通文件时不清（用户数据安全底线）"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        _make_file(os.path.join(src, "placeholder.txt"), "")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert os.path.exists(src), "含 0 字节普通文件的目录不应被清理"
        assert current_action.emptied_dirs == 0

    @pytest.mark.asyncio
    async def test_symlink_keeps_dir(self, tmp_fs, db_session):
        """目录中残留 symlink 时不清（用户数据安全底线）"""
        sess = _make_session(db_session, tmp_fs)
        target = _make_file(os.path.join(tmp_fs, "target.txt"), "t")
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        os.symlink(target, os.path.join(src, "link.txt"))
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert os.path.exists(src), "含 symlink 的目录不应被清理"
        assert current_action.emptied_dirs == 0

    @pytest.mark.asyncio
    async def test_dir_with_kept_file_not_cleaned(self, tmp_fs, db_session):
        """目录中仍有未移动的普通文件时不清"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "dup.txt"), "dup")
        _make_file(os.path.join(src, "keep.txt"), "keep")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert os.path.exists(os.path.join(src, "keep.txt"))
        assert current_action.emptied_dirs == 0


# ======================================================================
# 级联上溯与扫描根保护
# ======================================================================

class TestCascadeAndRootProtection:
    """级联上溯与扫描根保护"""

    @pytest.mark.asyncio
    async def test_cascade_up_to_but_not_root(self, tmp_fs, db_session):
        """子目录清空后父目录级联清理，但扫描根本身绝不移动"""
        sess = _make_session(db_session, tmp_fs)
        deep = os.path.join(tmp_fs, "a", "b", "c")
        f = _make_file(os.path.join(deep, "file.txt"), "dup")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert not os.path.exists(os.path.join(tmp_fs, "a")), "a/b/c 应级联清空"
        assert os.path.isdir(tmp_fs), "扫描根本身绝不能被移动"
        assert current_action.emptied_dirs == 3, "c、b、a 三层应全部清理"

    @pytest.mark.asyncio
    async def test_root_level_file_leaves_root_intact(self, tmp_fs, db_session):
        """文件直接位于扫描根下时，移走后根保留"""
        sess = _make_session(db_session, tmp_fs)
        f = _make_file(os.path.join(tmp_fs, "root_dup.txt"), "dup")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert os.path.isdir(tmp_fs)
        assert current_action.emptied_dirs == 0

    @pytest.mark.asyncio
    async def test_dest_inside_scan_tree_protected(self, tmp_fs, db_session):
        """目标目录位于扫描树内时，目标目录及扫描根不受清理影响"""
        sess = _make_session(db_session, tmp_fs)
        dst = os.path.join(tmp_fs, "archive")  # 树内目标
        os.makedirs(dst)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        # dst 含刚移入的文件，且自身及其父级（扫描根）完好
        assert os.path.exists(os.path.join(dst, "a.txt"))
        assert os.path.isdir(dst)
        assert os.path.isdir(tmp_fs)
        # src_dup 清空后移入 dst
        assert os.path.isdir(os.path.join(dst, "src_dup"))


# ======================================================================
# 去向与重名
# ======================================================================

class TestDestinationAndCollision:
    """去向跟随主操作与重名处理"""

    @pytest.mark.asyncio
    async def test_trash_mode_moves_dir_to_recycle(self, tmp_fs, db_session):
        """trash 场景：空目录跟随主操作进入 #recycle"""
        from app.config import settings

        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "trash_me.txt"), "dup")

        with patch.object(settings, "DOCKER_MODE", True):
            with patch.object(settings, "NAS_ROOT", tmp_fs):
                await execute_move_to_trash(sess.id, [{"path": f, "size": 3}])

        recycle = os.path.join(tmp_fs, "#recycle")
        assert os.path.isdir(os.path.join(recycle, "src_dup")), "空目录应进入 #recycle"
        assert current_action.emptied_dirs == 1

    @pytest.mark.asyncio
    async def test_dir_name_collision_suffix(self, tmp_fs, db_session):
        """目标目录已有同名子目录时自动加 _1 后缀"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(os.path.join(dst, "src_dup"))  # 预置同名目录
        _make_file(os.path.join(dst, "src_dup", "existing.txt"), "old")

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert os.path.isdir(os.path.join(dst, "src_dup")), "原有目录保留"
        assert os.path.isdir(os.path.join(dst, "src_dup_1")), "新空目录应加 _1 后缀"
        assert os.path.exists(os.path.join(dst, "src_dup", "existing.txt"))


# ======================================================================
# FolderMark 级联删除
# ======================================================================

class TestFolderMarkCleanup:
    """空目录移走后 folder_marks 残留记录的清理"""

    @pytest.mark.asyncio
    async def test_marks_under_cleaned_dir_removed(self, tmp_fs, db_session):
        """被清目录自身及子路径的标记删除，其他标记保留"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "sub", "a.txt"), "dup")
        db_session.add_all([
            FolderMark(session_id=sess.id, path=src, mark="delete"),
            FolderMark(session_id=sess.id, path=os.path.join(src, "sub"), mark="keep"),
            FolderMark(session_id=sess.id, path=os.path.join(tmp_fs, "other"), mark="keep"),
        ])
        db_session.commit()
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        remaining = _marks_of(db_session, sess.id)
        assert os.path.join(tmp_fs, "other") in remaining, "无关标记保留"
        assert src not in remaining, "被清目录自身的标记应删除"
        assert os.path.join(src, "sub") not in remaining, "被清目录子路径的标记应删除"

    @pytest.mark.asyncio
    async def test_prefix_boundary_no_overreach(self, tmp_fs, db_session):
        """前缀匹配边界：/x/photos 清理不误删 /x/photos-2 的标记"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "photos")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        similar = os.path.join(tmp_fs, "photos-2")
        db_session.add_all([
            FolderMark(session_id=sess.id, path=src, mark="delete"),
            FolderMark(session_id=sess.id, path=similar, mark="keep"),
        ])
        db_session.commit()
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        remaining = _marks_of(db_session, sess.id)
        assert similar in remaining, "相似前缀目录的标记不应被误删"
        assert src not in remaining

    @pytest.mark.asyncio
    async def test_session_isolation(self, tmp_fs, db_session):
        """跨会话隔离：只删当前会话的标记，其他会话对同一目录的标记保留"""
        sess_a = _make_session(db_session, tmp_fs, sid="sess-a")
        sess_b = _make_session(db_session, tmp_fs, sid="sess-b")
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        db_session.add_all([
            FolderMark(session_id=sess_a.id, path=src, mark="delete"),
            FolderMark(session_id=sess_b.id, path=src, mark="keep"),
        ])
        db_session.commit()
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess_a.id, [{"path": f, "size": 3}], dst)

        assert src not in _marks_of(db_session, sess_a.id), "当前会话标记应删除"
        assert src in _marks_of(db_session, sess_b.id), "其他会话标记必须保留"


# ======================================================================
# 防御性场景
# ======================================================================

class TestDefensiveScenarios:
    """防御性场景"""

    @pytest.mark.asyncio
    async def test_no_session_record_skips_cleanup(self, tmp_fs):
        """会话不在数据库中时跳过清理（无法确定上溯边界）"""
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder("ghost_session", [{"path": f, "size": 3}], dst)

        assert os.path.exists(src), "无会话记录时不应清理目录"
        assert current_action.emptied_dirs == 0

    @pytest.mark.asyncio
    async def test_cancelled_action_skips_cleanup(self, tmp_fs, db_session):
        """主操作被取消时跳过空文件夹清理阶段"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        files = [
            _make_file(os.path.join(src, f"f{i}.txt"), "dup") for i in range(3)
        ]
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        # 第一个文件移动成功后立即置取消标志
        real_move = shutil.move
        call_count = {"n": 0}

        def fake_move(s, d):
            call_count["n"] += 1
            result = real_move(s, d)
            if call_count["n"] == 1:
                current_action.cancel_flag = True
            return result

        with patch.object(shutil, "move", fake_move):
            await execute_move_to_folder(
                sess.id, [{"path": p, "size": 3} for p in files], dst
            )

        assert current_action.status == "cancelled"
        assert current_action.emptied_dirs == 0, "取消后不应执行清理阶段"
        assert os.path.exists(src)

    @pytest.mark.asyncio
    async def test_no_moved_files_no_cleanup(self, tmp_fs, db_session):
        """没有成功移动任何文件时不触发清理（无候选目录）"""
        sess = _make_session(db_session, tmp_fs)
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        await execute_move_to_folder(sess.id, [], dst)

        assert current_action.emptied_dirs == 0
        assert current_action.status == "done"

    @pytest.mark.asyncio
    async def test_nonexistent_source_dirs_ignored(self, tmp_fs, db_session):
        """候选目录磁盘上不存在时安全跳过（API 测试常见假路径场景）"""
        sess = _make_session(db_session, tmp_fs)
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        # 全部为磁盘上不存在的假路径
        ghost_files = [{"path": os.path.join(tmp_fs, "ghost", "f1.txt"), "size": 3}]
        await execute_move_to_folder(sess.id, ghost_files, dst)

        assert current_action.status == "done", "假路径不应导致流程异常"
        assert current_action.failed == 1, "文件移动失败计数"
        assert current_action.emptied_dirs == 0

    @pytest.mark.asyncio
    async def test_cleanup_failure_does_not_break_done(self, tmp_fs, db_session):
        """清理阶段单个目录失败不影响整体完成状态"""
        sess = _make_session(db_session, tmp_fs)
        src = os.path.join(tmp_fs, "src_dup")
        f = _make_file(os.path.join(src, "a.txt"), "dup")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(dst)

        real_move = shutil.move
        calls = {"n": 0}

        def fail_dir_move(s, d):
            # 目录移动（源是目录）时抛错，文件移动正常
            if os.path.isdir(s):
                calls["n"] += 1
                raise OSError(13, "Permission denied")
            return real_move(s, d)

        with patch.object(shutil, "move", fail_dir_move):
            await execute_move_to_folder(sess.id, [{"path": f, "size": 3}], dst)

        assert current_action.status == "done", "清理失败不应影响 done 状态"
        assert current_action.empty_dir_failed == 1
        assert current_action.emptied_dirs == 0
        assert os.path.exists(os.path.join(dst, "a.txt")), "文件移动本身不受影响"
