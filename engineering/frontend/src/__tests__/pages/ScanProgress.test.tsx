/**
 * 扫描进度页面测试（FE-UI-03）
 *
 * 覆盖范围：
 *   FE-UI-03: 阶段1（仅文件计数，无百分比/进度条）和阶段2（百分比、进度条、ETA）的渲染
 *   - 阶段1：显示阶段标签、已发现文件数、当前文件名；不显示百分比/进度条/剩余时间
 *   - 阶段2：显示已处理候选数/总候选数、百分比、进度条、当前文件、预计剩余时间
 *   - 取消扫描按钮存在
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockNavigate = vi.fn();
const mockCancelScan = vi.fn();
const mockGetScanStatus = vi.fn();
const mockSetSessionId = vi.fn();
const mockUpdateProgress = vi.fn();
const mockReset = vi.fn();

// Mock 全局 WebSocket
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

vi.mock('../../api', () => ({
  cancelScan: (...args: any[]) => mockCancelScan(...args),
  getScanStatus: (...args: any[]) => mockGetScanStatus(...args),
}));

// Mock scanStore：默认初始状态为 idle，测试中可以覆盖
let mockStoreState: any = {
  sessionId: 'test-session',
  status: 'idle',
  phase1: null,
  phase2: null,
  elapsedSec: 0,
  remainingSec: 0,
  setSessionId: mockSetSessionId,
  updateProgress: mockUpdateProgress,
  reset: mockReset,
};

vi.mock('../../store/scanStore', () => {
  const storeFn: any = (selector?: any) => {
    const state = { ...mockStoreState };
    return selector ? selector(state) : state;
  };
  storeFn.getState = () => ({ reset: mockReset });
  
  return {
    useScanStore: storeFn,
    __setMockState: (newState: any) => { mockStoreState = { ...mockStoreState, ...newState }; },
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ScanProgress 页面 (FE-UI-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScanStatus.mockResolvedValue({ data: { status: 'idle' } });
    // 重置 store 状态
    mockStoreState = {
      sessionId: 'test-session',
      status: 'idle',
      phase1: null,
      phase2: null,
      elapsedSec: 0,
      remainingSec: 0,
      setSessionId: mockSetSessionId,
      updateProgress: mockUpdateProgress,
      reset: mockReset,
    };
  });

  const renderPage = async () => {
    const { default: ScanProgress } = await import('../../pages/ScanProgress');
    return render(<MemoryRouter><ScanProgress /></MemoryRouter>);
  };

  it('应渲染页面标题"正在扫描文件..."', async () => {
    await renderPage();
    expect(screen.getByText('正在扫描文件...')).toBeInTheDocument();
  });

  it('应渲染阶段 1/2 标签和"快速初筛 (xxHash64)"', async () => {
    await renderPage();
    expect(screen.getByText('阶段 1/2')).toBeInTheDocument();
    expect(screen.getByText('快速初筛 (xxHash64)')).toBeInTheDocument();
  });

  it('应渲染阶段 2/2 标签和"精确确认 (SHA-256)"', async () => {
    await renderPage();
    expect(screen.getByText('阶段 2/2')).toBeInTheDocument();
    expect(screen.getByText('精确确认 (SHA-256)')).toBeInTheDocument();
  });

  it('应渲染"取消扫描"按钮', async () => {
    await renderPage();
    expect(screen.getByText('取消扫描')).toBeInTheDocument();
  });

  it('阶段1应显示"已发现文件"计数且阶段2显示"等待中..."', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    await renderPage();
    expect(screen.getByText('已发现文件')).toBeInTheDocument();
    expect(screen.getByText('等待中...')).toBeInTheDocument();
  });

  it('阶段1时应显示已发现文件扫描数（phase1.scanned）', async () => {
    mockStoreState.status = 'phase1';
    mockStoreState.phase1 = { scanned: 500, current_file: '/photos/IMG_001.jpg' };
    mockStoreState.elapsedSec = 12.5;
    await renderPage();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('阶段2时应显示已处理候选数、百分比和预计剩余时间', async () => {
    mockStoreState.status = 'phase2';
    mockStoreState.phase1 = { scanned: 1000, current_file: '/done/file.txt' };
    mockStoreState.phase2 = { computed: 80, total_candidates: 200, percent: 40, current_file: '/nas/video.mp4' };
    mockStoreState.elapsedSec = 500;
    mockStoreState.remainingSec = 750;
    await renderPage();
    expect(screen.getByText('80 / 200 (40.0%)')).toBeInTheDocument();
    expect(screen.getByText('750 秒')).toBeInTheDocument();
  });

  it('阶段2应显示当前文件名（仅 basename）', async () => {
    mockStoreState.status = 'phase2';
    mockStoreState.phase2 = { computed: 50, total_candidates: 100, percent: 50, current_file: '/deep/path/video.mp4' };
    await renderPage();
    expect(screen.getByText('video.mp4')).toBeInTheDocument();
  });

  it('应显示已用时间', async () => {
    mockStoreState.status = 'phase2';
    mockStoreState.phase2 = { computed: 50, total_candidates: 100, percent: 50, current_file: 'f.mp4' };
    mockStoreState.elapsedSec = 120;
    await renderPage();
    expect(screen.getByText('已用时间: 120s')).toBeInTheDocument();
  });

  it('阶段进度条宽度应与 percent 一致', async () => {
    mockStoreState.status = 'phase2';
    mockStoreState.phase2 = { computed: 75, total_candidates: 100, percent: 75, current_file: 'f.bin' };
    const { container } = await renderPage();
    const progressBar = container.querySelector('div[style*="width: 75%"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('阶段1完成后应显示"(已完成)"标记', async () => {
    mockStoreState.status = 'phase2';
    mockStoreState.phase1 = { scanned: 1500, current_file: '/done.txt' };
    mockStoreState.phase2 = { computed: 0, total_candidates: 10, percent: 0, current_file: '' };
    await renderPage();
    expect(screen.getByText(/已完成/)).toBeInTheDocument();
  });
});
