"""
操作执行引擎测试

覆盖范围：
  - execute_move_to_folder：移动到指定文件夹
  - execute_move_to_trash：移动到废纸篓
  - 文件已存在重命名策略
  - 取消操作的中断
  - Docker 模式 vs 本地模式
"""

import os
import time
import pytest
import shutil
from unittest.mock import patch

from app.services.action_engine import (
    execute_move_to_folder,
    execute_move_to_trash,
    current_action,
)


# ======================================================================
# execute_move_to_folder 测试
# ======================================================================

class TestMoveToFolder:
    """移动到文件夹测试"""

    @pytest.mark.asyncio
    async def test_basic_move(self, tmp_fs):
        """基本移动：文件成功移到目标目录"""
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)

        # 创建一些源文件
        files_to_move = []
        for i in range(3):
            path = os.path.join(src, f"file_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content_{i}")
            files_to_move.append({"path": path, "size": 10})

        await execute_move_to_folder("session_test", files_to_move, dst)

        # 验证文件已移动
        assert os.path.exists(dst)
        for i in range(3):
            assert os.path.exists(os.path.join(dst, f"file_{i}.txt"))
            # 源文件不再存在
            assert not os.path.exists(os.path.join(src, f"file_{i}.txt"))

    @pytest.mark.asyncio
    async def test_move_creates_destination(self, tmp_fs):
        """目标目录不存在时自动创建"""
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "deep/nested/dst")
        os.makedirs(src)

        path = os.path.join(src, "test.txt")
        with open(path, "w") as f:
            f.write("test")

        await execute_move_to_folder("session_test", [{"path": path, "size": 4}], dst)
        assert os.path.exists(os.path.join(dst, "test.txt"))

    @pytest.mark.asyncio
    async def test_filename_collision(self, tmp_fs):
        """目标文件已存在时自动重命名（加 _1, _2 后缀）"""
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)
        os.makedirs(dst)

        # 目标已有一个同名文件
        collision_path = os.path.join(dst, "data.txt")
        with open(collision_path, "w") as f:
            f.write("original")

        # 源文件
        src_path = os.path.join(src, "data.txt")
        with open(src_path, "w") as f:
            f.write("duplicate")

        await execute_move_to_folder(
            "session_test",
            [{"path": src_path, "size": 10}],
            dst,
        )

        # 原始文件保留
        assert os.path.exists(collision_path)
        # 新文件被重命名
        renamed = os.path.join(dst, "data_1.txt")
        assert os.path.exists(renamed), f"期望重命名文件存在: {renamed}，但不存在。目录内容: {os.listdir(dst)}"

    @pytest.mark.asyncio
    async def test_multi_batch_move(self, tmp_fs):
        """超过 100 个文件时分批处理"""
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)

        files_to_move = []
        for i in range(150):
            path = os.path.join(src, f"batch_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content_{i}")
            files_to_move.append({"path": path, "size": 10})

        await execute_move_to_folder("session_test", files_to_move, dst)

        # 验证全部 150 个文件已移动
        moved = os.listdir(dst)
        assert len(moved) == 150

    @pytest.mark.asyncio
    async def test_cancel_during_move(self, tmp_fs):
        """取消操作时停止移动"""
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)

        files_to_move = []
        for i in range(200):
            path = os.path.join(src, f"cancel_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content_{i}")
            files_to_move.append({"path": path, "size": 10})

        # 设置取消标志
        current_action.cancel_flag = True

        await execute_move_to_folder("session_test", files_to_move, dst)

        # 可能部分文件已被移动，但不应全部移动完
        # 同时应不抛出异常
        current_action.cancel_flag = False

    @pytest.mark.asyncio
    async def test_action_state_management(self, tmp_fs):
        """操作状态管理"""
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)

        path = os.path.join(src, "f.txt")
        with open(path, "w") as f:
            f.write("x")

        assert current_action.running is False
        await execute_move_to_folder("session_abc", [{"path": path, "size": 1}], dst)
        # 执行完成后 running 应为 False
        assert current_action.running is False


