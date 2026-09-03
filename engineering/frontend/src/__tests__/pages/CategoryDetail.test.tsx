/**
 * 分类明细页面测试（FE-UI-05 / FE-UI-06）
 *
 * 覆盖范围：
 *   FE-UI-05: 分类明细页面渲染
 *   FE-UI-06: 表格分页、手动调整、置灰红线视觉反馈
 *   - 页面标题和副标题渲染（组数、文件数、可释放空间）
 *   - "移动到文件夹"和"移动到废纸篓"按钮
 *   - 文件状态切换（✓保留 / ✗删除）
 *   - 手动调整的小圆点标记
 *   - 全 delete 组时按钮置灰（disabled）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

const mockNavigate = vi.fn();
const mockSetFinishedAt = vi.fn();
const mockGetCategoryGroups = vi.fn();
const mockUpdateFileAction = vi.fn();
const mockRevealFile = vi.fn();
const mockGetConfig = vi.fn();

// 剪贴板 mock（NAS 模式复制路径用例）
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock('../../api', () => ({
  getCategoryGroups: (...args: any[]) => mockGetCategoryGroups(...args),
  updateFileAction: (...args: any[]) => mockUpdateFileAction(...args),
  revealFile: (...args: any[]) => mockRevealFile(...args),
  getConfig: (...args: any[]) => mockGetConfig(...args),
}));

vi.mock('../../store/scanStore', () => ({
  useScanStore: vi.fn((selector?: any) => {
    const state = { sessionId: 'test-session' };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../../store/schemeStore', () => {
  let currentCategories: any = {
    keep_one: {
      groups: [{ group_id: 1 }],
      file_count: 3,
      size: 15728640, // 15 MB
    },
  };
  
  const mockUseSchemeStore = vi.fn((selector?: any) => {
    const state = {
      categories: currentCategories,
      setFinishedAt: mockSetFinishedAt,
    };
    return selector ? selector(state) : state;
  });

  (mockUseSchemeStore as any).__setCategories = (cats: any) => {
    currentCategories = cats;
  };

  return {
    useSchemeStore: mockUseSchemeStore,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// 模拟组数据辅助函数
function makeGroupData(overrides: any = {}) {
  const defaultFiles = [
    {
      path: '/photos/vacation/IMG_001.jpg',
      size: 5242880, // 5 MB
      action: 'delete',
      created_time: 1700000000,
      modified_time: 1700100000,
      mark_source_type: 'folder_mark',
      mark_source: 'inherited:/photos',
    },
    {
      path: '/backup/photos/IMG_001.jpg',
      size: 5242880,
      action: 'keep',
      created_time: 1700000000,
      modified_time: 1700100000,
      mark_source_type: 'default',
      mark_source: 'default:keep',
    },
  ];

  return {
    data: {
      data: [
        {
          group_id: 1,
          files: overrides.files || defaultFiles,
        },
      ]
    }
  };
}

describe('CategoryDetail 页面 (FE-UI-05 / FE-UI-06)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCategoryGroups.mockResolvedValue(makeGroupData());
    // 默认本地开发环境（保留"打开所在文件夹"行为，保护既有用例）
    mockGetConfig.mockResolvedValue({ data: { docker_mode: false, nas_root: '', host_nas_path: '' } });
    Object.assign(navigator, { clipboard: { writeText: mockClipboardWriteText } });
    const store = await import('../../store/schemeStore');
    (store.useSchemeStore as any).__setCategories({
      keep_one: {
        groups: [{ group_id: 1 }],
        file_count: 3,
        size: 15728640,
      },
    });
  });

  const renderPage = async (type: string = 'keep_one') => {
    const { default: CategoryDetail } = await import('../../pages/CategoryDetail');
    return render(
      <MemoryRouter initialEntries={[`/category/${type}`]}>
        <Routes>
          <Route path="/category/:type" element={<CategoryDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('应渲染分类标题"只保留一个"', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText('只保留一个')).toBeInTheDocument();
    });
  });

  it('应渲染分类标题"全删除"', async () => {
    const store = await import('../../store/schemeStore');
    (store.useSchemeStore as any).__setCategories({
      delete_all: {
        groups: [{ group_id: 1 }],
        file_count: 3,
        size: 15728640,
      },
    });

    await renderPage('delete_all');
    await waitFor(() => {
      expect(screen.getByText('全删除')).toBeInTheDocument();
    });
  });

  it('应渲染副标题显示组数、文件数和可释放空间', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText(/1 组/)).toBeInTheDocument();
      expect(screen.getByText(/3 文件待删除/)).toBeInTheDocument();
      expect(screen.getByText(/15\.00 MB/)).toBeInTheDocument();
    });
  });

  it('应渲染"移动到文件夹"和"移动到废纸篓"按钮', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText('移动到文件夹')).toBeInTheDocument();
      expect(screen.getByText('移动到废纸篓')).toBeInTheDocument();
    });
  });

  it('应渲染表格表头各列', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText('状态')).toBeInTheDocument();
      expect(screen.getByText('文件名')).toBeInTheDocument();
      expect(screen.getByText('大小')).toBeInTheDocument();
      expect(screen.getByText('创建时间')).toBeInTheDocument();
      expect(screen.getByText('修改时间')).toBeInTheDocument();
      expect(screen.getByText('路径')).toBeInTheDocument();
    });
  });

  it('应渲染文件行数据', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getAllByText('IMG_001.jpg').length).toBeGreaterThanOrEqual(1);
      // v1.2.1 起路径列显示所在文件夹（文件名列已有文件名），完整路径见悬停提示
      expect(screen.getByText('/photos/vacation')).toBeInTheDocument();
      expect(screen.getByText('/backup/photos')).toBeInTheDocument();
    });
  });

  it('应渲染组号标题"组 #1"', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText(/组 #1/)).toBeInTheDocument();
    });
  });

  it('点击文件状态切换应调用 updateFileAction', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getAllByText('IMG_001.jpg').length).toBeGreaterThan(0);
    });
    // Wait for data to load
    const rows = document.querySelectorAll('[style*="min-height: 28px"]');
    if (rows.length > 0) {
      const checkboxDiv = rows[0].querySelector('[style*="width: 20px"][style*="cursor: pointer"]');
      if (checkboxDiv) {
        fireEvent.click(checkboxDiv);
      }
    }
    await waitFor(() => {
      expect(mockUpdateFileAction).toHaveBeenCalled();
    });
  });

  it('文件 mark_source_type 为 override 时应显示小圆点', async () => {
    const overrideFiles = [
      {
        path: '/photos/manual.jpg',
        size: 1024,
        action: 'keep',
        created_time: 1700000000,
        modified_time: 1700100000,
        mark_source_type: 'override',
        mark_source: 'override',
      },
    ];
    mockGetCategoryGroups.mockResolvedValue(makeGroupData({ files: overrideFiles }));
    await renderPage('keep_one');
    await waitFor(() => {
      // 小圆点是一个 6x6 的 div，title="手动调整"
      const dot = document.querySelector('[title="手动调整"]');
      expect(dot).toBeInTheDocument();
    });
  });

  it('全 delete 组时应显示锁定提示和置灰按钮', async () => {
    const allDeleteFiles = [
      {
        path: '/photos/all_delete.jpg',
        size: 1024,
        action: 'delete',
        created_time: 1700000000,
        modified_time: 1700100000,
        mark_source_type: 'folder_mark',
        mark_source: 'inherited:/photos',
      },
    ];
    mockGetCategoryGroups.mockResolvedValue(makeGroupData({ files: allDeleteFiles }));
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText(/该组全部被删除/)).toBeInTheDocument();
    });
    // 按钮应被 disabled
    const folderBtn = screen.getByText('移动到文件夹').closest('button');
    const trashBtn = screen.getByText('移动到废纸篓').closest('button');
    expect(folderBtn).toBeDisabled();
    expect(trashBtn).toBeDisabled();
  });

  it('没有数据时应显示"加载中..."', async () => {
    // 模拟 category 数据为空
    const store = await import('../../store/schemeStore');
    (store.useSchemeStore as any).__setCategories(null);

    await renderPage('keep_one');
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('应渲染"返回上一页"链接', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText('返回上一页')).toBeInTheDocument();
    });
  });

  it('点击"返回上一页"应导航到 /scheme-category', async () => {
    await renderPage('keep_one');
    await waitFor(() => {
      fireEvent.click(screen.getByText('返回上一页'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/scheme-category');
  });

  it('如果分类下没有组（空分类），移动按钮应被禁用', async () => {
    (mockGetCategoryGroups as any).mockResolvedValueOnce({ data: [] });
    await renderPage('keep_one');
    await waitFor(() => {
      expect(screen.getByText('移动到文件夹')).toBeDisabled();
      expect(screen.getByText('移动到废纸篓')).toBeDisabled();
    });
  });
});

// ======================================================================
// 路径操作：本地"打开所在文件夹" / NAS"复制路径"（v1.2.1）
// ======================================================================

describe('CategoryDetail 路径操作（按运行环境切换）', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCategoryGroups.mockResolvedValue(makeGroupData());
    Object.assign(navigator, { clipboard: { writeText: mockClipboardWriteText } });
    const store = await import('../../store/schemeStore');
    (store.useSchemeStore as any).__setCategories({
      keep_one: { groups: [{ group_id: 1 }], file_count: 3, size: 15728640 },
    });
  });

  const renderPage = async (type: string = 'keep_one') => {
    const { default: CategoryDetail } = await import('../../pages/CategoryDetail');
    return render(
      <MemoryRouter initialEntries={[`/category/${type}`]}>
        <Routes>
          <Route path="/category/:type" element={<CategoryDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('本地模式：点击打开图标应调用 revealFile', async () => {
    mockGetConfig.mockResolvedValue({ data: { docker_mode: false, nas_root: '', host_nas_path: '' } });
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByTitle('打开所在文件夹').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByTitle('打开所在文件夹')[0]);
    await waitFor(() => {
      expect(mockRevealFile).toHaveBeenCalledWith('/photos/vacation/IMG_001.jpg');
    });
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
  });

  it('NAS 模式：点击复制图标应复制翻译后的宿主机路径', async () => {
    mockGetConfig.mockResolvedValue({
      data: { docker_mode: true, nas_root: '/mnt/nas', host_nas_path: '/volume1' },
    });
    mockGetCategoryGroups.mockResolvedValue(makeGroupData({
      files: [
        {
          path: '/mnt/nas/photos/vacation/IMG_001.jpg',
          size: 5242880,
          action: 'delete',
          created_time: 1700000000,
          modified_time: 1700100000,
          mark_source_type: 'folder_mark',
          mark_source: 'inherited:/mnt/nas/photos',
        },
      ],
    }));
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTitle('复制路径')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByTitle('复制路径')[0]);
    await waitFor(() => {
      // 容器内路径自动翻译为 File Station 可用的宿主机路径
      expect(mockClipboardWriteText).toHaveBeenCalledWith('/volume1/photos/vacation/IMG_001.jpg');
    });
    expect(mockRevealFile).not.toHaveBeenCalled();
  });

  it('路径列应显示所在文件夹（去掉文件名）且悬停提示完整路径', async () => {
    mockGetConfig.mockResolvedValue({ data: { docker_mode: false, nas_root: '', host_nas_path: '' } });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTitle('/photos/vacation/IMG_001.jpg')).toBeInTheDocument();
    });
    // 路径列内容为目录部分（文件名列已有文件名）
    expect(screen.getByText('/photos/vacation')).toBeInTheDocument();
  });
});
