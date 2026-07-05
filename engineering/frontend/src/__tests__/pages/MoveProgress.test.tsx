/**
 * 移动进度页面测试（FE-UI-06）
 *
 * 覆盖范围：
 *   - 页面标题"正在移动到文件夹..."或"正在移动到废纸篓..."
 *   - 批次进度显示
 *   - 进度条
 *   - 当前文件名显示
 *   - "取消移动"按钮
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockNavigate = vi.fn();
const mockCancelAction = vi.fn();

// Mock WebSocket
const mockWsInstances: MockWebSocket[] = [];
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  readyState: number = 1;
  static OPEN = 1;
  url: string;
  constructor(url: string) { 
    this.url = url; 
    mockWsInstances.push(this);
  }
  close() { this.onclose?.(); }
}
vi.stubGlobal('WebSocket', MockWebSocket);

vi.mock('../../api', () => ({
  cancelAction: (...args: any[]) => mockCancelAction(...args),
  getActionStatus: vi.fn().mockResolvedValue({ data: { status: 'idle' } }),
}));

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: 'test-session' };
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

describe('MoveProgress 页面 (FE-UI-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  const renderPage = async () => {
    const { default: MoveProgress } = await import('../../pages/MoveProgress');
    return render(<MemoryRouter><MoveProgress /></MemoryRouter>);
  };

  it('应渲染页面标题"正在移动到文件夹..."', async () => {
    await renderPage();
    // 默认 actionType 是 'move_to_folder'
    expect(screen.getByText('正在移动到文件夹...')).toBeInTheDocument();
  });

  it('应渲染副标题"执行中，请等待"', async () => {
    await renderPage();
    expect(screen.getByText('执行中，请等待')).toBeInTheDocument();
  });

  it('应渲染进度显示区域（默认无批次时为简单进度条）', async () => {
    await renderPage();
    expect(screen.getByText('进度')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('应渲染"取消移动"按钮', async () => {
    await renderPage();
    expect(screen.getByText('取消移动')).toBeInTheDocument();
  });

  it('点击取消应调用 cancelAction', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('取消移动'));
    expect(mockCancelAction).toHaveBeenCalledWith('test-session');
  });

  it('应显示项目标题 麦克斯韦妖', async () => {
    await renderPage();
    expect(screen.getByText('麦克斯韦妖')).toBeInTheDocument();
  });

  it('通过 WS 消息更新时应显示批次数据和进度', async () => {
    await renderPage();
    // 模拟 WS 消息
    const wsInstance = mockWsInstances[mockWsInstances.length - 1];
    if (wsInstance && wsInstance.onmessage) {
      // simulate wrapped event object
      wsInstance.onmessage({
        data: JSON.stringify({
          action: 'move_to_folder',
          batches: [
            { id: 1, total: 100, done: 45, current_file: 'photo_045.jpg', status: 'running' },
            { id: 2, total: 100, done: 0, status: 'pending' },
          ],
          done: 45,
          total: 200,
        }),
      });
    }
    // 应该渲染批次信息
    await waitFor(() => {
      expect(screen.getByText('批次 1')).toBeInTheDocument();
      expect(screen.getByText('批次 2')).toBeInTheDocument();
    });
  });

  it('应在完成时导航到 /moving-complete', async () => {
    await renderPage();
    const wsInstance = mockWsInstances[mockWsInstances.length - 1];
    if (wsInstance && wsInstance.onmessage) {
      wsInstance.onmessage({
        data: JSON.stringify({
          action: 'move_to_folder',
          batches: [{ id: 1, total: 100, done: 100, status: 'done' }],
          done: 100,
          total: 100,
          failed: 0,
          total_size: 52428800,
        }),
      });
    }
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/moving-complete', expect.objectContaining({
        state: expect.objectContaining({
          actionType: 'move_to_folder',
          done: 100,
          total: 100,
        }),
      }));
    });
  });
});
