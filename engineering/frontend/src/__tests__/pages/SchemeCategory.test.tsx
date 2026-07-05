/**
 * 方案分类页面测试（FE-UI-05）
 *
 * 覆盖范围：
 *   - 页面标题和副标题渲染
 *   - 4个分类卡片的顺序和文字渲染
 *   - 卡片统计信息渲染
 *   - "返回重新标记"导航
 *   - 卡片"处理此分类"导航
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockNavigate = vi.fn();
const mockSetCategories = vi.fn();
const mockGetSchemeCategories = vi.fn();

vi.mock('../../api', () => ({
  getSchemeCategories: (...args: any[]) => mockGetSchemeCategories(...args),
}));

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: 'test-session' };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../store/schemeStore', () => ({
  useSchemeStore: vi.fn((selector?: any) => {
    const state = {
      categories: {
        keep_one: { groups: [1, 2], file_count: 5, total_file_count: 10, size: 1024, total_size: 2048 },
        partial_keep: { groups: [3], file_count: 2, total_file_count: 5, size: 512, total_size: 1024 },
        keep_all: { groups: [], file_count: 0, total_file_count: 0, size: 0, total_size: 0 },
        delete_all: { groups: [4, 5, 6], file_count: 10, total_file_count: 10, size: 5000, total_size: 5000 },
      },
      finishedAt: '2023-11-16T10:00:00.000Z',
      setCategories: mockSetCategories,
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

describe('SchemeCategory 页面 (FE-UI-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSchemeCategories.mockResolvedValue({
      data: {
        keep_one: { groups: [1, 2], file_count: 5, total_file_count: 10, size: 1024, total_size: 2048 },
        partial_keep: { groups: [3], file_count: 2, total_file_count: 5, size: 512, total_size: 1024 },
        keep_all: { groups: [], file_count: 0, total_file_count: 0, size: 0, total_size: 0 },
        delete_all: { groups: [4, 5, 6], file_count: 10, total_file_count: 10, size: 5000, total_size: 5000 },
      }
    });
  });

  const renderPage = async () => {
    const { default: SchemeCategory } = await import('../../pages/SchemeCategory');
    return render(<MemoryRouter><SchemeCategory /></MemoryRouter>);
  };

  it('应渲染页面标题"清理方案分类"', async () => {
    await renderPage();
    expect(screen.getByText('清理方案分类')).toBeInTheDocument();
  });

  it('应渲染四张分类卡片标题', async () => {
    await renderPage();
    expect(screen.getByText('只保留一个')).toBeInTheDocument();
    expect(screen.getByText('部分保留')).toBeInTheDocument();
    expect(screen.getByText('全保留')).toBeInTheDocument();
    expect(screen.getByText('全删除')).toBeInTheDocument();
  });

  it('应调用 getSchemeCategories 获取数据', async () => {
    await renderPage();
    await waitFor(() => {
      expect(mockGetSchemeCategories).toHaveBeenCalledWith('test-session');
    });
  });

  it('应渲染正确的组数统计', async () => {
    await renderPage();
    expect(screen.getByText('2 组')).toBeInTheDocument();
    expect(screen.getByText('1 组')).toBeInTheDocument();
    expect(screen.getByText('0 组')).toBeInTheDocument();
    expect(screen.getByText('3 组')).toBeInTheDocument();
  });

  it('应渲染文件数统计信息', async () => {
    await renderPage();
    expect(screen.getByText('5/10 文件')).toBeInTheDocument();
    expect(screen.getByText('2/5 文件')).toBeInTheDocument();
    expect(screen.getByText('0/0 文件')).toBeInTheDocument();
    expect(screen.getByText('10/10 文件')).toBeInTheDocument();
  });

  it('点击"处理此分类"应导航到详情页', async () => {
    await renderPage();
    const btns = screen.getAllByText('处理此分类');
    fireEvent.click(btns[0]); // keep_one
    expect(mockNavigate).toHaveBeenCalledWith('/category/keep_one');
    
    fireEvent.click(btns[3]); // delete_all
    expect(mockNavigate).toHaveBeenCalledWith('/category/delete_all');
  });

  it('点击"返回重新标记"应导航到 /folder-marking', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('返回重新标记'));
    expect(mockNavigate).toHaveBeenCalledWith('/folder-marking');
  });
});
