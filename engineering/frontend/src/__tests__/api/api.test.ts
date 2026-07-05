/**
 * API 调用层测试
 *
 * 覆盖范围：
 *   - 所有 API 函数的 URL 和参数正确性
 *   - axios 实例配置
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: () => mockAxiosInstance,
  },
}));

const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

// 重新导入 API 模块（需要动态 import 因为 mock 在 hoist 之后）
async function getApi() {
  return await import('../../api/index');
}

describe('API 调用层', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('startScan 应调用 POST /scan/start', async () => {
    const api = await getApi();
    const paths = [{ path: '/test', is_exclude: false }];
    await api.startScan(paths);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/scan/start', { scan_paths: paths });
  });

  it('getScanStatus 应调用 GET /scan/status', async () => {
    const api = await getApi();
    await api.getScanStatus();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/scan/status');
  });

  it('cancelScan 应调用 POST /scan/cancel', async () => {
    const api = await getApi();
    await api.cancelScan();
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/scan/cancel');
  });

  it('getSessions 应调用 GET /sessions', async () => {
    const api = await getApi();
    await api.getSessions();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sessions');
  });

  it('getSessionSummary 应调用 GET /sessions/{id}/summary', async () => {
    const api = await getApi();
    await api.getSessionSummary('sid-123');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sessions/sid-123/summary');
  });

  it('getFolderTree 应调用 GET 并编码 parent 参数', async () => {
    const api = await getApi();
    await api.getFolderTree('sid-1', '/test/path');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/sessions/sid-1/folders/tree?parent=%2Ftest%2Fpath',
    );
  });

  it('setFolderMark 应调用 PUT /sessions/{id}/folders/mark', async () => {
    const api = await getApi();
    await api.setFolderMark('sid-1', '/photos', 'keep');
    expect(mockAxiosInstance.put).toHaveBeenCalledWith(
      '/sessions/sid-1/folders/mark',
      { path: '/photos', mark: 'keep' },
    );
  });

  it('generateScheme 应调用 POST /sessions/{id}/scheme/generate', async () => {
    const api = await getApi();
    await api.generateScheme('sid-1');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/sessions/sid-1/scheme/generate');
  });

  it('getSchemeCategories 应调用 GET /sessions/{id}/scheme/categories', async () => {
    const api = await getApi();
    await api.getSchemeCategories('sid-1');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sessions/sid-1/scheme/categories');
  });

  it('updateFileAction 应调用 PUT 并传 path 和 action', async () => {
    const api = await getApi();
    await api.updateFileAction('sid-1', '/file.txt', 'keep');
    expect(mockAxiosInstance.put).toHaveBeenCalledWith(
      '/sessions/sid-1/scheme/file-action',
      { path: '/file.txt', action: 'keep' },
    );
  });

  it('moveToFolder 应调用 POST /sessions/{id}/action/move-to-folder', async () => {
    const api = await getApi();
    await api.moveToFolder('sid-1', 'keep_one', '/dest');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/sessions/sid-1/action/move-to-folder',
      { category: 'keep_one', dest_path: '/dest' },
    );
  });

  it('deleteSession 应调用 DELETE /sessions/{id}', async () => {
    const api = await getApi();
    await api.deleteSession('sid-1');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/sessions/sid-1');
  });

  it('browseFolder 应调用 GET 并编码路径', async () => {
    const api = await getApi();
    await api.browseFolder('/my folder');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/folders/browse?path=%2Fmy%20folder',
    );
  });
});
