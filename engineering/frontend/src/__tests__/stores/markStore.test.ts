/**
 * markStore 测试
 *
 * 覆盖范围：
 *   - 初始状态
 *   - setMarks
 *   - updateMark（添加/更新/删除）
 */

import { describe, it, expect } from 'vitest';
import { useMarkStore } from '../../store/markStore';

describe('markStore', () => {
  it('初始 marks 应为空对象', () => {
    expect(useMarkStore.getState().marks).toEqual({});
  });

  it('setMarks 应替换整个标记列表', () => {
    const marks = { '/photos': 'keep', '/backup': 'delete' };
    useMarkStore.getState().setMarks(marks);
    expect(useMarkStore.getState().marks).toEqual(marks);
  });

  it('updateMark 应添加新标记', () => {
    useMarkStore.getState().updateMark('/downloads', 'keep');
    expect(useMarkStore.getState().marks['/downloads']).toBe('keep');
  });

  it('updateMark 应更新已有标记', () => {
    useMarkStore.getState().updateMark('/photos', 'keep');
    useMarkStore.getState().updateMark('/photos', 'delete');
    expect(useMarkStore.getState().marks['/photos']).toBe('delete');
  });

  it('updateMark 传入 null 应删除标记', () => {
    useMarkStore.getState().updateMark('/temp', 'keep');
    expect(useMarkStore.getState().marks['/temp']).toBe('keep');

    useMarkStore.getState().updateMark('/temp', null);
    expect(useMarkStore.getState().marks['/temp']).toBeUndefined();
  });

  it('setMarks 后 updateMark 应合并而非覆盖', () => {
    useMarkStore.getState().setMarks({ '/a': 'keep' });
    useMarkStore.getState().updateMark('/b', 'delete');

    const marks = useMarkStore.getState().marks;
    expect(marks['/a']).toBe('keep');
    expect(marks['/b']).toBe('delete');
  });
});
