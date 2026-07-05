/**
 * 文件夹标记页面测试（FE-UI-04）
 *
 * 覆盖范围：
 *   FE-UI-04: 树形展开/折叠、三态标记切换
 *   - 页面标题和说明渲染
 *   - 展开子目录/收起子目录按钮
 *   - 树节点显示文件夹名、files/groups 信息
 *   - "保留"和"删除"按钮切换
 *   - 预览清理按钮导航到 /scheme-progress
 *   - 返回首页导航
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockNavigate = vi.fn();
const mockSetMarks = vi.fn();
const mockUpdateMark = vi.fn();
const mockGetFolderTree = vi.fn();
const mockGetFolderMarks = vi.fn();
const mockSetFolderMark = vi.fn();
const mockDeleteFolderMark = vi.fn();

// Mock API
vi.mock('../../api', () => ({
  getFolderTree: (...args: any[]) => mockGetFolderTree(...args),
  getFolderMarks: (...args: any[]) => mockGetFolderMarks(...args),
  setFolderMark: (...args: any[]) => mockSetFolderMark(...args),
  deleteFolderMark: (...args: any[]) => mockDeleteFolderMark(...args),
}));

// Mock stores
let mockMarksState: Record<string, string> = {};

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: 'test-session' };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../store/markStore', () => ({
  useMarkStore: vi.fn((selector?: any) => {
    const state = {
      marks: mockMarksState,
      setMarks: mockSetMarks,
      updateMark: mockUpdateMark,
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

describe('FolderMarking 页面 (FE-UI-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarksState = {};
    // 模拟树形数据
    mockGetFolderTree.mockResolvedValue({
      data: [
        {
          path: '/photos',
          name: 'photos',
          n_files: 10,
          n_groups: 3,
          has_children: true,
          children: [],
        },
        {
          path: '/documents',
          name: 'documents',
          n_files: 5,
          n_groups: 2,
          has_children: false,
          children: [],
        },
      ],
    });
    mockGetFolderMarks.mockResolvedValue({ data: {} });
  });

  const renderPage = async () => {
    const { default: FolderMarking } = await import('../../pages/FolderMarking');
    return render(<MemoryRouter><FolderMarking /></MemoryRouter>);
  };

  it('应渲染页面标题"标记文件夹已确定清理规则"', async () => {
    await renderPage();
    expect(screen.getByText('标记文件夹已确定清理规则')).toBeInTheDocument();
  });

  it('应渲染说明文字', async () => {
    await renderPage();
    expect(screen.getByText(/给文件夹标记「保留」或「删除」/)).toBeInTheDocument();
  });

  it('应渲染"返回首页"链接', async () => {
    await renderPage();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  it('点击"返回首页"应导航到 /', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('返回首页'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('应渲染"预览清理"按钮', async () => {
    await renderPage();
    expect(screen.getByText('预览清理')).toBeInTheDocument();
  });

  it('点击"预览清理"应导航到 /scheme-progress', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('预览清理'));
    expect(mockNavigate).toHaveBeenCalledWith('/scheme-progress');
  });

  it('应渲染"展开子目录"和"收起子目录"按钮', async () => {
    await renderPage();
    expect(screen.getByText('展开子目录')).toBeInTheDocument();
    expect(screen.getByText('收起子目录')).toBeInTheDocument();
  });

  it('应调用 getFolderTree 加载根级目录', async () => {
    await renderPage();
    await waitFor(() => {
      expect(mockGetFolderTree).toHaveBeenCalledWith('test-session', 'roots');
    });
  });

  it('应调用 getFolderMarks 获取已保存标记', async () => {
    await renderPage();
    await waitFor(() => {
      expect(mockGetFolderMarks).toHaveBeenCalledWith('test-session');
    });
  });

  it('应渲染文件夹树节点名称', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('photos')).toBeInTheDocument();
      expect(screen.getByText('documents')).toBeInTheDocument();
    });
  });

  it('应渲染节点统计数据 "N files, N groups"', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('10 files, 3 groups')).toBeInTheDocument();
      expect(screen.getByText('5 files, 2 groups')).toBeInTheDocument();
    });
  });

  it('应渲染每个节点的"保留"和"删除"按钮', async () => {
    await renderPage();
    await waitFor(() => {
      const keepBtns = screen.getAllByText('保留');
      const deleteBtns = screen.getAllByText('删除');
      expect(keepBtns.length).toBeGreaterThanOrEqual(2);
      expect(deleteBtns.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('没有 sessionId 时应重定向到首页', async () => {
    // 临时覆盖 sessionId 为 null
    vi.mocked((await import('../../store/scanStore')).useScanStore).mockImplementation((selector?: any) => {
      const state = { sessionId: null };
      return selector ? selector(state) : state;
    });
    const { default: FolderMarking } = await import('../../pages/FolderMarking');
    render(<MemoryRouter><FolderMarking /></MemoryRouter>);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
