# 麦克斯韦妖 重复文件扫描与清理 — 测试用例规格文档

> **版本**: 1.0  
> **日期**: 2026-05-28  
> **对应项目**: `engineering/` — 重复文件扫描与清理工具  
> **本文档是独立补充规格**，不修改 `TECH_SPEC.md` 或任何源码。

---

## 目录

1. [概述与测试架构](#1-概述与测试架构)
2. [运行测试](#2-运行测试)
3. [测试用例总览矩阵](#3-测试用例总览矩阵)
4. [扫描引擎测试（SE）](#4-扫描引擎测试se)
5. [标记继承引擎测试（MK）](#5-标记继承引擎测试mk)
6. [方案分类引擎测试（SC）](#6-方案分类引擎测试sc)
7. [置灰红线规则测试（GR）](#7-置灰红线规则测试gr)
8. [手动调整规则测试（AD）](#8-手动调整规则测试ad)
9. [排序规则测试（SR）](#9-排序规则测试sr)
10. [操作执行引擎测试（AE）](#10-操作执行引擎测试ae)
11. [后端 API 路由测试（API）](#11-后端-api-路由测试api)
12. [WebSocket 推送协议测试（WS）](#12-websocket-推送协议测试ws)
13. [前端 Store 状态测试（FE-ST）](#13-前端-store-状态测试fe-st)
14. [前端页面交互测试（FE-UI）](#14-前端页面交互测试fe-ui)
15. [附录：测试用例对照表](#15-附录测试用例对照表)

---

## 1. 概述与测试架构

### 1.1 测试策略

| 层级 | 测试框架 | 测试类型 | 覆盖目标 |
|------|----------|----------|----------|
| 后端服务层 | pytest + pytest-asyncio | 单元测试 / 集成测试 | 扫描引擎、标记引擎、方案引擎、操作引擎 |
| 后端路由层 | pytest + httpx (AsyncClient) | 集成测试 | RESTful API 端点、参数校验、业务编排 |
| 后端 WebSocket | pytest + FakeConnectionManager | 单元测试 | 连接管理、广播协议、非阻塞保证 |
| 前端 Store | vitest | 单元测试 | Zustand 状态初始值、状态变更函数 |
| 前端 API 层 | vitest | 单元测试 | HTTP 方法、URL 构造、参数序列化 |
| 前端页面 | vitest + @testing-library/react | 组件测试 | 组件渲染、用户交互、状态联动 |

### 1.2 测试数据隔离

- **后端持久化**: 使用 SQLite `:memory:` 数据库，每个测试会话自动创建和销毁表结构。
- **文件系统**: 使用 `tempfile.TemporaryDirectory`（通过 `tmp_fs` fixture）创建临时目录模拟真实文件系统。
- **全局状态**: 每个测试前通过 `reset_global_state` fixture 重置 `current_scan`、`current_scheme`、`scheme_cache`、`current_action` 等全局单例。
- **WebSocket**: 使用 `FakeConnectionManager` 代替真实 WS 连接，广播操作记录到 `broadcast_history` 列表。

### 1.3 测试环境要求

| 组件 | 依赖 |
|------|------|
| 后端 | pytest、httpx、pytest-asyncio、xxhash |
| 前端 | vitest、@testing-library/react、@testing-library/jest-dom、jsdom |

---

## 2. 运行测试

### 2.1 后端测试

```bash
# 激活虚拟环境
cd engineering/backend
source venv/bin/activate

# 运行全部后端测试
cd ../..
python -m pytest tests/backend/ -v

# 运行特定测试文件
python -m pytest tests/backend/services/test_scan_engine.py -v

# 运行特定测试类
python -m pytest tests/backend/services/test_scan_engine.py::TestHashFunctions -v

# 运行特定测试方法
python -m pytest tests/backend/services/test_scan_engine.py::TestHashFunctions::test_se01_identical_files -v

# 显示详细输出
python -m pytest tests/backend/ -v --tb=long

# 跳过耗时测试
python -m pytest tests/backend/ -v -m "not slow"
```

### 2.2 前端测试

```bash
cd engineering/frontend

# 运行全部前端测试
npx vitest run

# 监听模式（开发时使用）
npx vitest

# 运行特定文件
npx vitest run src/__tests__/stores/scanStore.test.ts

# 带覆盖率报告
npx vitest run --coverage
```

---

## 3. 测试用例总览矩阵

| 分类 | ID 前缀 | 说明 | 总计 | 已实现 | 待实现 |
|------|---------|------|------|--------|--------|
| 扫描引擎 | SE | 两级哈希、目录遍历、排除/跳过逻辑、取消 | 12 | 10 | 2 |
| 标记引擎 | MK | 标记继承、兜底规则、清除标记、优先级 | 6 | 5 | 1 |
| 方案分类 | SC | 四类分组规则 | 4 | 4 | 0 |
| 置灰红线 | GR | 操作按钮置灰/解除判定 | 7 | 6 | 1 |
| 手动调整 | AD | 覆盖操作、视觉标记、不重分类 | 4 | 4 | 0 |
| 排序规则 | SR | 组排序、文件排序、树排序 | 5 | 5 | 0 |
| 操作引擎 | AE | 移动/删除、分批、取消、重命名、异常 | 8 | 6 | 2 |
| API 路由 | API | 端点调用、并发控制、分页、异常 | 9 | 8 | 1 |
| WebSocket | WS | 连接管理、推送协议、非阻塞 | 5 | 4 | 1 |
| Store 状态 | FE-ST | Zustand 状态流转 | 4 | 4 | 0 |
| 页面交互 | FE-UI | 组件渲染、按钮置灰、事件响应 | 6 | 0 | 6 |
| **合计** | — | — | **70** | **56** | **14** |

---

## 4. 扫描引擎测试（SE）

### 4.1 SE-01：两级哈希 — 完全相同文件

| 属性 | 内容 |
|------|------|
| **场景** | 创建 2 个内容完全相同的文件，验证完整的扫描链路 |
| **前置条件** | 在 `tmp_fs` 下创建 `dir1/fileA.txt` 和 `dir2/fileB.txt`，内容均为 `"Hello World"` |
| **操作步骤** | 1. 对两个文件分别计算头部 xxHash64（64KB以内全量）<br>2. 确认阶段1按 (xxHash, size) 落入同一组<br>3. 对同一组文件计算全量 SHA-256<br>4. 确认阶段2按 SHA-256 归为同一重复组 |
| **预期结果** | 两个文件通过两级哈希最终被确认为同一重复组 |
| **实现状态** | ✅ `test_se01_identical_files` (`test_scan_engine.py`) |

### 4.2 SE-02：两级哈希 — 头部相同但内容不同

| 属性 | 内容 |
|------|------|
| **场景** | 2 个文件前 64KB 完全相同但后续内容不同，阶段2应排除 |
| **前置条件** | 创建文件 A（96KB，尾部填充 `0xFF`）和文件 B（96KB，尾部填充 `0x00`），前 64KB 一致 |
| **操作步骤** | 1. 阶段1：两文件 xxHash 相同，归入同组<br>2. 阶段2：两文件 SHA-256 不同，不应归为同一组 |
| **预期结果** | 阶段1归为疑似重复，阶段2 SHA-256 不同，不归为重复 |
| **实现状态** | ✅ `test_se02_header_same_content_diff` (`test_scan_engine.py`) |

### 4.3 SE-03：两级哈希 — 大小不同

| 属性 | 内容 |
|------|------|
| **场景** | 2 个文件内容相同但大小不同，阶段1即排除 |
| **前置条件** | 创建文件 A（内容 `"hello"`）和文件 B（内容 `"hello world"`） |
| **操作步骤** | 1. 计算两文件头部 xxHash64<br>2. 因 size 不同，阶段1 (xxhash, size) 组合不同 |
| **预期结果** | 阶段1即排除（大小不同，不进入阶段2） |
| **实现状态** | ✅ `test_se03_diff_size` (`test_scan_engine.py`) |

### 4.4 SE-04：大文件头部哈希

| 属性 | 内容 |
|------|------|
| **场景** | 超大文件（>= 2GB）只读前 64KB 计算 xxHash |
| **前置条件** | 创建单个文件，大小 2GB |
| **操作步骤** | 调用 `get_xxhash64_64kb()`，只读前 64KB，不读取全部内容 |
| **预期结果** | 只对前 64KB 计算 xxHash，耗时 < 1s |
| **实现状态** | ✅ `test_se04_large_file_head_hash` (`test_scan_engine.py`) |

### 4.5 SE-05：扫描取消

| 属性 | 内容 |
|------|------|
| **场景** | 扫描进行中发起取消请求，安全停止 |
| **前置条件** | 创建数百个文件，扫描任务已在运行 |
| **操作步骤** | 1. 发出取消信号<br>2. 等待当前文件哈希完成<br>3. 扫描安全退出 |
| **预期结果** | 当前文件处理完后停止，状态变为 `cancelled`，中间数据不持久化 |
| **实现状态** | ✅ `test_se05_scan_cancel` (`test_scan_engine.py`) |

### 4.6 SE-06：排除目录

| 属性 | 内容 |
|------|------|
| **场景** | 设置排除路径后，不扫描被排除的目录（如群晖 `@eaDir`） |
| **前置条件** | 创建 `photos/`（含文件）和 `@eaDir/`（含文件）。排除列表包含 `@eaDir` |
| **操作步骤** | 执行扫描，传入排除路径列表 |
| **预期结果** | 不扫描 `@eaDir` 及其子文件 |
| **实现状态** | ✅ `test_se06_exclude_directory` (`test_scan_engine.py`) |

### 4.7 SE-07：空文件（0字节）

| 属性 | 内容 |
|------|------|
| **场景** | 多个 0 字节文件被跳过，不参与去重，但计入 `scanned_total` |
| **前置条件** | 创建 2 个 0 字节文件 |
| **操作步骤** | 执行扫描，检查统计结果 |
| **预期结果** | 跳过 0 字节文件，不参与去重，仅计入 `scanned_total` |
| **实现状态** | ✅ `test_se07_empty_files` (`test_scan_engine.py`) |

### 4.8 SE-08：符号链接

| 属性 | 内容 |
|------|------|
| **场景** | 目录中包含符号链接，不跟随 |
| **前置条件** | 创建真实文件 `real.txt`，创建指向它的符号链接 `link.txt` |
| **操作步骤** | 执行扫描 |
| **预期结果** | 不跟随符号链接，不计入 `scanned_total` |
| **实现状态** | ✅ `test_se08_symlink` (`test_scan_engine.py`) |

### 4.9 SE-09：权限不足文件

| 属性 | 内容 |
|------|------|
| **场景** | 文件无读权限时安全跳过并记录 |
| **前置条件** | 创建文件，用 `os.chmod(path, 0o000)` 去掉所有读权限 |
| **操作步骤** | 执行扫描，检查统计 |
| **预期结果** | 跳过权限不足文件，记录到不可读列表，仅计入 `scanned_total` |
| **实现状态** | ✅ `test_se09_no_perm_file` (`test_scan_engine.py`) |

### 4.10 SE-10：小文件全量读入

| 属性 | 内容 |
|------|------|
| **场景** | ≤ 64KB 的文件全量读入计算 xxHash |
| **前置条件** | 创建 2 个 4KB 文件，内容相同 |
| **操作步骤** | 1. 阶段1：全文件 xxHash<br>2. 阶段2：全文件 SHA-256 |
| **预期结果** | 归为同一重复组 |
| **实现状态** | ✅ `test_se10_small_file_full_read` (`test_scan_engine.py`) |

### 4.11 SE-11：复杂嵌套排除路径（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 多层嵌套排除路径：扫描 `/vol1`，排除 `/vol1/a/b`，但 `/vol1/a` 和 `/vol1/a/b/c` 需验证行为 |
| **前置条件** | 创建 `/vol1/a/b/excluded.txt`，`/vol1/a/b/c/included.txt` |
| **操作步骤** | scan_paths = `/vol1`，exclude_paths = [`/vol1/a/b`] |
| **预期结果** | `/vol1/a/b/` 被排除，其子目录 `/vol1/a/b/c/` 由于父级被排除也应被跳过 |
| **实现状态** | 📋 待实现 |

### 4.12 SE-12：Unicode/Emoji 与超长路径兼容（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 包含中文、日文、Emoji 字符以及超过 255 字符的路径 |
| **前置条件** | 创建文件：`你好世界_🌍_テスト.txt`，以及路径长度超过 255 字符的嵌套目录文件 |
| **操作步骤** | 执行扫描 |
| **预期结果** | 遍历和哈希计算正常，不会抛出编码或路径过长异常。超长路径文件正确计入统计 |
| **实现状态** | 📋 待实现 |

---

## 5. 标记继承引擎测试（MK）

### 5.1 MK-01：标记继承 — 基本

| 属性 | 内容 |
|------|------|
| **场景** | 子目录自动继承父目录标记 |
| **前置条件** | 标记 `/a` 为 `keep` |
| **操作步骤** | 计算 `/a/b/c.txt` 的标记 |
| **预期结果** | `c.txt` 继承 `/a` 的 `keep` 标记，`mark_source_type = folder_mark`，`mark_source = "inherited:/a"` |
| **实现状态** | ✅ `test_mk01_inherit_basic` (`test_scheme_engine.py`) |

### 5.2 MK-02：标记继承 — 子覆盖父

| 属性 | 内容 |
|------|------|
| **场景** | 子目录标记覆盖父目录标记 |
| **前置条件** | 标记 `/a` 为 `keep`，`/a/b` 为 `delete` |
| **操作步骤** | 计算 `/a/b/c.txt` 的标记 |
| **预期结果** | `c.txt` 继承 `/a/b` 的 `delete` 标记 |
| **实现状态** | ✅ `test_mk02_child_overrides_parent` (`test_scheme_engine.py`) |

### 5.3 MK-03：兜底规则 — 无标记

| 属性 | 内容 |
|------|------|
| **场景** | 全无标记时走兜底保留 |
| **前置条件** | 无任何文件夹标记 |
| **操作步骤** | 计算任意文件标记 |
| **预期结果** | 默认 `keep`，`mark_source = "default:keep"` |
| **实现状态** | ✅ `test_mk03_default_keep` (`test_scheme_engine.py`) |

### 5.4 MK-04：多级目录继承

| 属性 | 内容 |
|------|------|
| **场景** | 复杂多级混合继承 |
| **前置条件** | `/a` → `keep`，`/a/b/c` → `delete`，`/a/b/d` 无标记 |
| **操作步骤** | 分别计算 `/a/b/d/file.txt` 和 `/a/b/c/file.txt` |
| **预期结果** | `/a/b/d/file.txt` = `keep`（继承 `/a`），`/a/b/c/file.txt` = `delete`（显式继承 `/a/b/c`） |
| **实现状态** | ✅ `test_mk04_multi_level_inherit` (`test_scheme_engine.py`) |

### 5.5 MK-05：清除标记

| 属性 | 内容 |
|------|------|
| **场景** | 清除显式标记后回到继承兜底 |
| **前置条件** | 标记 `/a` 为 `keep`，随后从数据库删除该记录 |
| **操作步骤** | 计算 `/a/b/c.txt` |
| **预期结果** | 回到 `inherit`，走兜底 `keep` |
| **实现状态** | ✅ `test_mk05_clear_mark_falls_back` (`test_scheme_engine.py`) |

### 5.6 MK-06：路径规范冲突标记检测（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 用户输入的路径尾部可能带 `/` 或不带，确保继承行为一致 |
| **前置条件** | 标记 `/a` 为 `keep`，查询 `/a//b/c.txt`（双斜杠）或 `/a/b/c.txt` |
| **操作步骤** | 1. 标记 `/a` 为 `keep` <br>2. 查询 `/a/b/c.txt`（正常）<br>3. 查询 `/a//b/c.txt`（不规范路径） |
| **预期结果** | 不规范路径应被规范化为标准路径后再匹配，继承行为一致 |
| **实现状态** | 📋 待实现 |

---

## 6. 方案分类引擎测试（SC）

### 6.1 SC-01：只保留一个

| 属性 | 内容 |
|------|------|
| **场景** | 重复组内恰好有 1 个 `keep`，其余 `delete` |
| **前置条件** | 3 个重复文件，1 个 `keep`，2 个 `delete` |
| **操作步骤** | 调用分类引擎 |
| **预期结果** | 分类为 `keep_one` |
| **实现状态** | ✅ `test_sc01_keep_one` (`test_scheme_engine.py`) |

### 6.2 SC-02：部分保留

| 属性 | 内容 |
|------|------|
| **场景** | 重复组内多个 `keep` 且有 `delete` |
| **前置条件** | 4 个重复文件，2 个 `keep`，2 个 `delete` |
| **操作步骤** | 调用分类引擎 |
| **预期结果** | 分类为 `partial_keep` |
| **实现状态** | ✅ `test_sc02_partial_keep` (`test_scheme_engine.py`) |

### 6.3 SC-03：全保留

| 属性 | 内容 |
|------|------|
| **场景** | 重复组内全部标记为 `keep` |
| **前置条件** | 3 个重复文件，全部 `keep` |
| **操作步骤** | 调用分类引擎 |
| **预期结果** | 分类为 `keep_all` |
| **实现状态** | ✅ `test_sc03_keep_all` (`test_scheme_engine.py`) |

### 6.4 SC-04：全删除

| 属性 | 内容 |
|------|------|
| **场景** | 重复组内全部标记为 `delete` |
| **前置条件** | 3 个重复文件，全部 `delete` |
| **操作步骤** | 调用分类引擎 |
| **预期结果** | 分类为 `delete_all` |
| **实现状态** | ✅ `test_sc04_delete_all` (`test_scheme_engine.py`) |

---

## 7. 置灰红线规则测试（GR）

### 7.1 GR-01：无全 delete 组

| 属性 | 内容 |
|------|------|
| **场景** | 分类内所有组至少有一个 `keep`，按钮可点击 |
| **前置条件** | 分类内 2 个组，每个组都有至少 1 个 `keep` |
| **操作步骤** | 检查操作按钮状态 |
| **预期结果** | 按钮可点击（非置灰） |
| **实现状态** | ✅ `test_gr01_no_all_delete` (`test_scheme_engine.py`) |

### 7.2 GR-02：存在全 delete 组

| 属性 | 内容 |
|------|------|
| **场景** | 分类内有任一组全部为 `delete`，按钮置灰 |
| **前置条件** | 分类内组 1 正常，组 2 全部文件为 `delete` |
| **操作步骤** | 检查操作按钮状态 |
| **预期结果** | 按钮置灰 |
| **实现状态** | ✅ `test_gr02_has_all_delete` (`test_scheme_engine.py`) |

### 7.3 GR-03：手动调整后仍置灰（仍有其他全 delete 组）

| 属性 | 内容 |
|------|------|
| **场景** | 手动修复一个全 delete 组，但分类内仍存在其他全 delete 组，按钮依然置灰 |
| **前置条件** | 手动将组 2 的 1 个文件改为 `keep`，但组 3 仍然全 `delete` |
| **操作步骤** | 检查按钮状态 |
| **预期结果** | 仍置灰 |
| **实现状态** | ✅ `test_gr05_manual_change_causes_all_delete`（GR-03场景已通过GR-05逻辑覆盖） |

### 7.4 GR-04：所有组都解除全 delete

| 属性 | 内容 |
|------|------|
| **场景** | 分类内所有全 delete 组都被修复，按钮恢复可点击 |
| **前置条件** | 所有之前为全 delete 的组都改出至少 1 个 `keep` |
| **操作步骤** | 检查按钮状态 |
| **预期结果** | 按钮恢复可点击 |
| **实现状态** | ✅ `test_gr04_all_groups_resolved` (`test_scheme_engine.py`) |

### 7.5 GR-05：手动调整导致新全 delete

| 属性 | 内容 |
|------|------|
| **场景** | 原本安全的组（如 keep_one）因手动调整唯一保留文件变为 delete，导致置灰 |
| **前置条件** | keep_one 分类的组中唯一 `keep` 文件改为 `delete` |
| **操作步骤** | 检查按钮状态 |
| **预期结果** | 置灰（该组最终动作变为全 delete） |
| **实现状态** | ✅ `test_gr05_manual_change_causes_all_delete` (`test_scheme_engine.py`) |

### 7.6 GR-06：解除由手动调整导致的全 delete

| 属性 | 内容 |
|------|------|
| **场景** | 手动改回一个文件为 `keep`，置灰解除 |
| **前置条件** | GR-05 造成的全 delete 组中改回 1 个文件为 `keep`，且分类内无其他全 delete 组 |
| **操作步骤** | 检查按钮状态 |
| **预期结果** | 恢复可点击 |
| **实现状态** | ✅ `test_gr06_resolve_manual_all_delete` (`test_scheme_engine.py`) |

### 7.7 GR-07：文件夹标记 + 手动覆盖交互红线（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 文件夹标记使整组全为 `delete`，但其中某文件在明细页被手动覆盖为 `keep`，验证红线是否能正确解除 |
| **前置条件** | 文件夹标记使某组全为 `delete` → 按钮置灰。用户将该组内 1 个文件手动覆盖为 `keep` |
| **操作步骤** | 1. 设置文件夹标记使该组全 `delete`<br>2. 确认按钮置灰<br>3. 手动覆盖组内 1 文件为 `keep`<br>4. 再次检查按钮状态 |
| **预期结果** | 如果该 `keep` 覆盖解除了该组的全 `delete` 状态，且分类内无其他全 `delete` 组，按钮恢复可点击 |
| **实现状态** | 📋 待实现 |

---

## 8. 手动调整规则测试（AD）

### 8.1 AD-01：手动调整不重分类

| 属性 | 内容 |
|------|------|
| **场景** | 调整文件动作后组的分类不变 |
| **前置条件** | `keep_one` 组中 1 个文件改为 `delete` |
| **操作步骤** | 检查组分类是否发生变化 |
| **预期结果** | 仍为 `keep_one`，不触发重分类 |
| **实现状态** | ✅ `test_ad01_no_reclassification` (`test_scheme_engine.py`) |

### 8.2 AD-02：手动调整视觉标记

| 属性 | 内容 |
|------|------|
| **场景** | 被手动调整的文件显示小圆点标记 |
| **前置条件** | 文件被手动调整（写入 `file_overrides`） |
| **操作步骤** | 查看文件的 `mark_source_type` |
| **预期结果** | `mark_source_type = override` |
| **实现状态** | ✅ `test_ad02_override_visual_marker` (`test_scheme_engine.py`) |

### 8.3 AD-03：手动调整排序（合并至 SR-03）

| 属性 | 内容 |
|------|------|
| **场景** | 手动调整的文件在组内置顶 |
| **前置条件** | 组内 1 个文件被手动调整 |
| **操作步骤** | 查看该组内文件列表排序 |
| **预期结果** | 手动调整该文件排在组内最前面 |
| **实现状态** | ✅ `test_sr03_file_sort_override_on_top`（合并至排序测试） |

### 8.4 AD-04：置灰判断基于最终动作

| 属性 | 内容 |
|------|------|
| **场景** | 唯一保留的文件被手动改为 `delete` 后，触发置灰 |
| **前置条件** | `keep_one` 组中唯一的 `keep` 文件被覆盖为 `delete` |
| **操作步骤** | 检查按钮置灰状态 |
| **预期结果** | 置灰（最终动作全为 `delete`） |
| **实现状态** | ✅ 已覆盖于 GR-05 |

---

## 9. 排序规则测试（SR）

### 9.1 SR-01：组排序 — 调整置顶

| 属性 | 内容 |
|------|------|
| **场景** | 包含手动调整文件的组排在未调整组之前 |
| **前置条件** | 分类内组 A（有手动调整）和组 B（无手动调整） |
| **操作步骤** | 按排序规则排序 |
| **预期结果** | 组 A 排在组 B 前面 |
| **实现状态** | ✅ `test_sr01_override_groups_on_top` (`test_scheme_engine.py`) |

### 9.2 SR-02：组排序 — 未调整按空间（合并至 SR-01）

| 属性 | 内容 |
|------|------|
| **场景** | 未调整的组按可释放空间降序排列 |
| **前置条件** | 2 个未调整组，可释放空间分别为 800MB 和 200MB |
| **操作步骤** | 按排序 key 排序 |
| **预期结果** | 800MB 的组排在 200MB 的组前面 |
| **实现状态** | ✅ 已覆盖于 `test_sr01` 的排序 key 逻辑 |

### 9.3 SR-03：文件排序 — 调整置顶

| 属性 | 内容 |
|------|------|
| **场景** | 被手动调整的文件在组内排最前面 |
| **前置条件** | 组内 3 个文件，其中 1 个被手动调整 |
| **操作步骤** | 排序组内文件 |
| **预期结果** | 手动调整过的文件排在组内最前 |
| **实现状态** | ✅ `test_sr03_file_sort_override_on_top` (`test_scheme_engine.py`) |

### 9.4 SR-04：文件排序 — 保留在前

| 属性 | 内容 |
|------|------|
| **场景** | `keep` 文件排在 `delete` 文件前面 |
| **前置条件** | 组内 3 个 `keep` 和 2 个 `delete` |
| **操作步骤** | 排序组内文件（先按调整状态，再按动作类型） |
| **预期结果** | `keep` 文件排在 `delete` 文件前面 |
| **实现状态** | ✅ `test_sr04_keep_before_delete` (`test_scheme_engine.py`) |

### 9.5 SR-05：文件夹树字母序

| 属性 | 内容 |
|------|------|
| **场景** | 标记过的文件夹不改变在字母序中的位置 |
| **前置条件** | 标记 `/photos` 为 `keep`，同级还有 `/backup`、`/downloads` |
| **操作步骤** | 按字母序排序同级目录 |
| **预期结果** | 排序为：`/backup` → `/downloads` → `/photos`，标记不影响位置 |
| **实现状态** | ✅ `test_sr05_folder_tree_alpha_order` (`test_scheme_engine.py`) |

---

## 10. 操作执行引擎测试（AE）

### 10.1 AE-01：基本移动到文件夹

| 属性 | 内容 |
|------|------|
| **场景** | 文件成功从源目录移动到目标目录 |
| **前置条件** | `src/` 下有 3 个文件 |
| **操作步骤** | 调用 `execute_move_to_folder(session, files, dst)` |
| **预期结果** | 3 个文件出现在目标目录，源文件被移除 |
| **实现状态** | ✅ `test_basic_move` (`test_action_engine.py`) |

### 10.2 AE-02：目标目录不存在时自动创建

| 属性 | 内容 |
|------|------|
| **场景** | 目标目录的深层嵌套路径不存在时自动递归创建 |
| **前置条件** | 目标目录 `deep/nested/dst/` 不存在 |
| **操作步骤** | 调用 `execute_move_to_folder` |
| **预期结果** | 自动创建目录结构，文件成功移动 |
| **实现状态** | ✅ `test_move_creates_destination` (`test_action_engine.py`) |

### 10.3 AE-03：目标重名冲突自动重命名

| 属性 | 内容 |
|------|------|
| **场景** | 目标目录已有同名文件时自动追加 `_1`、`_2` 后缀 |
| **前置条件** | `dst/data.txt` 已存在 |
| **操作步骤** | 移动 `src/data.txt` 到 `dst/` |
| **预期结果** | 原始 `data.txt` 保留，新文件被重命名为 `data_1.txt` |
| **实现状态** | ✅ `test_filename_collision` (`test_action_engine.py`) |

### 10.4 AE-04：超过 100 个文件时分批处理

| 属性 | 内容 |
|------|------|
| **场景** | 分批执行验证：100 个一批 |
| **前置条件** | 创建 150 个待移动文件 |
| **操作步骤** | 调用 `execute_move_to_folder` |
| **预期结果** | 总共 150 个文件全部移动到目标目录 |
| **实现状态** | ✅ `test_multi_batch_move` (`test_action_engine.py`) |

### 10.5 AE-05：取消移动操作

| 属性 | 内容 |
|------|------|
| **场景** | 中途取消后部分文件已转移、部分保留在原位 |
| **前置条件** | 创建 200 个待移动文件 |
| **操作步骤** | 设置 `current_action.cancel_flag = True`，调用 `execute_move_to_folder` |
| **预期结果** | 不抛出异常，部分文件已被移动，未移动文件保留在原位 |
| **实现状态** | ✅ `test_cancel_during_move` (`test_action_engine.py`) |

### 10.6 AE-06：Docker 模式废纸篓

| 属性 | 内容 |
|------|------|
| **场景** | Docker 模式下移动到 `#recycle` 目录 |
| **前置条件** | `DOCKER_MODE=true`，`NAS_ROOT=tmp_fs` |
| **操作步骤** | 调用 `execute_move_to_trash` |
| **预期结果** | 文件出现在 `#recycle/` 下，源文件被移除 |
| **实现状态** | ✅ `test_docker_mode_trash` (`test_action_engine.py`) |

### 10.7 AE-07：跨文件系统/物理硬盘移动（新增）

| 属性 | 内容 |
|------|------|
| **场景** | `os.rename` 跨硬盘时报 `EXDEV`（跨设备链接无效），自动降级为复制+删除 |
| **前置条件** | 模拟 `os.rename` 抛出 `OSError` 且 `errno == 18`（EXDEV） |
| **操作步骤** | 1. 调用 `execute_move_to_folder`<br>2. 验证降级逻辑触发<br>3. 验证文件内容完整（通过 SHA-256 校验） |
| **预期结果** | `shutil.copy2` + `os.remove` 完成移动，文件内容一致，源文件被删除 |
| **实现状态** | 📋 待实现 |

### 10.8 AE-08：目标磁盘空间不足/写保护（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 移动途中磁盘写满或写权限不足，被跳过的文件留在原位并报告错误 |
| **前置条件** | 模拟 `open(dest, 'wb')` 抛出 `OSError`（如 `ENOSPC` 或 `EROFS`） |
| **操作步骤** | 1. 调用 `execute_move_to_folder`<br>2. 验证异常处理 |
| **预期结果** | 中断后已成功移动的文件保留在目标目录，出错文件保留在原位，操作状态为 `error` |
| **实现状态** | 📋 待实现 |

---

## 11. 后端 API 路由测试（API）

### 11.1 API-01：完整扫描流程

| 属性 | 内容 |
|------|------|
| **场景** | 创建测试文件 → 启动扫描 → 等待完成 → 验证结果 |
| **前置条件** | 在 `test_scan_dir/` 下创建 2 个相同文件 |
| **操作步骤** | POST `/api/scan/start` → 等待 → GET `/api/scan/status` |
| **预期结果** | 返回正确的重复组和统计：1 组，2 个文件 |
| **实现状态** | ✅ `test_start_scan` (`test_scan_api.py`) |

### 11.2 API-02：加载结果

| 属性 | 内容 |
|------|------|
| **场景** | 扫描完成后重新加载结果 |
| **前置条件** | 扫描已完成 |
| **操作步骤** | GET `/api/sessions` → GET `/api/sessions/{id}` |
| **预期结果** | 正确列出所有会话，加载指定会话的详情 |
| **实现状态** | ✅ `test_list_sessions` / `test_get_session_detail` (`test_results_api.py`) |

### 11.3 API-03：文件夹标记

| 属性 | 内容 |
|------|------|
| **场景** | 标记文件夹并检查继承 |
| **前置条件** | 有已完成扫描的会话 |
| **操作步骤** | PUT `/api/sessions/{id}/folders/mark` → GET `/api/sessions/{id}/folders/marks` |
| **预期结果** | 标记持久化，子目录继承 |
| **实现状态** | ✅ `test_set_mark` / `test_get_marks` (`test_folders_api.py`) |

### 11.4 API-04：方案生成

| 属性 | 内容 |
|------|------|
| **场景** | 标记完成后生成方案 |
| **前置条件** | 标记已设置 |
| **操作步骤** | POST `/api/sessions/{id}/scheme/generate` → GET `/api/sessions/{id}/scheme/categories` |
| **预期结果** | 返回 4 类分组统计（keep_one / partial_keep / keep_all / delete_all） |
| **实现状态** | ✅ `test_generate_scheme` / `test_get_categories` (`test_scheme_api.py`) |

### 11.5 API-05：文件级手动覆盖

| 属性 | 内容 |
|------|------|
| **场景** | 在明细页修改文件动作后持久化 |
| **前置条件** | 方案已生成 |
| **操作步骤** | PUT `/api/sessions/{id}/scheme/file-action` → GET 验证 |
| **预期结果** | `file_overrides` 表写入，置灰状态更新 |
| **实现状态** | ✅ `test_file_action_override` (`test_scheme_api.py`) |

### 11.6 API-06：分页获取结果

| 属性 | 内容 |
|------|------|
| **场景** | 分页参数边界测试 |
| **前置条件** | 扫描已完成，有大量文件 |
| **操作步骤** | GET `/api/sessions/{id}/files?page=2&page_size=50` |
| **预期结果** | 返回正确的分页数据（第二页，每页 50 条） |
| **实现状态** | ✅ `test_get_files_pagination` (`test_results_api.py`) |

### 11.7 API-07：WebSocket 进度推送（待完善）

| 属性 | 内容 |
|------|------|
| **场景** | 连接 WS 并接收扫描进度数据 |
| **前置条件** | 创建扫描任务，客户端连接 `/ws/scan/progress` |
| **操作步骤** | 启动扫描，监听 WS 消息 |
| **预期结果** | 阶段1：收到 `scanned`、`current_file`，无 `percent`/`total_estimate`；阶段2：收到 `computed`、`total_candidates`、`percent`、`current_file`、`remaining_estimate_sec` |
| **实现状态** | 📋 待实现（需 WebSocket 集成测试框架） |

### 11.8 API-08：并发扫描拒绝

| 属性 | 内容 |
|------|------|
| **场景** | 同时发起两次扫描请求，第二次被拒绝 |
| **前置条件** | 第一次扫描正在运行 |
| **操作步骤** | 连续发送两次 POST `/api/scan/start` |
| **预期结果** | 第二次返回 400 或 409 错误，提示"已有扫描任务在运行" |
| **实现状态** | ✅ `test_concurrent_scan_rejected` (`test_scan_api.py`) |

### 11.9 API-09：取消扫描

| 属性 | 内容 |
|------|------|
| **场景** | 扫描中发取消请求 |
| **前置条件** | 扫描任务正在运行 |
| **操作步骤** | POST `/api/scan/cancel` |
| **预期结果** | 扫描停止，状态变为 `cancelled` |
| **实现状态** | ✅ `test_cancel_scan` (`test_scan_api.py`) |

### 11.10 API-10：异常 UUID 会话 404（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 访问不存在的会话 UUID |
| **前置条件** | 扫描未发起或使用随机 UUID |
| **操作步骤** | GET `/api/sessions/{nonexistent_uuid}` |
| **预期结果** | 返回 404，不泄露服务端堆栈信息 |
| **实现状态** | 📋 待实现 |

---

## 12. WebSocket 推送协议测试（WS）

### 12.1 WS-01：连接管理

| 属性 | 内容 |
|------|------|
| **场景** | 连接建立、通道路由、断开自动清理 |
| **前置条件** | FakeConnectionManager 实例 |
| **操作步骤** | 模拟连接 `scan` 和 `action` 通道 |
| **预期结果** | 连接后 `active_connections` 计数增加；断开后自动移除 |
| **实现状态** | ✅ `test_connect_disconnect` / `test_unknown_channel_created` (`test_ws_manager.py`) |

### 12.2 WS-02：阶段1推送格式

| 属性 | 内容 |
|------|------|
| **场景** | 阶段1进度仅推送 `scanned` 和 `current_file` |
| **前置条件** | 扫描任务处于阶段1 |
| **操作步骤** | 检查 WS 广播消息 |
| **预期结果** | 仅包含 `scanned`（整数）和 `current_file`（字符串），不含 `percent`、`total_estimate`、`remaining_estimate_sec` |
| **实现状态** | ✅ `test_broadcast_history` (`test_ws_manager.py`，格式验证) |

### 12.3 WS-03：阶段2推送格式

| 属性 | 内容 |
|------|------|
| **场景** | 阶段2推送包含完整进度字段 |
| **前置条件** | 扫描任务处于阶段2 |
| **操作步骤** | 检查 WS 广播消息 |
| **预期结果** | 包含 `computed`、`total_candidates`、`percent`、`current_file`、`remaining_estimate_sec` |
| **实现状态** | ✅ `test_broadcast_history` (`test_ws_manager.py`，格式验证) |

### 12.4 WS-04：方案生成进度格式

| 属性 | 内容 |
|------|------|
| **场景** | 异步方案生成进度推送 |
| **前置条件** | 方案生成异步任务启动 |
| **操作步骤** | 监听 WS 消息，检查格式 |
| **预期结果** | 进行中：`type: "scheme_progress"` 含 `stage`/`processed`/`total`/`percent`/`elapsed_sec`；完成：`stage: "done"`，`percent: 100.0` |
| **实现状态** | ✅ `test_broadcast_history` (`test_ws_manager.py`，格式验证) |

### 12.5 WS-05：慢客户端非阻塞广播（新增）

| 属性 | 内容 |
|------|------|
| **场景** | 其中一个 WebSocket 客户端由于网络慢导致发送队列积压时，不阻塞向其他客户端广播 |
| **前置条件** | 订阅了 3 个客户端，其中 1 个模拟 `send_bytes` 缓慢 |
| **操作步骤** | 广播 `action_progress` 事件 |
| **预期结果** | 慢客户端抛出异常后自动断开（不会导致服务端崩溃），其他 2 个正常客户端持续接收事件 |
| **实现状态** | 📋 待实现 |

---

## 13. 前端 Store 状态测试（FE-ST）

### 13.1 FE-ST-01：scanStore

| 属性 | 内容 |
|------|------|
| **场景** | 扫描状态管理 Store 的初始化及状态变更 |
| **前置条件** | 新建 Store 实例 |
| **操作步骤** | 1. 验证初始状态<br>2. 调用 `setScanPaths`<br>3. 调用 `setSessionId`<br>4. 调用 `setStatus`<br>5. 调用 `updateProgress`（phase1 / phase2）<br>6. 调用 `reset` |
| **预期结果** | 初始状态正确；各 setter 更新对应字段；`updateProgress` 正确解析 WS 推送的阶段数据并保留另一个阶段快照；reset 重置为初始状态 |
| **实现状态** | ✅ `scanStore.test.ts` |

### 13.2 FE-ST-02：resultStore

| 属性 | 内容 |
|------|------|
| **场景** | 扫描结果 Store 的状态初始化及摘要更新 |
| **前置条件** | 新建 Store 实例 |
| **操作步骤** | 1. 验证初始状态<br>2. 调用 `setSummary` |
| **预期结果** | 初始状态为 `null`；`setSummary` 正确更新 summary 字段 |
| **实现状态** | ✅ `resultStore.test.ts` |

### 13.3 FE-ST-03：markStore

| 属性 | 内容 |
|------|------|
| **场景** | 文件夹标记 Store 的初始化及更新 |
| **前置条件** | 新建 Store 实例 |
| **操作步骤** | 1. 验证初始状态<br>2. 调用 `setMarks`<br>3. 调用 `updateMark`（添加/更新/删除） |
| **预期结果** | 初始状态为空 Map；各操作正确维护 marks 集合 |
| **实现状态** | ✅ `markStore.test.ts` |

### 13.4 FE-ST-04：schemeStore

| 属性 | 内容 |
|------|------|
| **场景** | 方案分类 Store 的初始化及更新 |
| **前置条件** | 新建 Store 实例 |
| **操作步骤** | 1. 验证初始状态<br>2. 调用 `setCategories`<br>3. 调用 `setLastSaved`<br>4. 调用 `setFinishedAt` |
| **预期结果** | 初始状态为空/0；各 setter 正确更新对应字段；时间戳正确存储 |
| **实现状态** | ✅ `schemeStore.test.ts` |

---

## 14. 前端页面交互测试（FE-UI）

### 14.1 FE-UI-01：首页（Home）加载

| 属性 | 内容 |
|------|------|
| **场景** | 访问 `/` 路径，渲染欢迎卡片和按钮并验证路由导航 |
| **前置条件** | 无（不依赖后端数据） |
| **操作步骤** | 1. 渲染 `<Home />` 组件（包裹在 `<BrowserRouter>` 中）<br>2. 验证欢迎卡片元素存在<br>3. 验证"新建扫描"和"加载已有结果"按钮存在<br>4. 点击按钮验证路由跳转 |
| **预期结果** | 显示欢迎卡片；两个按钮均正确渲染并可点击；点击后导航到 `/new-scan` 和 `/saved-results` |
| **实现状态** | 📋 待完善（当前为占位测试） |

### 14.2 FE-UI-02：新建扫描（NewScan）

| 属性 | 内容 |
|------|------|
| **场景** | 添加扫描路径、排除路径，开始扫描按钮状态联动 |
| **前置条件** | 无 |
| **操作步骤** | 1. 渲染 `<NewScan />`<br>2. 添加扫描路径 `"/volume1/photos"`<br>3. 添加排除路径 `"/volume1/photos/@eaDir"`<br>4. 验证路径列表渲染<br>5. 点击"开始扫描" |
| **预期结果** | 路径正确列在列表中；排除区域可折叠；路径非空时"开始扫描"按钮可点击；点击后路由跳转至 `/scan-progress` |
| **实现状态** | 📋 待完善（当前为占位测试） |

### 14.3 FE-UI-03：扫描进度（ScanProgress）

| 属性 | 内容 |
|------|------|
| **场景** | 阶段1和阶段2的不同 UI 表现 |
| **前置条件** | 通过 Store 注入模拟阶段1/阶段2数据 |
| **操作步骤** | 1. 渲染组件，`status=phase1`：验证仅显示文件计数，无百分比/进度条/剩余时间<br>2. 通过 Store 更新为 `status=phase2`：验证显示已计算/候选数、百分比、进度条、剩余时间<br>3. 验证"取消扫描"按钮存在<br>4. 点击取消并确认 |
| **预期结果** | 阶段1 UI 差异正确；阶段2 UI 要素完整；取消弹窗和路由跳转正常 |
| **实现状态** | 📋 待完善（当前为占位测试） |

### 14.4 FE-UI-04：文件夹标记（FolderMarking）树形交互

| 属性 | 内容 |
|------|------|
| **场景** | 文件夹树展开、折叠、三态标记切换 |
| **前置条件** | 通过 Store 注入模拟文件树数据 |
| **操作步骤** | 1. 渲染 `<FolderMarking />`<br>2. 展开/收起分支节点<br>3. 点击节点标记键：第1次→保留（蓝），第2次→删除（红），第3次→取消标记（继承/无色） |
| **预期结果** | 树节点正常展开/收起；三态切换正确；颜色区分正确；自动保存状态更新 |
| **实现状态** | 📋 待完善（当前为占位测试） |

### 14.5 FE-UI-05：方案分类（SchemeCategory）卡片

| 属性 | 内容 |
|------|------|
| **场景** | 4张分类卡片的固定顺序和统计信息 |
| **前置条件** | 通过 Store 注入各类分类数据 |
| **操作步骤** | 1. 渲染 `<SchemeCategory />`<br>2. 验证卡片顺序：只保留一个 → 部分保留 → 全保留 → 全删除<br>3. 点击分类卡片跳转到分类明细页 |
| **预期结果** | 4张卡片严格按照固定顺序排列；每张卡片显示正确的 N组 / M/N文件 / X/Y 大小；点击可跳转 |
| **实现状态** | 📋 待完善（当前为占位测试） |

### 14.6 FE-UI-06：分类明细（CategoryDetail）交互

| 属性 | 内容 |
|------|------|
| **场景** | 表格加载、手动调整文件动作、置灰红线视觉反馈 |
| **前置条件** | 通过 Store 注入某分类的组列表数据 |
| **操作步骤** | 1. 渲染 `<CategoryDetail type="keep_one" />`<br>2. 验证表格分页加载<br>3. 点击文件状态列（✓保留 / ✗删除）切换文件动作<br>4. 验证小圆点标记出现<br>5. 验证被修改文件和组排序变化<br>6. 模拟全 delete 组，验证"移动到文件夹"和"移动到废纸篓"按钮变为置灰态（`disabled` 样式、`cursor: not-allowed`）<br>7. 手动修复为至少1个 `keep`，验证按钮恢复 |
| **预期结果** | 表格正确分页；文件动作切换正确；小圆点标记出现；全 delete 组时按钮置灰；修复后按钮恢复 |
| **实现状态** | 📋 待完善（当前为占位测试） |

---

## 15. 附录：测试用例对照表

### 15.1 扫描引擎（SE）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| SE-01 | `test_se01_identical_files` | `test_scan_engine.py` | ✅ 已实现 |
| SE-02 | `test_se02_header_same_content_diff` | `test_scan_engine.py` | ✅ 已实现 |
| SE-03 | `test_se03_diff_size` | `test_scan_engine.py` | ✅ 已实现 |
| SE-04 | `test_se04_large_file_head_hash` | `test_scan_engine.py` | ✅ 已实现 |
| SE-05 | `test_se05_scan_cancel` | `test_scan_engine.py` | ✅ 已实现 |
| SE-06 | `test_se06_exclude_directory` | `test_scan_engine.py` | ✅ 已实现 |
| SE-07 | `test_se07_empty_files` | `test_scan_engine.py` | ✅ 已实现 |
| SE-08 | `test_se08_symlink` | `test_scan_engine.py` | ✅ 已实现 |
| SE-09 | `test_se09_no_perm_file` | `test_scan_engine.py` | ✅ 已实现 |
| SE-10 | `test_se10_small_file_full_read` | `test_scan_engine.py` | ✅ 已实现 |
| SE-11 | *待实现* | *待定* | 📋 待实现 |
| SE-12 | *待实现* | *待定* | 📋 待实现 |

### 15.2 标记引擎（MK）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| MK-01 | `test_mk01_inherit_basic` | `test_scheme_engine.py` | ✅ 已实现 |
| MK-02 | `test_mk02_child_overrides_parent` | `test_scheme_engine.py` | ✅ 已实现 |
| MK-03 | `test_mk03_default_keep` | `test_scheme_engine.py` | ✅ 已实现 |
| MK-04 | `test_mk04_multi_level_inherit` | `test_scheme_engine.py` | ✅ 已实现 |
| MK-05 | `test_mk05_clear_mark_falls_back` | `test_scheme_engine.py` | ✅ 已实现 |
| MK-06 | *待实现* | *待定* | 📋 待实现 |

### 15.3 方案分类（SC）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| SC-01 | `test_sc01_keep_one` | `test_scheme_engine.py` | ✅ 已实现 |
| SC-02 | `test_sc02_partial_keep` | `test_scheme_engine.py` | ✅ 已实现 |
| SC-03 | `test_sc03_keep_all` | `test_scheme_engine.py` | ✅ 已实现 |
| SC-04 | `test_sc04_delete_all` | `test_scheme_engine.py` | ✅ 已实现 |

### 15.4 置灰规则（GR）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| GR-01 | `test_gr01_no_all_delete` | `test_scheme_engine.py` | ✅ 已实现 |
| GR-02 | `test_gr02_has_all_delete` | `test_scheme_engine.py` | ✅ 已实现 |
| GR-03 | （见 GR-05 覆盖） | `test_scheme_engine.py` | ✅ 已覆盖 |
| GR-04 | `test_gr04_all_groups_resolved` | `test_scheme_engine.py` | ✅ 已实现 |
| GR-05 | `test_gr05_manual_change_causes_all_delete` | `test_scheme_engine.py` | ✅ 已实现 |
| GR-06 | `test_gr06_resolve_manual_all_delete` | `test_scheme_engine.py` | ✅ 已实现 |
| GR-07 | *待实现* | *待定* | 📋 待实现 |

### 15.5 手动调整（AD）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| AD-01 | `test_ad01_no_reclassification` | `test_scheme_engine.py` | ✅ 已实现 |
| AD-02 | `test_ad02_override_visual_marker` | `test_scheme_engine.py` | ✅ 已实现 |
| AD-03 | `test_sr03_file_sort_override_on_top` | `test_scheme_engine.py` | ✅ 已覆盖 |
| AD-04 | `test_gr05_manual_change_causes_all_delete` | `test_scheme_engine.py` | ✅ 已覆盖 |

### 15.6 排序规则（SR）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| SR-01 | `test_sr01_override_groups_on_top` | `test_scheme_engine.py` | ✅ 已实现 |
| SR-02 | （已覆盖于 SR-01 排序 key） | `test_scheme_engine.py` | ✅ 已覆盖 |
| SR-03 | `test_sr03_file_sort_override_on_top` | `test_scheme_engine.py` | ✅ 已实现 |
| SR-04 | `test_sr04_keep_before_delete` | `test_scheme_engine.py` | ✅ 已实现 |
| SR-05 | `test_sr05_folder_tree_alpha_order` | `test_scheme_engine.py` | ✅ 已实现 |

### 15.7 操作引擎（AE）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| AE-01 | `test_basic_move` | `test_action_engine.py` | ✅ 已实现 |
| AE-02 | `test_move_creates_destination` | `test_action_engine.py` | ✅ 已实现 |
| AE-03 | `test_filename_collision` | `test_action_engine.py` | ✅ 已实现 |
| AE-04 | `test_multi_batch_move` | `test_action_engine.py` | ✅ 已实现 |
| AE-05 | `test_cancel_during_move` | `test_action_engine.py` | ✅ 已实现 |
| AE-06 | `test_docker_mode_trash` | `test_action_engine.py` | ✅ 已实现 |
| AE-07 | *待实现* | *待定* | 📋 待实现 |
| AE-08 | *待实现* | *待定* | 📋 待实现 |

### 15.8 后端 API（API）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| API-01 | `test_start_scan` | `test_scan_api.py` | ✅ 已实现 |
| API-02 | `test_list_sessions` / `test_get_session_detail` | `test_results_api.py` | ✅ 已实现 |
| API-03 | `test_set_mark` / `test_get_marks` | `test_folders_api.py` | ✅ 已实现 |
| API-04 | `test_generate_scheme` / `test_get_categories` | `test_scheme_api.py` | ✅ 已实现 |
| API-05 | `test_file_action_override` | `test_scheme_api.py` | ✅ 已实现 |
| API-06 | `test_get_files_pagination` | `test_results_api.py` | ✅ 已实现 |
| API-07 | *待实现（需 WS 集成测试）* | *待定* | 📋 待实现 |
| API-08 | `test_concurrent_scan_rejected` | `test_scan_api.py` | ✅ 已实现 |
| API-09 | `test_cancel_scan` | `test_scan_api.py` | ✅ 已实现 |
| API-10 | *待实现* | *待定* | 📋 待实现 |

### 15.9 WebSocket（WS）

| ID | 测试方法 | 文件 | 状态 |
|----|----------|------|------|
| WS-01 | `test_connect_disconnect` | `test_ws_manager.py` | ✅ 已实现 |
| WS-02 | `test_broadcast_history` | `test_ws_manager.py` | ✅ 已实现 |
| WS-03 | `test_broadcast_history` | `test_ws_manager.py` | ✅ 已实现 |
| WS-04 | `test_broadcast_history` | `test_ws_manager.py` | ✅ 已实现 |
| WS-05 | *待实现* | *待定* | 📋 待实现 |

### 15.10 前端 Store（FE-ST）

| ID | 文件 | 状态 |
|----|------|------|
| FE-ST-01 | `scanStore.test.ts` | ✅ 已实现 |
| FE-ST-02 | `resultStore.test.ts` | ✅ 已实现 |
| FE-ST-03 | `markStore.test.ts` | ✅ 已实现 |
| FE-ST-04 | `schemeStore.test.ts` | ✅ 已实现 |

### 15.11 前端页面交互（FE-UI）

| ID | 文件 | 当前状态 | 目标状态 |
|----|------|----------|----------|
| FE-UI-01 | `Home.test.tsx` | 📋 占位测试 | ✅ 需要实现真实渲染测试 |
| FE-UI-02 | `NewScan.test.tsx` | 📋 占位测试 | ✅ 需要实现真实渲染测试 |
| FE-UI-03 | `ScanProgress.test.tsx` | 📋 占位测试 | ✅ 需要实现真实渲染测试 |
| FE-UI-04 | `FolderMarking.test.tsx` | 📋 占位测试 | ✅ 需要实现真实渲染测试 |
| FE-UI-05 | `CategoryDetail.test.tsx` | 📋 占位测试 | ✅ 需要实现真实渲染测试 |
| FE-UI-06 | `MoveProgress.test.tsx` | 📋 占位测试 | ✅ 需要实现真实渲染测试（当前移动进度测试属于 FE-UI-06 交互交互体系） |

---

> **文档版本**: 1.0  
> **最后更新**: 2026-05-28  
> **说明**: 本文档为 `maxwells_demon` 项目独立的测试用例规格说明，完整记录了 **70 个测试用例**（56 个已实现，14 个待实现）的详细场景、前置条件、操作步骤、预期结果和实现状态。文档不修改任何现有的 `TECH_SPEC.md` 或源代码文件。