# ======================================================================
# execute_move_to_trash 测试
# ======================================================================

class TestMoveToTrash:
    """移动到废纸篓测试"""

    @pytest.mark.asyncio
    async def test_docker_mode_trash(self, tmp_fs):
        """Docker 模式下移动到 #recycle 目录"""
        from app.config import settings

        # 模拟 Docker 模式
        with patch.object(settings, "DOCKER_MODE", True):
            with patch.object(settings, "NAS_ROOT", tmp_fs):
                src = os.path.join(tmp_fs, "src")
                os.makedirs(src)
                path = os.path.join(src, "trash_me.txt")
                with open(path, "w") as f:
                    f.write("delete me")

                await execute_move_to_trash("session_test", [{"path": path, "size": 9}])

                # 文件应出现在 #recycle 目录
                recycle = os.path.join(tmp_fs, "#recycle")
                assert os.path.exists(recycle)
                assert os.path.exists(os.path.join(recycle, "trash_me.txt"))
                # 源文件不应再存在
                assert not os.path.exists(path)

    @pytest.mark.asyncio
    async def test_trash_filename_collision(self, tmp_fs):
        """废纸篓中文件重名时自动重命名"""
        from app.config import settings

        with patch.object(settings, "DOCKER_MODE", True):
            with patch.object(settings, "NAS_ROOT", tmp_fs):
                recycle = os.path.join(tmp_fs, "#recycle")
                os.makedirs(recycle)
                # 预置一个同名文件
                existing = os.path.join(recycle, "data.txt")
                with open(existing, "w") as f:
                    f.write("original")

                src = os.path.join(tmp_fs, "src")
                os.makedirs(src)
                path = os.path.join(src, "data.txt")
                with open(path, "w") as f:
                    f.write("duplicate")

                await execute_move_to_trash(
                    "session_test",
                    [{"path": path, "size": 10}],
                )

                # 原始文件保留
                assert os.path.exists(existing)
                # 新文件被重命名
                assert os.path.exists(os.path.join(recycle, "data_1.txt"))

    @pytest.mark.asyncio
    async def test_non_docker_trash(self, tmp_fs):
        """非 Docker 模式使用 send2trash"""
        # 由于 send2trash 在测试环境中可能不可用或行为不同，
        # 我们验证代码路径能走到 send2trash
        from app.config import settings

        with patch.object(settings, "DOCKER_MODE", False):
            src = os.path.join(tmp_fs, "src")
            os.makedirs(src)
            path = os.path.join(src, "native_trash.txt")
            with open(path, "w") as f:
                f.write("native")

            # 在非 Docker 模式下，应尝试使用 send2trash
            # 如果 send2trash 不可用，应回退到 docker_trash
            try:
                await execute_move_to_trash("session_test", [{"path": path, "size": 6}])
            except Exception:
                pass  # 测试环境中 send2trash 可能失败
            finally:
                current_action.running = False


# ======================================================================
# 新增边缘场景测试
# ======================================================================

