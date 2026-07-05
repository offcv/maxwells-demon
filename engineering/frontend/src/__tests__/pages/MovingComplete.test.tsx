/**
 * 移动完成页面测试
 *
 * 覆盖范围：
 *   - 页面渲染
 *   - 移动成功/失败数量及容量展示
 *   - 根据 location state 计算统计数据
 *   - 返回清理方案分类导航
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock Store
const mockNavigate = vi.fn();
let mockLocationState: any = { 
  actionType: 'move_to_folder',
  done: 42,
  total: 42,
  failed: 2,
  size: 1048576 * 21 // 21 MB
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: mockLocationState }),
  };
});

describe('MovingComplete 页面测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationState = { 
      actionType: 'move_to_folder',
      done: 42,
      total: 42,
      failed: 2,
      size: 1048576 * 21 // 21 MB
    };
  });

  const renderPage = async () => {
    const { default: MovingComplete } = await import('../../pages/MovingComplete');
    return render(<MemoryRouter><MovingComplete /></MemoryRouter>);
  };

  it('应渲染页面标题和提示图标', async () => {
    await renderPage();
    expect(screen.getByText('移动完成')).toBeInTheDocument();
    expect(screen.getByText('失败文件已记录，可重试')).toBeInTheDocument();
  });

  it('应根据 state 计算并展示统计数据', async () => {
    await renderPage();
    // 成功数 = done - failed = 42 - 2 = 40
    // 成功大小 = 21 MB * 40 / 42 = 20 MB
    expect(screen.getByText(/40 个文件.*20.00 MB/)).toBeInTheDocument();
    expect(screen.getByText('2 个文件')).toBeInTheDocument();
  });

  it('如果全部成功应显示正确的统计数据并隐藏失败提示', async () => {
    mockLocationState = { 
      actionType: 'move_to_trash',
      done: 10,
      total: 10,
      failed: 0,
      size: 1048576 * 10 // 10 MB
    };
    await renderPage();
    
    expect(screen.getByText(/10 个文件.*10.00 MB/)).toBeInTheDocument();
    expect(screen.getByText('0 个文件')).toBeInTheDocument();
    expect(screen.queryByText('失败文件已记录，可重试')).not.toBeInTheDocument();
  });

  it('没有 state 时应使用默认值', async () => {
    mockLocationState = null;
    await renderPage();
    
    // 使用 queryAllByText 来匹配多个 "0 个文件"
    const elements = screen.queryAllByText(/0 个文件/);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('点击返回按钮应导航到方案分类页', async () => {
    await renderPage();

    const backBtn = screen.getByText('返回清理方案分类');
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/scheme-category');
  });
});