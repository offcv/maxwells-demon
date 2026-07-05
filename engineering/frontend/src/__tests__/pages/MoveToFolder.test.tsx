/**
 * 移动到文件夹页面测试
 *
 * 覆盖范围：
 *   - 页面渲染及待移动文件统计
 *   - 目标路径输入和修改
 *   - 确认移动按钮的启用/禁用和触发 API
 *   - 返回上一页功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock API - use vi.hoisted to share mock functions
const { mockMoveToFolder } = vi.hoisted(() => ({
  mockMoveToFolder: vi.fn(),
}));

vi.mock('../../api', () => ({
  moveToFolder: mockMoveToFolder,
  browseFolder: vi.fn().mockResolvedValue({ data: [] }),
  getDefaultRoot: vi.fn().mockResolvedValue({ data: { root: '/' } }),
}));

// Mock FolderPickerModal component
vi.mock('../../components/FolderPickerModal', () => {
  return {
    __esModule: true,
    default: ({ isOpen, onClose, onSelect, title }: any) => (
      isOpen ? (
        <div data-testid="mock-folder-picker">
          <h2>{title}</h2>
          <button onClick={() => onSelect('/mock/new/path')}>Select Mock Path</button>
          <button onClick={onClose}>Close Modal</button>
        </div>
      ) : null
    )
  };
});

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

describe('MoveToFolder 页面测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'test-session';
    mockLocationState = { category: 'keep_one' };
    mockMoveToFolder.mockResolvedValue({});
    vi.stubGlobal('alert', vi.fn());
  });

  const renderPage = async () => {
    const { default: MoveToFolder } = await import('../../pages/MoveToFolder');
    return render(<MemoryRouter><MoveToFolder /></MemoryRouter>);
  };

  it('无效状态时应显示提示', async () => {
    mockLocationState = null;
    await renderPage();
    expect(screen.getByText('Invalid state')).toBeInTheDocument();
  });

  it('应渲染页面元素和文件统计', async () => {
    await renderPage();

    expect(screen.getByText('移动到文件夹')).toBeInTheDocument();
    expect(screen.getByText('待移动文件: 42 个, 共 15.50 MB')).toBeInTheDocument();
    expect(screen.getByText('目标文件夹路径')).toBeInTheDocument();
    expect(screen.getByText('/mnt/nas/backup')).toBeInTheDocument(); // 默认路径
  });

  it('点击选择文件夹应弹窗并更新路径', async () => {
    await renderPage();

    const browseBtn = screen.getByText('选择文件夹');
    fireEvent.click(browseBtn);
    
    // Expect modal to be open
    expect(screen.getByTestId('mock-folder-picker')).toBeInTheDocument();
    
    // Select a path
    const selectBtn = screen.getByText('Select Mock Path');
    fireEvent.click(selectBtn);
    
    // Check if the path was updated
    expect(screen.getByText('/mock/new/path')).toBeInTheDocument();
  });

  it('点击返回上一页应调用 navigate(-1)', async () => {
    await renderPage();

    const backBtn = screen.getByText('返回上一页');
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('点击确认移动应调用 API 并跳转进度页', async () => {
    await renderPage();

    const confirmBtn = screen.getByText('确认移动');
    fireEvent.click(confirmBtn);
    
    expect(mockMoveToFolder).toHaveBeenCalledWith('test-session', 'keep_one', '/mnt/nas/backup');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/move-progress');
    });
  });

  it('API调用失败时应弹窗提示', async () => {
    mockMoveToFolder.mockRejectedValue(new Error('Network error'));
    await renderPage();

    const confirmBtn = screen.getByText('确认移动');
    fireEvent.click(confirmBtn);
    
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('无法启动移动任务');
      expect(mockNavigate).not.toHaveBeenCalledWith('/move-progress');
    });
  });
});