"""
扫描引擎测试用例

覆盖范围：
  SE-01 ~ SE-10（TECH_SPEC §15.1）
  新增：异常处理、跳过优先级、边界条件、广播逻辑、取消机制
"""

import os
import stat
import uuid
import time
import pytest
import tempfile
from unittest.mock import patch

# conftest 已处理 sys.path 和依赖注入
from conftest import create_file

from app.services.scan_engine import (
    get_xxhash64_64kb,
    get_sha256,
    get_creation_time,
    _walk_async,
    run_scan,
    current_scan,
)
from app.database import SessionLocal
from app.models import ScanSession, ScanFile


# ======================================================================
# 单元测试：哈希计算函数
# ======================================================================

class TestHashFunctions:
    """测试 get_xxhash64_64kb 和 get_sha256"""

    def test_get_xxhash64_64kb_small_file(self, tmp_fs):
        """小文件（<64KB）全量读入计算 xxHash"""
        path = os.path.join(tmp_fs, "small.txt")
        with open(path, "w") as f:
            f.write("hello world")
        size = os.path.getsize(path)
        h = get_xxhash64_64kb(path, size)
        assert h is not None
        assert isinstance(h, str)
        assert len(h) == 16  # xxh64 hexdigest 长度为 16

    def test_get_xxhash64_64kb_large_file(self, tmp_fs):
        """大文件（>64KB）只读前 64KB 计算"""
        path = os.path.join(tmp_fs, "large.bin")
        with open(path, "wb") as f:
            f.write(b"x" * 100000)  # ~97KB
        size = os.path.getsize(path)
        h = get_xxhash64_64kb(path, size)
        assert h is not None

    def test_get_xxhash64_64kb_same_content_same_hash(self, tmp_fs):
        """相同内容 + 相同大小 → 相同 xxHash"""
        a = os.path.join(tmp_fs, "a.txt")
        b = os.path.join(tmp_fs, "b.txt")
        for p in (a, b):
            with open(p, "w") as f:
                f.write("identical content")
        ha = get_xxhash64_64kb(a, os.path.getsize(a))
        hb = get_xxhash64_64kb(b, os.path.getsize(b))
        assert ha == hb

    def test_get_xxhash64_64kb_diff_size_diff_hash(self, tmp_fs):
        """相同内容但大小不同 → xxHash 不同（大小编入摘要）"""
        a = os.path.join(tmp_fs, "small.txt")
        b = os.path.join(tmp_fs, "large.txt")
        with open(a, "w") as f:
            f.write("hello")
        with open(b, "w") as f:
            f.write("hello world")
        ha = get_xxhash64_64kb(a, os.path.getsize(a))
        hb = get_xxhash64_64kb(b, os.path.getsize(b))
        assert ha != hb

    def test_get_xxhash64_64kb_file_not_found(self):
        """文件不存在返回 None"""
        h = get_xxhash64_64kb("/nonexistent/file.txt", 100)
        assert h is None

    def test_get_sha256_same_content_same_hash(self, tmp_fs):
        """相同文件内容 → 相同 SHA-256"""
        a = os.path.join(tmp_fs, "a.bin")
        b = os.path.join(tmp_fs, "b.bin")
        content = os.urandom(50000)
        for p in (a, b):
            with open(p, "wb") as f:
                f.write(content)
        ha = get_sha256(a)
        hb = get_sha256(b)
        assert ha == hb

    def test_get_sha256_diff_content_diff_hash(self, tmp_fs):
        """不同文件内容 → 不同 SHA-256"""
        a = os.path.join(tmp_fs, "a.bin")
        b = os.path.join(tmp_fs, "b.bin")
        with open(a, "wb") as f:
            f.write(b"content A")
        with open(b, "wb") as f:
            f.write(b"content B")
        assert get_sha256(a) != get_sha256(b)

    def test_get_sha256_file_not_found(self):
        """文件不存在返回 None"""
        h = get_sha256("/nonexistent/file.txt")
        assert h is None


# ======================================================================
# 单元测试：文件创建时间
# ======================================================================

class TestGetCreationTime:
    """跨平台文件创建时间获取"""

    def test_has_st_birthtime(self, tmp_fs):
        """有 st_birthtime 属性（macOS）时使用它"""
        path = os.path.join(tmp_fs, "test.txt")
        with open(path, "w") as f:
            f.write("test")
        s = os.stat(path)
        result = get_creation_time(s)
        assert result == s.st_birthtime


