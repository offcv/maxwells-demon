/**
 * 首页测试（FE-UI-01）
 *
 * 覆盖范围：
 *   FE-UI-01: 首页加载，显示欢迎卡片和两个操作按钮
 *   - 标题和副标题渲染
 *   - "新建扫描"按钮存在并可导航到 /new-scan
 *   - "历史扫描"按钮存在并可导航到 /saved-results
 *   - 如果有正在进行的扫描，自动跳转到扫描进度页
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock API 模块
vi.mock('../../api', () => ({
  getSessions: vi.fn().mockResolvedValue({ data: [] }),
  getScanStatus: vi.fn().mockResolvedValue({ data: { status: 'idle', session_id: null } }),
}));

// Mock scanStore
const mockSetSessionId = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = {
      sessionId: null,
      status: 'idle',
      setSessionId: mockSetSessionId,
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// 延迟导入被测组件（等 mock 就绪后）
import Home from '../../pages/Home';

describe('Home 页面 (FE-UI-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应渲染标题"重复文件清理工具"', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText('重复文件清理工具')).toBeInTheDocument();
  });

  it('应渲染副标题"理顺清理预期，让重复文件安全告别"', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText('理顺清理预期，让重复文件安全告别')).toBeInTheDocument();
  });

  it('应渲染项目标题 麦克斯韦妖', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText('麦克斯韦妖')).toBeInTheDocument();
  });

  it('应渲染"新建扫描"卡片及其说明文字', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText('新建扫描')).toBeInTheDocument();
    expect(screen.getByText('选择文件夹开始扫描重复文件')).toBeInTheDocument();
    expect(screen.getByText('开始扫描')).toBeInTheDocument();
  });

  it('应渲染"历史扫描"卡片及其说明文字', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText('历史扫描')).toBeInTheDocument();
    expect(screen.getByText('查看已保存的扫描结果')).toBeInTheDocument();
    expect(screen.getByText('查看历史')).toBeInTheDocument();
  });

  it('点击"开始扫描"按钮应导航到 /new-scan', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    const btn = screen.getByText('开始扫描');
    btn.click();
    expect(mockNavigate).toHaveBeenCalledWith('/new-scan');
  });

  it('点击"查看历史"按钮应导航到 /saved-results', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    const btn = screen.getByText('查看历史');
    btn.click();
    expect(mockNavigate).toHaveBeenCalledWith('/saved-results');
  });

  it('应显示版本号 v1.0', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText('v1.0')).toBeInTheDocument();
  });

  it('当扫描状态为 phase1 时自动跳转到 /scan-progress', async () => {
    const { getScanStatus } = await import('../../api');
    (getScanStatus as any).mockResolvedValue({
      data: { status: 'phase1', session_id: 'test-uuid' }
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>
    );

    // useEffect 异步执行，等待 tick
    await vi.waitFor(() => {
      expect(mockSetSessionId).toHaveBeenCalledWith('test-uuid');
      expect(mockNavigate).toHaveBeenCalledWith('/scan-progress');
    });
  });
});
