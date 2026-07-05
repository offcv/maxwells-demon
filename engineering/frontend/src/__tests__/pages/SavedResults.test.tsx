/**
 * 历史扫描结果页面测试
 *
 * 覆盖范围：
 *   - 页面渲染及加载状态
 *   - 会话列表的展示
 *   - 加载会话并导航
 *   - 删除会话（需确认）
 *   - 空状态显示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock API
const mockGetSessions = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock('../../api', () => ({
  getSessions: (...args: any[]) => mockGetSessions(...args),
  deleteSession: (...args: any[]) => mockDeleteSession(...args),
}));

// Mock Store
const mockNavigate = vi.fn();
const mockSetSessionId = vi.fn();
const mockSetFinishedAt = vi.fn();

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { setSessionId: mockSetSessionId };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../store/schemeStore', () => ({
  useSchemeStore: vi.fn((selector?: any) => {
    const state = { setFinishedAt: mockSetFinishedAt };
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

describe('SavedResults 页面测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock data
    mockGetSessions.mockResolvedValue({ 
      data: [
        {
          id: 'session-1',
          scan_paths: '[{"path":"/vol1","is_exclude":false}]',
          status: 'done',
          scanned_total: 100,
          file_count: 50,
          group_count: 10,
          total_size: 1048576 * 50,
          reclaimable_size: 1048576 * 25, // 25 MB
          created_at: '2023-01-01T10:00:00',
          finished_at: '2023-01-01T10:05:00',
          scan_duration_sec: 300
        },
        {
          id: 'session-2',
          scan_paths: '[{"path":"/vol2","is_exclude":false}]',
          status: 'done',
          scanned_total: 200,
          file_count: 0,
          group_count: 0,
          total_size: 0,
          reclaimable_size: 0,
          created_at: '2023-01-02T10:00:00',
          finished_at: '2023-01-02T10:05:00',
          scan_duration_sec: 300
        }
      ] 
    });
  });

  const renderPage = async () => {
    const { default: SavedResults } = await import('../../pages/SavedResults');
    return render(<MemoryRouter><SavedResults /></MemoryRouter>);
  };

  it('应在加载期间显示加载中提示', async () => {
    mockGetSessions.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const { container } = await renderPage();
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('应渲染页面标题和列表表头', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('已保存的扫描结果')).toBeInTheDocument();
      expect(screen.getByText('查看和管理您之前保存的扫描记录')).toBeInTheDocument();
      
      expect(screen.getByText('扫描时间')).toBeInTheDocument();
      expect(screen.getByText('最后更新')).toBeInTheDocument();
      expect(screen.getByText('相同文件')).toBeInTheDocument();
      expect(screen.getByText('可释放空间')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
    });
  });

  it('应正确渲染扫描记录列表', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('10 组')).toBeInTheDocument();
      expect(screen.getByText('25.00 MB')).toBeInTheDocument();
      expect(screen.getByText('0 组')).toBeInTheDocument();
      expect(screen.getByText('0 B')).toBeInTheDocument();
      expect(screen.getAllByText('加载')).toHaveLength(2);
      expect(screen.getAllByText('删除')).toHaveLength(2);
    });
  });

  it('没有记录时应显示空状态', async () => {
    mockGetSessions.mockResolvedValue({ data: [] });
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('暂无扫描记录')).toBeInTheDocument();
    });
  });

  it('点击返回首页应导航到 /', async () => {
    await renderPage();

    await waitFor(() => {
      const backBtn = screen.getByText('返回首页');
      fireEvent.click(backBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('点击新建扫描应导航到 /new-scan', async () => {
    await renderPage();

    await waitFor(() => {
      const newBtn = screen.getByText('新建扫描');
      fireEvent.click(newBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/new-scan');
    });
  });

  it('点击加载按钮应设置store并导航到方案分类页', async () => {
    await renderPage();

    await waitFor(() => {
      const loadBtns = screen.getAllByText('加载');
      fireEvent.click(loadBtns[0]);
      
      expect(mockSetSessionId).toHaveBeenCalledWith('session-1');
      expect(mockSetFinishedAt).toHaveBeenCalledWith('2023-01-01T10:05:00');
      expect(mockNavigate).toHaveBeenCalledWith('/scheme-category');
    });
  });

  it('确认删除时应调用API并更新列表', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockDeleteSession.mockResolvedValue({});
    
    await renderPage();

    await waitFor(() => {
      const deleteBtns = screen.getAllByText('删除');
      expect(deleteBtns).toHaveLength(2);
      
      fireEvent.click(deleteBtns[0]);
    });

    await waitFor(() => {
      expect(mockDeleteSession).toHaveBeenCalledWith('session-1');
      // 记录应该减少到1条
      const remainingLoadBtns = screen.getAllByText('加载');
      expect(remainingLoadBtns).toHaveLength(1);
    });
  });

  it('取消删除时不调用API', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    
    await renderPage();

    await waitFor(() => {
      const deleteBtns = screen.getAllByText('删除');
      fireEvent.click(deleteBtns[0]);
    });

    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});