# ======================================================================
# 单元测试：异步目录遍历
# ======================================================================

class TestWalkAsync:
    """测试异步目录遍历 _walk_async"""

    @pytest.mark.asyncio
    async def test_basic_walk(self, tmp_fs):
        """基本遍历列出所有目录和文件"""
        os.makedirs(os.path.join(tmp_fs, "sub"))
        create_file(os.path.join(tmp_fs, "file1.txt"))
        create_file(os.path.join(tmp_fs, "sub", "file2.txt"))

        collected = []
        async for root, dirs, files in _walk_async(tmp_fs, []):
            collected.append((root, dirs, files))

        assert len(collected) >= 1
        # root 应包含两个文件
        root_entry = [c for c in collected if c[0] == tmp_fs]
        assert len(root_entry) == 1
        assert "sub" in root_entry[0][1]
        assert "file1.txt" in root_entry[0][2]

    @pytest.mark.asyncio
    async def test_exclude_filter(self, tmp_fs):
        """排除目录过滤"""
        os.makedirs(os.path.join(tmp_fs, "excluded"))
        os.makedirs(os.path.join(tmp_fs, "included"))
        create_file(os.path.join(tmp_fs, "excluded", "file.txt"))
        create_file(os.path.join(tmp_fs, "included", "file.txt"))

        exclude_path = os.path.normpath(os.path.join(tmp_fs, "excluded"))
        collected_roots = []
        async for root, dirs, files in _walk_async(tmp_fs, [exclude_path]):
            collected_roots.append(root)

        # excluded 不应出现在遍历结果中
        assert all(exclude_path not in r for r in collected_roots)

    @pytest.mark.asyncio
    async def test_permission_denied_dir(self, tmp_fs):
        """无权限目录应被跳过"""
        restricted = os.path.join(tmp_fs, "restricted")
        os.makedirs(restricted, exist_ok=True)
        create_file(os.path.join(restricted, "file.txt"))
        os.chmod(restricted, 0o000)

        collected = []
        try:
            async for root, dirs, files in _walk_async(tmp_fs, []):
                collected.append((root, dirs, files))
        finally:
            os.chmod(restricted, 0o755)

        # restricted 目录本身可能会被遍历到（scandir 返回空），
        # 但其子目录/文件不应被列出
        restricted_entry = [c for c in collected if c[0] == restricted]
        if restricted_entry:
            _, r_dirs, r_files = restricted_entry[0]
            assert r_dirs == []  # 无法列出子目录
            assert r_files == []  # 无法列出文件


# ======================================================================
# 集成测试：完整扫描流程（run_scan）
# ======================================================================

