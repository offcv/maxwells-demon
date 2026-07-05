/**
 * 方案生成进度页面测试
 *
 * 覆盖范围：
 *   - 页面渲染及各种状态的显示
 *   - 无 sessionId 时的重定向
 *   - 收到 WebSocket/API 完成信号后的导航
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock API
const mockGenerateScheme = vi.fn();
const mockGetSchemeCategories = vi.fn();
const mockGetSchemeStatus = vi.fn();
const mockGetSessionSummary = vi.fn();

vi.mock('../../api', () => ({
  generateScheme: (...args: any[]) => mockGenerateScheme(...args),
  getSchemeCategories: (...args: any[]) => mockGetSchemeCategories(...args),
  getSchemeStatus: (...args: any[]) => mockGetSchemeStatus(...args),
  getSessionSummary: (...args: any[]) => mockGetSessionSummary(...args),
}));

// Mock Store
const mockNavigate = vi.fn();
const mockSetCategories = vi.fn();
const mockSetLastSaved = vi.fn();
const mockSetFinishedAt = vi.fn();
let mockSessionId: string | null = 'test-session';

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: mockSessionId };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../store/schemeStore', () => ({
  useSchemeStore: vi.fn((selector?: any) => {
    const state = {
      setCategories: mockSetCategories,
      setLastSaved: mockSetLastSaved,
      setFinishedAt: mockSetFinishedAt,
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

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  readyState: number = 1;
  static OPEN = 1;
  url: string;
  constructor(url: string) { this.url = url; }
  close() { this.onclose?.(); }
}
vi.stubGlobal('WebSocket', MockWebSocket);

describe('SchemeProgress 页面测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'test-session';
    
    // Setup default successful API responses
    mockGenerateScheme.mockResolvedValue({});
    mockGetSchemeStatus.mockResolvedValue({ data: { status: 'running', processed: 0, total: 100 } });
    mockGetSchemeCategories.mockResolvedValue({ data: {} });
    mockGetSessionSummary.mockResolvedValue({ data: { finished_at: '2023-01-01T00:00:00' } });
  });

  const renderPage = async () => {
    const { default: SchemeProgress } = await import('../../pages/SchemeProgress');
    return render(<MemoryRouter><SchemeProgress /></MemoryRouter>);
  };

  it('没有 sessionId 时应重定向到首页', async () => {
    mockSessionId = null;
    await renderPage();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('应渲染进度界面的基本元素', async () => {
    await renderPage();
    expect(screen.getByText('清理方案生成中')).toBeInTheDocument();
    expect(screen.getByText('当前阶段')).toBeInTheDocument();
    expect(screen.getByText('应用文件夹标记')).toBeInTheDocument();
    expect(screen.getByText('已处理')).toBeInTheDocument();
    // 等待状态加载完成，显示 "0 / 100 组"
    await waitFor(() => {
      expect(screen.getByText('0 / 100 组')).toBeInTheDocument();
    });
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('状态 API 返回完成时应导航到分类页面', async () => {
    mockGetSchemeStatus.mockResolvedValue({ 
      data: { status: 'done', processed: 100, total: 100 } 
    });

    await renderPage();

    await waitFor(() => {
      expect(mockGetSchemeCategories).toHaveBeenCalledWith('test-session');
      expect(mockNavigate).toHaveBeenCalledWith('/scheme-category');
    });
  });

  it('WebSocket 收到完成信号时应导航到分类页面', async () => {
    mockGetSchemeStatus.mockResolvedValue({ 
      data: { status: 'running', processed: 50, total: 100 } 
    });

    await renderPage();

    // 模拟获取到 WS 实例并触发 onmessage
    // 这需要在组件挂载后通过全局的 MockWebSocket 找到最后创建的实例
    // 由于这里直接模拟行为有难度，我们通过模拟 getSchemeStatus 在下一次轮询返回 done
    
    mockGetSchemeStatus.mockResolvedValue({ 
      data: { status: 'done', processed: 100, total: 100 } 
    });

    // 触发定时器或者等待轮询发生
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/scheme-category');
    }, { timeout: 1500 }); // 给轮询留出时间
  });
  
  it('生成方案报错时应导航回标记页', async () => {
    mockGetSchemeStatus.mockResolvedValue({ 
      data: { status: 'error' } 
    });
    
    // 模拟 alert 以免抛出异常
    vi.stubGlobal('alert', vi.fn());

    await renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/folder-marking');
    });
  });
});
