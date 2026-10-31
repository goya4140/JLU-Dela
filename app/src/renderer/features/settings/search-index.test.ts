// 设置搜索索引：全局搜索 setting 目标与关键词路由（设置页内搜索已随全局搜索统一移除）。
import { describe, expect, it } from 'vitest';
import { settingsResultsFor } from './search-index';

describe('settingsResultsFor (global search)', () => {
  it('does not advertise retired Canvas settings', () => {
    expect(settingsResultsFor('Canvas')).toEqual([]);
  });

  it('targets the current section set and matches keywords', () => {
    const results = settingsResultsFor('吉大');
    expect(results.find((row) => row.id === 'connections')).toMatchObject({
      kind: 'setting',
      id: 'connections',
      target: { page: 'settings', section: 'connections' },
    });
    expect(settingsResultsFor('首次配置').some((row) => row.id === 'guide')).toBe(true);
  });
});