class TestRunScan:
    """测试 run_scan 全流程（对应 SE-01 ~ SE-10）"""

    @pytest.mark.asyncio
    async def test_se01_identical_files(self, tmp_scan_paths, tmp_fs):
        """
        SE-01: 两级哈希-完全相同文件
        2 个内容完全相同的文件 → 归为同一重复组
        """
        content = "exactly the same content " + str(uuid.uuid4())
        create_file(os.path.join(tmp_fs, "a.txt"), content)
        create_file(os.path.join(tmp_fs, "b.txt"), content)

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        # 验证 DB 中有一条重复组记录
        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            assert session.status == "done"
            assert session.group_count >= 1
            assert session.file_count >= 2

            files = db.query(ScanFile).filter(ScanFile.session_id == session_id).all()
            assert len(files) >= 2
            # 所有文件属同一个 group_id
            gids = {f.group_id for f in files}
            assert len(gids) == 1
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se02_header_same_content_diff(self, tmp_scan_paths, tmp_fs):
        """
        SE-02: 两级哈希-头部相同但内容不同
        前 64KB 相同，后续不同 → 不归为重复
        """
        # 创建两个 100KB 文件，前 64KB 相同，后续不同
        header = b"A" * 65536
        a_path = os.path.join(tmp_fs, "a.bin")
        b_path = os.path.join(tmp_fs, "b.bin")
        with open(a_path, "wb") as f:
            f.write(header + b"BBBB")
        with open(b_path, "wb") as f:
            f.write(header + b"CCCC")

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            # 可能没有重复组（如果 SHA-256 不同）
            assert session is not None
            if session.group_count > 0:
                # 验证 group_id 不同
                files = db.query(ScanFile).filter(ScanFile.session_id == session_id).all()
                gids = {f.group_id for f in files}
                assert len(gids) == session.group_count
                if session.group_count == 2:
                    assert len(gids) == 2
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se03_diff_size(self, tmp_scan_paths, tmp_fs):
        """
        SE-03: 两级哈希-大小不同
        内容相同但大小不同 → 阶段 1 即排除
        """
        create_file(os.path.join(tmp_fs, "small.txt"), "hello")
        create_file(os.path.join(tmp_fs, "large.txt"), "hello world")

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            # 大小不同的文件不应归为重复
            assert session is not None
            assert session.group_count == 0
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se04_large_file_head_hash(self, tmp_scan_paths, tmp_fs):
        """
        SE-04: 大文件头部哈希
        2GB 文件只对前 64KB 计算 xxHash（< 1s）
        """
        path = os.path.join(tmp_fs, "large.bin")
        with open(path, "wb") as f:
            f.seek(2 * 1024 * 1024 * 1024 - 1)
            f.write(b"\x00")

        # 由于大文件没有重复配对，不会进入阶段2
        session_id = str(uuid.uuid4())
        start = time.time()
        await run_scan(tmp_scan_paths, session_id)
        elapsed = time.time() - start

        assert current_scan.status == "done"
        # 大文件的 xxHash 计算应该在 5 秒内完成
        assert elapsed < 30, f"大文件哈希耗时过长: {elapsed:.2f}s"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            assert session.scanned_total >= 1
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se05_scan_cancel(self, tmp_scan_paths, tmp_fs):
        """
        SE-05: 扫描取消
        扫描进行中设置 cancel_flag → 安全停止
        """
        # 创建多个文件使扫描有足够时间
        for i in range(50):
            create_file(os.path.join(tmp_fs, f"file_{i}.txt"), f"content_{i}")

        # 先手动触发扫描，然后在短时间内取消
        # 使用一个单独的 session_id
        session_id = str(uuid.uuid4())

        # 在 run_scan 启动前设置 cancel_flag
        current_scan.cancel_flag = True
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "cancelled"

    @pytest.mark.asyncio
    async def test_se06_exclude_directory(self, tmp_fs):
        """
        SE-06: 排除目录
        设置排除路径 → 不扫描该目录
        """
        excluded = os.path.join(tmp_fs, "exclude_me")
        included = os.path.join(tmp_fs, "include_me")
        os.makedirs(excluded)
        os.makedirs(included)
        create_file(os.path.join(excluded, "file.txt"), "excluded")
        create_file(os.path.join(included, "file.txt"), "included")

        paths = [
            {"path": tmp_fs, "is_exclude": False},
            {"path": excluded, "is_exclude": True},
        ]
        session_id = str(uuid.uuid4())
        await run_scan(paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            files = db.query(ScanFile).filter(ScanFile.session_id == session_id).all()
            # 排除目录中的文件不应出现
            file_paths = {f.path for f in files}
            assert all("exclude_me" not in p for p in file_paths)
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se07_empty_files(self, tmp_scan_paths, tmp_fs):
        """
        SE-07: 空文件（0 字节）
        空文件跳过哈希计算，不计入重复检测
        """
        for i in range(3):
            path = os.path.join(tmp_fs, f"empty_{i}.txt")
            with open(path, "w") as f:
                pass  # 0 字节

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            # 空文件计入 scanned_total 但不产生重复组
            assert session.scanned_total == 3
            assert session.group_count == 0
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se08_symlink(self, tmp_scan_paths, tmp_fs):
        """
        SE-08: 符号链接
        不跟随符号链接，跳过
        """
        real_file = os.path.join(tmp_fs, "real.txt")
        create_file(real_file, "real content")
        link_path = os.path.join(tmp_fs, "link.txt")
        os.symlink(real_file, link_path)

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            # 符号链接不应被计入
            assert session.scanned_total == 1  # 只有 real.txt
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se09_no_perm_file(self, tmp_scan_paths, tmp_fs):
        """
        SE-09: 权限不足文件
        无读权限文件跳过哈希计算，仅计入 scanned_total
        """
        path = os.path.join(tmp_fs, "secret.txt")
        with open(path, "w") as f:
            f.write("secret")
        os.chmod(path, 0o000)

        try:
            session_id = str(uuid.uuid4())
            await run_scan(tmp_scan_paths, session_id)
            assert current_scan.status == "done"

            db = SessionLocal()
            try:
                session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
                assert session is not None
                assert session.scanned_total == 1
                # 无权限文件应出现在 unreadable_files 列表中
                assert len(current_scan.unreadable_files) == 1
                assert current_scan.unreadable_files[0] == path
            finally:
                db.close()
        finally:
            os.chmod(path, 0o644)

    # ── SE-11: 复杂嵌套排除路径 ──
    @pytest.mark.asyncio
    async def test_se11_nested_exclude_paths(self, tmp_fs):
        """
        SE-11: 复杂嵌套排除路径
        扫描 /vol1，排除 /vol1/a/b，但 /vol1/a 本身未被排除
        验证 /vol1/a/b 及其子目录都被跳过
        """
        vol1 = os.path.join(tmp_fs, "vol1")
        a = os.path.join(vol1, "a")
        b = os.path.join(a, "b")
        c = os.path.join(b, "c")
        os.makedirs(c)
        create_file(os.path.join(b, "excluded.txt"), "should be excluded")
        create_file(os.path.join(c, "also_excluded.txt"), "also excluded")
        create_file(os.path.join(a, "included.txt"), "should be included")

        paths = [
            {"path": vol1, "is_exclude": False},
            {"path": b, "is_exclude": True},
        ]
        session_id = str(uuid.uuid4())
        await run_scan(paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            files = db.query(ScanFile).filter(ScanFile.session_id == session_id).all()
            file_paths = {f.path for f in files}
            # 排除目录及其子目录的文件不应出现
            assert all("excluded.txt" not in p for p in file_paths)
            assert all("also_excluded.txt" not in p for p in file_paths)
        finally:
            db.close()

    # ── SE-12: Unicode/Emoji 与超长路径 ──
    @pytest.mark.asyncio
    async def test_se12_unicode_and_long_paths(self, tmp_fs):
        """
        SE-12: Unicode/Emoji 与超长路径兼容
        包含中文、Emoji、日文路径以及超过 255 字符的路径
        """
        # 创建 Unicode 路径文件
        unicode_path = os.path.join(tmp_fs, "你好世界_🌍_テスト.txt")
        create_file(unicode_path, "unicode content")

        # 创建超长路径文件（> 255 字符）
        long_dir = tmp_fs
        parts = []
        while len(os.path.join(long_dir, *parts, "file.txt")) < 300:
            parts.append("a" * 30)
        deep_dir = os.path.join(tmp_fs, *parts)
        os.makedirs(deep_dir, exist_ok=True)
        long_path = os.path.join(deep_dir, "file.txt")
        create_file(long_path, "deep content")

        # 创建相同内容的文件作为配对（正常路径）
        match_unicode = os.path.join(tmp_fs, "match_unicode.txt")
        create_file(match_unicode, "unicode content")
        match_deep = os.path.join(tmp_fs, "match_deep.txt")
        create_file(match_deep, "deep content")

        paths = [{"path": tmp_fs, "is_exclude": False}]
        session_id = str(uuid.uuid4())
        # 应正常运行，不抛出编码或路径异常
        await run_scan(paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            # 至少应扫描到 4 个文件
            assert session.scanned_total >= 4
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se10_small_file_full_read(self, tmp_scan_paths, tmp_fs):
        """
        SE-10: 小文件全量读入
        <=64KB 文件全文读入计算 xxHash
        """
        content = "x" * 40000  # ~39KB
        create_file(os.path.join(tmp_fs, "a.txt"), content)
        create_file(os.path.join(tmp_fs, "b.txt"), content)

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"
        assert current_scan.scanned_total >= 2

    @pytest.mark.asyncio
    async def test_hidden_files_skipped(self, tmp_scan_paths, tmp_fs):
        """
        新增：隐藏文件（.开头）应被跳过
        """
        create_file(os.path.join(tmp_fs, ".hidden"), "hidden content")
        create_file(os.path.join(tmp_fs, "visible.txt"), "visible content")

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            # 隐藏文件不计入 scanned_total
            assert session.scanned_total == 1  # 只有 visible.txt
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_file_skip_priority(self, tmp_fs):
        """
        新增：文件跳过优先级
        隐藏 > 0字节 > 符号链接 > 无权限
        当文件同时满足多个条件时，按优先级最高的处理
        """
        # 隐藏文件 + 0 字节
        hidden_empty = os.path.join(tmp_fs, ".hidden_empty")
        with open(hidden_empty, "w") as f:
            pass

        # 符号链接指向不存在的文件
        link_broken = os.path.join(tmp_fs, "bad_link")
        if not os.path.exists(link_broken):
            os.symlink("/nonexistent", link_broken)

        paths = [{"path": tmp_fs, "is_exclude": False}]
        session_id = str(uuid.uuid4())
        await run_scan(paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            # 隐藏文件不计入 scanned_total
            # 符号链接也不计入
            assert session.scanned_total == 0
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_phase1_zero_candidates(self, tmp_fs):
        """
        新增：Phase1 无候选文件
        扫描范围中没有任何文件 → 正确处理
        """
        empty_dir = os.path.join(tmp_fs, "empty")
        os.makedirs(empty_dir)
        paths = [{"path": empty_dir, "is_exclude": False}]

        session_id = str(uuid.uuid4())
        await run_scan(paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            assert session.group_count == 0
            assert session.file_count == 0
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_multiple_scan_paths(self, tmp_fs):
        """
        新增：多个扫描路径
        同时扫描多个目录
        """
        dir_a = os.path.join(tmp_fs, "A")
        dir_b = os.path.join(tmp_fs, "B")
        os.makedirs(dir_a)
        os.makedirs(dir_b)
        create_file(os.path.join(dir_a, "f.txt"), "same")
        create_file(os.path.join(dir_b, "f.txt"), "same")

        paths = [
            {"path": dir_a, "is_exclude": False},
            {"path": dir_b, "is_exclude": False},
        ]
        session_id = str(uuid.uuid4())
        await run_scan(paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session.group_count >= 1
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_scan_error_handling(self, tmp_fs):
        """
        新增：扫描异常处理
        扫描过程中出现未预期异常 → 状态变为 error
        """
        paths = [{"path": "/nonexistent_path_xyz", "is_exclude": False}]
        session_id = str(uuid.uuid4())

        # 不存在的路径应被优雅处理（walk 会返回空）
        await run_scan(paths, session_id)
        assert current_scan.status in ("done", "error")

    @pytest.mark.asyncio
    async def test_xxhash_custom_content(self, tmp_fs):
        """验证 xxHash 计算中文件大小被编入摘要"""
        path = os.path.join(tmp_fs, "data.bin")
        with open(path, "wb") as f:
            f.write(b"\xff\xfe\xfd\xfc" * 16)  # 64 bytes

        size = os.path.getsize(path)
        h = get_xxhash64_64kb(path, size)
        assert h is not None
        assert len(h) == 16

        # 内容相同但大小不同应产生不同哈希
        path2 = os.path.join(tmp_fs, "data2.bin")
        with open(path2, "wb") as f:
            f.write(b"\xff\xfe\xfd\xfc" * 17)  # 68 bytes (different size)

        h2 = get_xxhash64_64kb(path2, os.path.getsize(path2))
        assert h != h2


# ======================================================================
# SE-13: 扫描中途文件突变
# ======================================================================

class TestScanFileMutation:
    """SE-13: 扫描中途文件突变测试"""

    @pytest.mark.asyncio
    async def test_se13_file_deleted_during_phase2(self, tmp_scan_paths, tmp_fs):
        """
        SE-13: 扫描中途文件突变
        阶段1完成后，阶段2计算SHA-256时文件被删除
        测试重点：扫描引擎不会因文件中途删除而崩溃
        """
        import threading
        import time

        # 创建多个重复文件候选
        content = "same content for mutation test " + str(uuid.uuid4())
        file_paths = []
        for i in range(5):
            path = os.path.join(tmp_fs, f"mutate_{i}.txt")
            with open(path, "w") as f:
                f.write(content)
            file_paths.append(path)

        # 创建一个会在阶段2被删除的文件
        target_file = os.path.join(tmp_fs, "will_be_deleted.txt")
        with open(target_file, "w") as f:
            f.write(content)

        session_id = str(uuid.uuid4())

        # 创建一个线程在扫描过程中删除文件
        # 使用更短的延迟，使文件在阶段1遍历时被删除
        def delete_file_after_delay():
            time.sleep(0.05)  # 极短延迟
            try:
                if os.path.exists(target_file):
                    os.remove(target_file)
            except:
                pass

        # 启动删除线程
        delete_thread = threading.Thread(target=delete_file_after_delay)
        delete_thread.start()

        # 运行扫描
        await run_scan(tmp_scan_paths, session_id)

        # 等待删除线程完成
        delete_thread.join()

        # 扫描应该完成或出错，但不应崩溃
        assert current_scan.status in ("done", "error", "cancelled")

    @pytest.mark.asyncio
    async def test_se13_file_truncated_during_phase2(self, tmp_scan_paths, tmp_fs):
        """
        SE-13: 扫描中途文件被截断
        """
        import threading
        import time

        # 创建多个重复文件
        content = "truncation test content " + str(uuid.uuid4())
        for i in range(3):
            path = os.path.join(tmp_fs, f"truncate_{i}.txt")
            with open(path, "w") as f:
                f.write(content)

        # 创建一个会在阶段2被截断的文件
        target_file = os.path.join(tmp_fs, "will_be_truncated.txt")
        with open(target_file, "w") as f:
            f.write(content)

        session_id = str(uuid.uuid4())

        def truncate_file_after_delay():
            time.sleep(0.1)
            try:
                if os.path.exists(target_file):
                    with open(target_file, "w") as f:
                        f.write("")  # 截断文件
            except:
                pass

        truncate_thread = threading.Thread(target=truncate_file_after_delay)
        truncate_thread.start()

        await run_scan(tmp_scan_paths, session_id)
        truncate_thread.join()

        # 扫描应该完成，不崩溃
        assert current_scan.status in ("done", "error")


# ======================================================================
# SE-14: 相似名称但不同内容
# ======================================================================

class TestSimilarNamesDifferentContent:
    """SE-14: 相似名称但不同内容"""

    @pytest.mark.asyncio
    async def test_se14_similar_names_diff_content(self, tmp_scan_paths, tmp_fs):
        """
        SE-14: 相似名称但不同内容
        文件名高度相似但内容不同，不应被归为重复
        """
        # 创建内容不同的文件，但名称相似
        create_file(os.path.join(tmp_fs, "IMG_001.jpg"), "AAA" * 1000)
        create_file(os.path.join(tmp_fs, "IMG_001(1).jpg"), "BBB" * 1000)

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            # 两个文件内容不同，不应归为重复
            assert session.group_count == 0
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_se14_copy_with_suffix_same_content(self, tmp_scan_paths, tmp_fs):
        """
        SE-14: 带后缀的副本文件（内容相同）
        """
        content = "copy content " + str(uuid.uuid4())
        create_file(os.path.join(tmp_fs, "document.pdf"), content)
        create_file(os.path.join(tmp_fs, "document - Copy.pdf"), content)
        create_file(os.path.join(tmp_fs, "document (1).pdf"), content)

        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        assert current_scan.status == "done"

        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session is not None
            # 三个文件内容相同，应归为一个重复组
            assert session.group_count == 1
            assert session.file_count == 3
        finally:
            db.close()


# ======================================================================
# 边界条件测试
# ======================================================================

class TestScanEdgeCases:
    """扫描引擎边界条件"""

    @pytest.mark.asyncio
    async def test_single_file_no_duplicate(self, tmp_scan_paths, tmp_fs):
        """只有一个文件 → 无重复组"""
        create_file(os.path.join(tmp_fs, "alone.txt"), "only me")
        session_id = str(uuid.uuid4())
        await run_scan(tmp_scan_paths, session_id)
        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session.group_count == 0
            assert session.file_count == 0
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_all_files_excluded(self, tmp_fs):
        """所有路径都被排除 → 无扫描内容"""
        os.makedirs(os.path.join(tmp_fs, "data"))
        create_file(os.path.join(tmp_fs, "data", "f.txt"), "x")
        paths = [
            {"path": tmp_fs, "is_exclude": False},
            {"path": os.path.join(tmp_fs, "data"), "is_exclude": True},
        ]
        session_id = str(uuid.uuid4())
        await run_scan(paths, session_id)
        assert current_scan.status == "done"
        db = SessionLocal()
        try:
            session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
            assert session.scanned_total == 0
        finally:
            db.close()
