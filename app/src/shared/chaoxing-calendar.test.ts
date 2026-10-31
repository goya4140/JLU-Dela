import { describe, it, expect } from 'vitest';
import { chaoxingDeadline, chaoxingWorkCompleted } from './chaoxing-calendar';

describe('learning deadlines', () => {
  it('uses an explicitly labelled end date rather than the publication date', () => {
    expect(chaoxingDeadline('开始时间：2026-10-01 08:00 截止时间：2026-11-02 23:59')).toEqual({
      date: '2026-11-02',
      time: '23:59',
    });
    expect(chaoxingDeadline('截止时间：2026年11月2日23:59:12')).toEqual({
      date: '2026-11-02',
      time: '23:59:12',
    });
    expect(chaoxingDeadline('截止日期：2026年11月2日')).toEqual({ date: '2026-11-02', time: null });
  });
  it('does not invent deadlines from relative, unlabeled, or invalid dates', () => {
    for (const value of [
      '剩余2天',
      '2026-11-02 23:59',
      '发布时间：2026-11-02',
      '截止时间：2026-02-30 12:00',
      '截止：2026-11-02 24:00',
      '截止：2026-11-123',
      '截止：2026-11-02 23:5',
      '截止：2026-11-02 23:59:99',
    ])
      expect(chaoxingDeadline(value)).toBeNull();
  });
  it('requires an explicit completion status', () => {
    expect(chaoxingWorkCompleted('已提交')).toBe(true);
    for (const value of ['未提交', '未完成', '已截止', '', '未知'])
      expect(chaoxingWorkCompleted(value)).toBe(false);
  });
});