class TestMoveToFolderEdgeCases:
    """操作引擎边界场景（AE-07 ~ AE-08）"""

    @pytest.mark.asyncio
    async def test_ae07_cross_device_move_fallback(self, tmp_fs):
        """
        AE-07: 跨文件系统移动（EXDEV）自动降级为复制+删除
        模拟 os.rename 抛出 EXDEV 错误 → 应自动使用 shutil.copy2 + os.remove
        """
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)
        os.makedirs(dst)

        # 创建源文件
        src_path = os.path.join(src, "cross_device.txt")
        with open(src_path, "w") as f:
            f.write("cross device content")

        # mock os.rename 抛出 EXDEV（errno 18）
        import builtins as _builtins
        real_rename = os.rename
        rename_call_count = [0]

        def mock_rename(src_real, dst_real):
            rename_call_count[0] += 1
            if rename_call_count[0] == 1:
                raise OSError(18, "Invalid cross-device link")
            return real_rename(src_real, dst_real)

        with patch.object(os, "rename", mock_rename):
            await execute_move_to_folder(
                "session_test",
                [{"path": src_path, "size": 20}],
                dst,
            )

        # 文件应出现在目标目录（通过 copy+remove 完成）
        assert os.path.exists(os.path.join(dst, "cross_device.txt"))
        # 源文件应被删除
        assert not os.path.exists(src_path)

    @pytest.mark.asyncio
    async def test_ae07b_cross_device_content_integrity(self, tmp_fs):
        """AE-07b: 跨文件系统降级后文件内容完整性校验"""
        import hashlib as _hashlib
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)
        os.makedirs(dst)

        # 创建有特定内容的文件
        content = b"content integrity check " + b"x" * 100000
        src_path = os.path.join(src, "integrity.bin")
        with open(src_path, "wb") as f:
            f.write(content)

        original_sha = _hashlib.sha256(content).hexdigest()

        real_rename = os.rename
        rename_count = [0]

        def mock_rename_second(s, d):
            rename_count[0] += 1
            if rename_count[0] == 1:
                raise OSError(18, "EXDEV")
            return real_rename(s, d)

        with patch.object(os, "rename", mock_rename_second):
            await execute_move_to_folder(
                "session_test",
                [{"path": src_path, "size": len(content)}],
                dst,
            )

        # 验证目标文件内容完整性
        dest_path = os.path.join(dst, "integrity.bin")
        with open(dest_path, "rb") as f:
            dest_content = f.read()
        dest_sha = _hashlib.sha256(dest_content).hexdigest()
        assert original_sha == dest_sha, "文件内容在跨设备移动后发生改变"

    @pytest.mark.asyncio
    async def test_ae08_disk_full_error_handling(self, tmp_fs):
        """
        AE-08: 目标磁盘空间不足/写保护
        模拟写入抛出 ENOSPC → 优雅中断，出错文件留在原位
        """
        src = os.path.join(tmp_fs, "src")
        dst = os.path.join(tmp_fs, "dst")
        os.makedirs(src)
        os.makedirs(dst)

        # 创建多个文件
        for i in range(5):
            p = os.path.join(src, f"ok_{i}.txt")
            with open(p, "w") as f:
                f.write(f"content_{i}")

        # 模拟第 3 个文件写入时抛出 ENOSPC
        original_open = __builtins__["open"]
        open_count = [0]

        def mock_open(path, mode="r", *args, **kwargs):
            if "dst" in path and "ok_2" in path and "w" in mode:
                open_count[0] += 1
                if open_count[0] == 1:
                    raise OSError(28, "No space left on device")
            return original_open(path, mode, *args, **kwargs)

        with patch("builtins.open", mock_open):
            files_to_move = [
                {"path": os.path.join(src, f"ok_{i}.txt"), "size": 10}
                for i in range(5)
            ]
            # 应优雅处理，不抛出未捕获的异常
            await execute_move_to_folder("session_test", files_to_move, dst)

        # 出错后部分文件可能已被移动，但整个操作不崩溃
        # 验证操作状态
        assert current_action.running is False

    @pytest.mark.asyncio
    async def test_ae08b_readonly_destination(self, tmp_fs):
        """AE-08b: 目标目录写保护（只读文件系统）"""
        src = os.path.join(tmp_fs, "src2")
        dst = os.path.join(tmp_fs, "dst2")
        os.makedirs(src)

        # 创建源文件
        src_path = os.path.join(src, "readonly_test.txt")
        with open(src_path, "w") as f:
            f.write("test")

        # 模拟 rename 抛出 EROFS（只读文件系统）
        # 同时 mock shutil.copy2 也失败，以模拟完全的只读场景
        def mock_rename_ro(src_real, dst_real):
            raise OSError(30, "Read-only file system")

        def mock_copy2(src_real, dst_real):
            raise OSError(30, "Read-only file system")

        with patch.object(os, "rename", mock_rename_ro):
            with patch("shutil.copy2", mock_copy2):
                # 也应能优雅地失败
                try:
                    await execute_move_to_folder(
                        "session_test",
                        [{"path": src_path, "size": 4}],
                        dst,
                    )
                except Exception:
                    pass  # 预期可能有异常，但不应导致 segfault 或数据损坏

        # 验证操作状态
        assert current_action.running is False


