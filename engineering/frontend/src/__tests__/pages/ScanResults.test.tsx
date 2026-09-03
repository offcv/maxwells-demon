/**
 * 扫描结果页面测试
 *
 * 覆盖范围：
 *   - 页面渲染及各种状态的显示
 *   - 没有 sessionId 时的重定向
 *   - 扫描结果统计数据的展示
 *   - 无重复文件和有重复文件的UI区分
 *   - 下一步按钮的状态控制
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock API
const mockGetSessionSummary = vi.fn();
const mockGetSessionGroups = vi.fn();
const mockRevealFile = vi.fn();
const mockGetConfig = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock('../../api', () => ({
  getSessionSummary: (...args: any[]) => mockGetSessionSummary(...args),
  getSessionGroups: (...args: any[]) => mockGetSessionGroups(...args),
  revealFile: (...args: any[]) => mockRevealFile(...args),
  getConfig: (...args: any[]) => mockGetConfig(...args),
}));

// Mock Store
const mockNavigate = vi.fn();
let mockSessionId: string | null = 'test-session';

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: mockSessionId };
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

describe('ScanResults 页面测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'test-session';
    // 默认本地开发环境（保留"点击路径打开所在文件夹"行为，保护既有用例）
    mockGetConfig.mockResolvedValue({ data: { docker_mode: false, nas_root: '', host_nas_path: '' } });
    Object.assign(navigator, { clipboard: { writeText: mockClipboardWriteText } });
    
    // Default mock data
    mockGetSessionSummary.mockResolvedValue({ 
      data: { 
        group_count: 5, 
        file_count: 15, 
        reclaimable_size: 1048576 * 100, // 100 MB
        scan_duration_sec: 125 
      } 
    });
    
    mockGetSessionGroups.mockResolvedValue({ 
      data: {
        data: [
          {
            group_id: 1,
            files: [
              { id: 1, path: '/test/photo1.jpg', size: 1024, created_time: 1600000000, modified_time: 1600000000 },
              { id: 2, path: '/backup/photo1.jpg', size: 1024, created_time: 1600000000, modified_time: 1600000000 }
            ]
          }
        ]
      } 
    });
  });

  const renderPage = async () => {
    const { default: ScanResults } = await import('../../pages/ScanResults');
    return render(<MemoryRouter><ScanResults /></MemoryRouter>);
  };

  it('没有 sessionId 时应重定向到首页', async () => {
    mockSessionId = null;
    await renderPage();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('应在加载期间显示加载中提示', async () => {
    // 延迟 Promise 以便看到加载状态
    mockGetSessionSummary.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const { container } = await renderPage();
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('API 失败时应导航到首页', async () => {
    mockGetSessionSummary.mockRejectedValue(new Error('Network error'));
    await renderPage();
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('应渲染页面标题和统计卡片', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('扫描结果')).toBeInTheDocument();
      expect(screen.getByText('已发现以下重复文件，请点击下一步按钮确定清理规则')).toBeInTheDocument();
      
      // 检查统计数据
      expect(screen.getByText('5 组')).toBeInTheDocument(); // group_count
      expect(screen.getByText('10 个')).toBeInTheDocument(); // file_count - group_count (15 - 5)
      expect(screen.getByText('100.00 MB')).toBeInTheDocument(); // reclaimable_size
      expect(screen.getByText('00:02:05')).toBeInTheDocument(); // duration
    });
  });

  it('应渲染文件列表', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('[1]')).toBeInTheDocument();
      expect(screen.getByText('/test/photo1.jpg')).toBeInTheDocument();
      expect(screen.getByText('/backup/photo1.jpg')).toBeInTheDocument();
    });
  });

  it('没有重复文件时应显示相应提示并禁用下一步按钮', async () => {
    mockGetSessionSummary.mockResolvedValue({ 
      data: { group_count: 0, file_count: 0, reclaimable_size: 0, scan_duration_sec: 10 } 
    });
    mockGetSessionGroups.mockResolvedValue({ data: { data: [] } });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('未发现重复文件，无需进行清理')).toBeInTheDocument();
      expect(screen.getByText('没有发现重复文件')).toBeInTheDocument();
      
      const nextBtn = screen.getByText('下一步').closest('button');
      expect(nextBtn).toBeDisabled();
    });
  });

  it('有重复文件时下一步按钮应启用并可导航到标记页', async () => {
    await renderPage();

    await waitFor(() => {
      const nextBtn = screen.getByText('下一步').closest('button');
      expect(nextBtn).not.toBeDisabled();
      
      fireEvent.click(nextBtn!);
      expect(mockNavigate).toHaveBeenCalledWith('/folder-marking');
    });
  });

  it('点击返回首页应导航到首页', async () => {
    await renderPage();

    await waitFor(() => {
      const backBtn = screen.getByText('返回首页');
      fireEvent.click(backBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('点击文件路径应调用 revealFile', async () => {
    await renderPage();

    await waitFor(() => {
      const pathEl = screen.getByText('/test/photo1.jpg');
      fireEvent.click(pathEl);
      expect(mockRevealFile).toHaveBeenCalledWith('/test/photo1.jpg');
    });
  });
});

// ======================================================================
// NAS 模式：点击路径复制翻译后的宿主机路径（v1.2.1）
// ======================================================================

describe('ScanResults NAS 模式路径复制', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'test-session';
    mockGetConfig.mockResolvedValue({
      data: { docker_mode: true, nas_root: '/mnt/nas', host_nas_path: '/volume1' },
    });
    Object.assign(navigator, { clipboard: { writeText: mockClipboardWriteText } });
    mockGetSessionSummary.mockResolvedValue({
      data: { group_count: 1, file_count: 2, reclaimable_size: 1048576, scan_duration_sec: 10 }
    });
    mockGetSessionGroups.mockResolvedValue({
      data: {
        data: [
          {
            group_id: 1,
            files: [
              { path: '/mnt/nas/photos/a.jpg', size: 524288, created_time: 1700000000, modified_time: 1700000000 },
              { path: '/mnt/nas/backup/photos/a.jpg', size: 524288, created_time: 1700000000, modified_time: 1700000000 },
            ],
          },
        ],
      },
    });
  });

  it('NAS 模式：点击文件路径应复制翻译后的宿主机路径而非调用 revealFile', async () => {
    const { default: ScanResults } = await import('../../pages/ScanResults');
    render(<MemoryRouter><ScanResults /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('/mnt/nas/photos/a.jpg')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('/mnt/nas/photos/a.jpg'));
    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith('/volume1/photos/a.jpg');
    });
    expect(mockRevealFile).not.toHaveBeenCalled();
  });
});
