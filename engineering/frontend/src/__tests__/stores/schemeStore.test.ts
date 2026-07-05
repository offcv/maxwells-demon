/**
 * schemeStore 测试
 *
 * 覆盖范围：
 *   - 初始状态
 *   - setCategories
 *   - setLastSaved / setFinishedAt
 */

import { describe, it, expect } from 'vitest';
import { useSchemeStore } from '../../store/schemeStore';

describe('schemeStore', () => {
  it('初始状态应为 null', () => {
    const state = useSchemeStore.getState();
    expect(state.categories).toBeNull();
    expect(state.lastSaved).toBeNull();
    expect(state.finishedAt).toBeNull();
  });

  it('setCategories 应更新分类数据', () => {
    const cats = {
      keep_one: { groups: [1], file_count: 2 },
      partial_keep: { groups: [], file_count: 0 },
      keep_all: { groups: [], file_count: 0 },
      delete_all: { groups: [], file_count: 0 },
    };
    useSchemeStore.getState().setCategories(cats);
    expect(useSchemeStore.getState().categories).toEqual(cats);
  });

  it('setLastSaved 应更新保存时间', () => {
    const time = '2026-05-27 10:30:00';
    useSchemeStore.getState().setLastSaved(time);
    expect(useSchemeStore.getState().lastSaved).toBe(time);
  });

  it('setFinishedAt 应更新完成时间', () => {
    const time = '2026-05-27 12:00:00';
    useSchemeStore.getState().setFinishedAt(time);
    expect(useSchemeStore.getState().finishedAt).toBe(time);
  });
});
