/**
 * resultStore 测试
 *
 * 覆盖范围：
 *   - 初始状态
 *   - setSummary
 */

import { describe, it, expect } from 'vitest';
import { useResultStore } from '../../store/resultStore';

describe('resultStore', () => {
  it('初始 summary 应为 null', () => {
    expect(useResultStore.getState().summary).toBeNull();
  });

  it('setSummary 应更新摘要数据', () => {
    const summary = {
      scanned_total: 1000,
      group_count: 50,
      file_count: 300,
      reclaimable_size: 1073741824,
    };
    useResultStore.getState().setSummary(summary);
    expect(useResultStore.getState().summary).toEqual(summary);
  });

  it('setSummary 应覆盖之前的摘要', () => {
    useResultStore.getState().setSummary({ old: 'data' });
    useResultStore.getState().setSummary({ new: 'data' });
    expect(useResultStore.getState().summary).toEqual({ new: 'data' });
  });
});