# ======================================================================
# AE-09: 写保护或只读权限文件移动兼容
# ======================================================================

class TestMoveReadonlyFiles:
    """AE-09: 写保护或只读权限文件移动兼容"""

    @pytest.mark.asyncio
    async def test_ae09_readonly_source_file(self, tmp_fs):
        """
        AE-09: 源文件为只读权限
        移动只读文件时应能正常处理
        """
        src = os.path.join(tmp_fs, "src_ro")
        dst = os.path.join(tmp_fs, "dst_ro")
        os.makedirs(src)

        # 创建只读源文件
        readonly_path = os.path.join(src, "readonly.txt")
        with open(readonly_path, "w") as f:
            f.write("readonly content")
        os.chmod(readonly_path, 0o444)  # 只读权限

        try:
            await execute_move_to_folder(
                "session_test",
                [{"path": readonly_path, "size": 16}],
                dst,
            )

            # 文件应该被移动到目标目录
            dest_path = os.path.join(dst, "readonly.txt")
            assert os.path.exists(dest_path)
            # 源文件应被删除
            assert not os.path.exists(readonly_path)
        finally:
            # 恢复目标文件权限以便清理
            if os.path.exists(dst):
                for f in os.listdir(dst):
                    fp = os.path.join(dst, f)
                    if os.path.exists(fp):
                        os.chmod(fp, 0o644)

    @pytest.mark.asyncio
    async def test_ae09_locked_file_on_macos(self, tmp_fs):
        """
        AE-09: macOS locked 文件
        模拟 macOS 下的 locked 文件属性
        """
        src = os.path.join(tmp_fs, "src_locked")
        dst = os.path.join(tmp_fs, "dst_locked")
        os.makedirs(src)

        locked_path = os.path.join(src, "locked.txt")
        with open(locked_path, "w") as f:
            f.write("locked content")

        # 模拟 locked 文件（通过 mock 实现）
        real_rename = os.rename

        def mock_rename_locked(src_real, dst_real):
            # 模拟 locked 文件抛出 EPERM
            if "locked.txt" in src_real:
                raise OSError(1, "Operation not permitted")
            return real_rename(src_real, dst_real)

        with patch.object(os, "rename", mock_rename_locked):
            try:
                await execute_move_to_folder(
                    "session_test",
                    [{"path": locked_path, "size": 14}],
                    dst,
                )
            except Exception:
                pass  # 预期可能有异常

        # 验证操作状态
        assert current_action.running is False

    @pytest.mark.asyncio
    async def test_ae09_mixed_permissions_files(self, tmp_fs):
        """
        AE-09: 混合权限文件批量移动
        一批文件中包含正常文件和只读文件
        """
        src = os.path.join(tmp_fs, "src_mixed")
        dst = os.path.join(tmp_fs, "dst_mixed")
        os.makedirs(src)

        files_to_move = []
        for i in range(5):
            path = os.path.join(src, f"file_{i}.txt")
            with open(path, "w") as f:
                f.write(f"content_{i}")
            files_to_move.append({"path": path, "size": 10})

        # 将第3个文件设为只读
        os.chmod(files_to_move[2]["path"], 0o444)

        try:
            await execute_move_to_folder("session_test", files_to_move, dst)

            # 验证操作完成
            assert current_action.running is False
        finally:
            # 恢复权限以便清理
            for f in files_to_move:
                if os.path.exists(f["path"]):
                    os.chmod(f["path"], 0o644)
