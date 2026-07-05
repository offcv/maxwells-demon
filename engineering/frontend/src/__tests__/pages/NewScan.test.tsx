/**
 * 新建扫描页面测试（FE-UI-02）
 *
 * 覆盖范围：
 *   FE-UI-02: 路径添加、路径列表渲染、开始扫描按钮联动
 *   - 页面标题和副标题渲染
 *   - "添加文件夹"按钮存在
 *   - 扫描路径列表渲染
 *   - 排除文件夹区域折叠展开
 *   - 路径为空时开始扫描按钮禁用
 *   - 路径非空时开始扫描按钮启用
 *   - 点击"返回首页"导航到 /
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

const mockNavigate = vi.fn();
const mockSetScanPaths = vi.fn();
const mockSetSessionId = vi.fn();

vi.mock('../../api', () => ({
  startScan: vi.fn().mockResolvedValue({ data: { session_id: 'mock-uuid' } }),
}));

vi.mock('../../store/scanStore', () => {
  const storeFn: any = (selector?: any) => {
    const state = {
      setScanPaths: mockSetScanPaths,
      setSessionId: mockSetSessionId,
    };
    return selector ? selector(state) : state;
  };
  storeFn.getState = () => ({ setSessionId: mockSetSessionId });
  
  return {
    useScanStore: storeFn,
  };
});

vi.mock('../../components/FolderPickerModal', () => ({
  default: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (path: string) => void }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="folder-picker-modal">
        <button onClick={() => onSelect('/mock/selected/path')}>选择路径</button>
      </div>
    );
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import NewScan from '../../pages/NewScan';

describe('NewScan 页面 (FE-UI-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应渲染页面标题"新建扫描"', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    expect(screen.getByText('新建扫描')).toBeInTheDocument();
  });

  it('应渲染副标题"选择要扫描的文件夹"', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    expect(screen.getByText('选择要扫描的文件夹')).toBeInTheDocument();
  });

  it('应渲染"返回首页"链接', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  it('点击"返回首页"应导航到 /', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    fireEvent.click(screen.getByText('返回首页'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('应渲染"扫描文件夹"区域和"添加文件夹"按钮', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    expect(screen.getByText('扫描文件夹')).toBeInTheDocument();
    expect(screen.getAllByText('添加文件夹')[0]).toBeInTheDocument();
  });

  it('路径为空时"开始扫描"按钮应禁用', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    const btn = screen.getByText('开始扫描').closest('button');
    expect(btn).toBeDisabled();
  });

  it('点击"添加文件夹"应打开选择弹窗', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    const addBtns = screen.getAllByText('添加文件夹');
    fireEvent.click(addBtns[0]); // 扫描文件夹的添加按钮
    expect(screen.getByTestId('folder-picker-modal')).toBeInTheDocument();
  });

  it('应在路径列表中显示已选择的路径', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    // 打开弹窗并选择路径
    fireEvent.click(screen.getAllByText('添加文件夹')[0]);
    fireEvent.click(screen.getByText('选择路径'));
    expect(screen.getByText('/mock/selected/path')).toBeInTheDocument();
  });

  it('选择路径后"开始扫描"按钮应解除禁用', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    // 打开弹窗并选择路径
    fireEvent.click(screen.getAllByText('添加文件夹')[0]);
    fireEvent.click(screen.getByText('选择路径'));
    const btn = screen.getByText('开始扫描').closest('button');
    expect(btn).not.toBeDisabled();
  });

  it('应能删除已添加的路径', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    // 添加路径
    fireEvent.click(screen.getAllByText('添加文件夹')[0]);
    fireEvent.click(screen.getByText('选择路径'));
    expect(screen.getByText('/mock/selected/path')).toBeInTheDocument();
    // 点击删除按钮
    const deleteBtn = document.querySelector('[style*="background: transparent"][style*="padding: 4px"]');
    if (deleteBtn) fireEvent.click(deleteBtn);
    expect(screen.queryByText('/mock/selected/path')).not.toBeInTheDocument();
  });

  it('应渲染"排除文件夹"折叠区域', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    expect(screen.getByText('排除文件夹')).toBeInTheDocument();
  });

  it('点击排除文件夹区域应展开子内容', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    fireEvent.click(screen.getByText('排除文件夹'));
    expect(screen.getAllByText('添加文件夹')[1]).toBeInTheDocument();
  });

  it('能在排除区域添加排除路径', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    // 展开排除区域
    fireEvent.click(screen.getByText('排除文件夹'));
    // 点击排除的添加按钮
    const addBtns = screen.getAllByText('添加文件夹');
    fireEvent.click(addBtns[1]);
    fireEvent.click(screen.getByText('选择路径'));
    expect(screen.getByText('/mock/selected/path')).toBeInTheDocument();
  });

  it('应显示"已排除 N 个路径"标签', () => {
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    fireEvent.click(screen.getByText('排除文件夹'));
    const addBtns = screen.getAllByText('添加文件夹');
    fireEvent.click(addBtns[1]);
    fireEvent.click(screen.getByText('选择路径'));
    expect(screen.getByText('已排除 1 个路径')).toBeInTheDocument();
  });

  it('开始扫描应调用 startScan API 并导航到 /scan-progress', async () => {
    const { startScan } = await import('../../api');
    render(<BrowserRouter><NewScan /></BrowserRouter>);
    // 添加路径
    fireEvent.click(screen.getAllByText('添加文件夹')[0]);
    fireEvent.click(screen.getByText('选择路径'));
    // 点击开始扫描
    const btn = screen.getByText('开始扫描').closest('button')!;
    fireEvent.click(btn);
    expect(startScan).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/scan-progress');
    });
  });
});
