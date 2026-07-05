# DupFinder 测试用例说明

## 项目结构

```
tests/
├── README.md                         # 本文件
├── backend/                          # 后端测试（pytest）
│   ├── conftest.py                   # 共享 fixtures
│   ├── services/
│   │   ├── test_scan_engine.py       # 扫描引擎测试
│   │   ├── test_scheme_engine.py     # 方案引擎/标记引擎/分类/排序测试
│   │   ├── test_action_engine.py     # 操作执行引擎测试
│   │   └── test_folder_tree.py       # 文件夹树测试
│   ├── routers/
│   │   ├── test_scan_api.py          # 扫描 API 测试
│   │   ├── test_results_api.py       # 结果 API 测试
│   │   ├── test_folders_api.py       # 文件夹 API 测试
│   │   ├── test_scheme_api.py        # 方案 API 测试
│   │   └── test_action_api.py        # 操作 API 测试
│   └── ws/
│       └── test_ws_manager.py        # WebSocket 管理测试
├── frontend/                         # 前端测试（vitest）
│   ├── stores/
│   │   ├── scanStore.test.ts         # 扫描状态 store
│   │   ├── resultStore.test.ts       # 结果 store
│   │   ├── markStore.test.ts         # 标记 store
│   │   └── schemeStore.test.ts       # 方案 store
│   ├── api/
│   │   └── api.test.ts              # API 调用层
│   └── pages/
│       ├── Home.test.tsx             # 首页
│       ├── NewScan.test.tsx          # 新建扫描
│       ├── ScanProgress.test.tsx     # 扫描进度
│       ├── FolderMarking.test.tsx    # 文件夹标记
│       ├── CategoryDetail.test.tsx   # 分类明细
│       └── MoveProgress.test.tsx     # 移动进度
```

---

## 运行测试

### 后端测试

需要安装的依赖：`pytest`, `httpx`, `pytest-asyncio`, `requests`

```bash
# 激活虚拟环境
cd dupfinder/backend
source venv/bin/activate

# 安装测试依赖（如尚未安装）
pip install pytest httpx pytest-asyncio

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

### 前端测试

需要安装的依赖：`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`

```bash
cd dupfinder/frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom

# 运行全部前端测试
npx vitest run

# 监听模式（开发时使用）
npx vitest

# 运行特定文件
npx vitest run src/__tests__/stores/scanStore.test.ts
```

---

## 测试覆盖范围

### 后端 — 服务层

| 文件 | 测试内容 | 对应 TECH_SPEC |
|------|----------|----------------|
| `test_scan_engine.py` | 哈希计算（xxHash / SHA-256）、目录遍历、排除/跳过逻辑、取消扫描、异常处理 | SE-01 ~ SE-10 |
| `test_scheme_engine.py` | 标记继承、兜底规则、四类分类、置灰规则、手动调整、排序、缓存机制、异步生成 | MK-01~05, SC-01~04, GR-01~06, AD-01~04, SR-01~05 |
| `test_action_engine.py` | 移动到文件夹、移动到废纸篓、重命名策略、分批处理、取消、Docker/本地模式 | —（新增） |
| `test_folder_tree.py` | 树形结构、统计信息、字母序排序、空目录、根路径 | —（新增） |

### 后端 — 路由层

| 文件 | 测试内容 | 对应 TECH_SPEC |
|------|----------|----------------|
| `test_scan_api.py` | 启动/取消扫描、并发拒绝、状态查询 | API-01, API-08, API-09 |
| `test_results_api.py` | 会话列表/详情/摘要/删除、分页、404、不可读文件 | API-02, API-06 |
| `test_folders_api.py` | 标记设置/更新/清除/获取、目录浏览、隐藏文件过滤 | API-03 |
| `test_scheme_api.py` | 方案生成/状态/分类获取、文件覆盖、缓存 | API-04, API-05 |
| `test_action_api.py` | 移动到文件夹/废纸篓、参数校验、取消操作 | —（新增） |

### 后端 — WebSocket

| 文件 | 测试内容 |
|------|----------|
| `test_ws_manager.py` | 连接管理、广播功能、FakeConnectionManager 广播历史 |

### 前端 — Store

| 文件 | 测试内容 |
|------|----------|
| `scanStore.test.ts` | 初始状态、setScanPaths/setSessionId/setStatus、updateProgress(phase1/phase2)、reset |
| `resultStore.test.ts` | 初始状态、setSummary |
| `markStore.test.ts` | 初始状态、setMarks、updateMark(添加/更新/删除) |
| `schemeStore.test.ts` | 初始状态、setCategories、setLastSaved、setFinishedAt |

### 前端 — API 调用层

| 文件 | 测试内容 |
|------|----------|
| `api.test.ts` | 所有 API 函数的 URL、HTTP 方法、参数编码正确性 |

### 前端 — 页面（占位）

| 文件 | 对应的 FE 测试 ID |
|------|-------------------|
| `Home.test.tsx` | FE-01 |
| `NewScan.test.tsx` | FE-02 |
| `ScanProgress.test.tsx` | FE-03, FE-04 |
| `FolderMarking.test.tsx` | FE-05 |
| `CategoryDetail.test.tsx` | FE-06, FE-07, FE-08 |
| `MoveProgress.test.tsx` | FE-10 |

> **注意**：前端页面测试目前为占位测试（仅验证测试框架可用）。
> 要启用完整的页面测试，需要：
> 1. 安装 `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
> 2. 实现 `vitest.config.ts`（已创建）
> 3. 取消各测试文件中注释掉的渲染代码

---

## 测试用例与 TECH_SPEC 对照表

### 扫描引擎 (SE)

