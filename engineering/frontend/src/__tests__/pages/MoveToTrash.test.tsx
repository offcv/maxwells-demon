/**
 * 移动到废纸篓页面测试
 *
 * 覆盖范围：
 *   - 页面渲染及待删除文件统计
 *   - 废纸篓警告提示
 *   - 确认删除按钮触发 API
 *   - 返回上一页功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock API
const mockMoveToTrash = vi.fn();

vi.mock('../../api', () => ({
  moveToTrash: (...args: any[]) => mockMoveToTrash(...args),
}));

// Mock Store
const mockNavigate = vi.fn();
let mockLocationState: any = { category: 'keep_one' };
let mockSessionId: string | null = 'test-session';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: mockLocationState }),
  };
});

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: mockSessionId };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../store/schemeStore', () => ({
  useSchemeStore: vi.fn((selector?: any) => {
    const state = { 
      categories: {
        keep_one: { file_count: 42, size: 1048576 * 15.5 } // 15.5 MB
      }
    };
    return selector ? selector(state) : state;
  }),
}));

describe('MoveToTrash 页面测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'test-session';
    mockLocationState = { category: 'keep_one' };
    mockMoveToTrash.mockResolvedValue({});
    
    vi.stubGlobal('alert', vi.fn());
  });

  const renderPage = async () => {
    const { default: MoveToTrash } = await import('../../pages/MoveToTrash');
    return render(<MemoryRouter><MoveToTrash /></MemoryRouter>);
  };

  it('无效状态时应显示提示', async () => {
    mockLocationState = null;
    await renderPage();
    expect(screen.getByText('Invalid state')).toBeInTheDocument();
  });

  it('应渲染页面元素和文件统计', async () => {
    await renderPage();

    expect(screen.getByText('移动到废纸篓')).toBeInTheDocument();
    expect(screen.getByText('待删除文件: 42 个, 共 15.50 MB')).toBeInTheDocument();
    expect(screen.getByText('文件将移动到系统废纸篓')).toBeInTheDocument();
  });

  it('点击返回上一页应调用 navigate(-1)', async () => {
    await renderPage();

    const backBtn = screen.getByText('返回上一页');
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('点击确认删除应调用 API 并跳转进度页', async () => {
    await renderPage();

    const confirmBtn = screen.getByText('确认删除');
    fireEvent.click(confirmBtn);
    
    expect(mockMoveToTrash).toHaveBeenCalledWith('test-session', 'keep_one');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/move-progress');
    });
  });

  it('API调用失败时应弹窗提示', async () => {
    mockMoveToTrash.mockRejectedValue(new Error('Network error'));
    await renderPage();

    const confirmBtn = screen.getByText('确认删除');
    fireEvent.click(confirmBtn);
    
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('无法启动删除任务');
      expect(mockNavigate).not.toHaveBeenCalledWith('/move-progress');
    });
  });
});