| ID | 测试方法 | 状态 |
|----|----------|------|
| SE-01 | `test_se01_identical_files` | ✅ 已实现 |
| SE-02 | `test_se02_header_same_content_diff` | ✅ 已实现 |
| SE-03 | `test_se03_diff_size` | ✅ 已实现 |
| SE-04 | `test_se04_large_file_head_hash` | ✅ 已实现 |
| SE-05 | `test_se05_scan_cancel` | ✅ 已实现 |
| SE-06 | `test_se06_exclude_directory` | ✅ 已实现 |
| SE-07 | `test_se07_empty_files` | ✅ 已实现 |
| SE-08 | `test_se08_symlink` | ✅ 已实现 |
| SE-09 | `test_se09_no_perm_file` | ✅ 已实现 |
| SE-10 | `test_se10_small_file_full_read` | ✅ 已实现 |

### 标记引擎 (MK)

| ID | 测试方法 | 状态 |
|----|----------|------|
| MK-01 | `test_mk01_inherit_basic` | ✅ 已实现 |
| MK-02 | `test_mk02_child_overrides_parent` | ✅ 已实现 |
| MK-03 | `test_mk03_default_keep` | ✅ 已实现 |
| MK-04 | `test_mk04_multi_level_inherit` | ✅ 已实现 |
| MK-05 | `test_mk05_clear_mark_falls_back` | ✅ 已实现 |

### 方案分类 (SC)

| ID | 测试方法 | 状态 |
|----|----------|------|
| SC-01 | `test_sc01_keep_one` | ✅ 已实现 |
| SC-02 | `test_sc02_partial_keep` | ✅ 已实现 |
| SC-03 | `test_sc03_keep_all` | ✅ 已实现 |
| SC-04 | `test_sc04_delete_all` | ✅ 已实现 |

### 置灰规则 (GR)

| ID | 测试方法 | 状态 |
|----|----------|------|
| GR-01 | `test_gr01_no_all_delete` | ✅ 已实现 |
| GR-02 | `test_gr02_has_all_delete` | ✅ 已实现 |
| GR-03 | （见 GR-05：手动调整后仍置灰） | ✅ 已覆盖 |
| GR-04 | `test_gr04_all_groups_resolved` | ✅ 已实现 |
| GR-05 | `test_gr05_manual_change_causes_all_delete` | ✅ 已实现 |
| GR-06 | `test_gr06_resolve_manual_all_delete` | ✅ 已实现 |

### 手动调整 (AD)

| ID | 测试方法 | 状态 |
|----|----------|------|
| AD-01 | `test_ad01_no_reclassification` | ✅ 已实现 |
| AD-02 | `test_ad02_override_visual_marker` | ✅ 已实现 |
| AD-03 | （已覆盖于排序测试 SR-03） | ✅ 已覆盖 |
| AD-04 | （已覆盖于置灰测试 GR-05） | ✅ 已覆盖 |

### 排序 (SR)

| ID | 测试方法 | 状态 |
|----|----------|------|
| SR-01 | `test_sr01_override_groups_on_top` | ✅ 已实现 |
| SR-02 | （已覆盖于 SR-01 排序 key 中的 reclaimable） | ✅ 已覆盖 |
| SR-03 | `test_sr03_file_sort_override_on_top` | ✅ 已实现 |
| SR-04 | `test_sr04_keep_before_delete` | ✅ 已实现 |
| SR-05 | `test_sr05_folder_tree_alpha_order` | ✅ 已实现 |

### API 集成 (API)

| ID | 测试方法 | 状态 |
|----|----------|------|
| API-01 | `test_start_scan` | ✅ 已实现 |
| API-02 | `test_list_sessions` / `test_get_session_detail` | ✅ 已实现 |
| API-03 | `test_set_mark` / `test_get_marks` | ✅ 已实现 |
| API-04 | `test_generate_scheme` / `test_get_categories` | ✅ 已实现 |
| API-05 | `test_file_action_override` | ✅ 已实现 |
| API-06 | `test_get_files_pagination` | ✅ 已实现 |
| API-07 | （WS 进度测试需集成测试框架） | 📋 待实现 |
| API-08 | `test_concurrent_scan_rejected` | ✅ 已实现 |
| API-09 | `test_cancel_scan` | ✅ 已实现 |

### 前端交互 (FE)

| ID | 文件 | 状态 |
|----|------|------|
| FE-01 | `Home.test.tsx` | 📋 占位 |
| FE-02 | `NewScan.test.tsx` | 📋 占位 |
| FE-03 | `ScanProgress.test.tsx` | 📋 占位 |
| FE-04 | `ScanProgress.test.tsx` | 📋 占位 |
| FE-05 | `FolderMarking.test.tsx` | 📋 占位 |
| FE-06 | `CategoryDetail.test.tsx` | 📋 占位 |
| FE-07 | `CategoryDetail.test.tsx` | 📋 占位 |
| FE-08 | `CategoryDetail.test.tsx` | 📋 占位 |
| FE-10 | `MoveProgress.test.tsx` | 📋 占位 |

---

## 配置说明

### 测试数据库

后端测试使用 SQLite 内存数据库 (`:memory:`)，每个测试会话自动创建和销毁表结构。
通过 `app.dependency_overrides[get_db]` 注入测试用数据库会话。

### WebSocket Mock

测试使用 `FakeConnectionManager` 代替真实的 WebSocket 管理器，
所有广播操作被记录到 `broadcast_history` 列表，不会建立真实的 WS 连接。

### 全局状态隔离

每个测试通过 `reset_global_state` fixture 自动重置以下全局单例：
- `current_scan`（扫描状态）
- `current_scheme` / `scheme_cache`（方案状态）
- `current_action`（操作状态）
