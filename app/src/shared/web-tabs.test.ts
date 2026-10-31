import { expect, it } from 'vitest';
import { workTabId, workTargetOf, webTabBoundsSchema } from './web-tabs';
import { chaoxingWorkCompleted, chaoxingDeadline, chaoxingWorkTime } from './chaoxing-calendar';

it('stores only opaque course and assignment identities in a workbench tab', () => {
  const target = { courseId: '123:456', workId: 'w1' };
  expect(workTargetOf(workTabId(target))).toEqual(target);
  for (const id of [
    'web:https://mooc1.chaoxing.com/?enc=secret',
    'web:chaoxing/a/b?enc=secret',
    'web:chaoxing/a/../b',
  ])
    expect(workTargetOf(id)).toBeNull();
  expect(webTabBoundsSchema.safeParse({ x: 0, y: 0, width: -1, height: 500 }).success).toBe(false);
});
it('counts down Shanghai deadlines, preserves date-only uncertainty and labels relative text as a snapshot', () => {
  const work = { id: '1', title: '报告', status: '未交', timing: '截止时间：2026-10-31 20:30' };
  const now = new Date('2026-10-31T12:00:00Z').getTime();
  expect(chaoxingWorkTime(work, now)).toContain('剩余30分钟');
  expect(chaoxingWorkTime(work, now + 30 * 60_000)).toContain('已过截止时间');
  expect(chaoxingWorkTime({ ...work, status: '已提交' }, now)).not.toContain('剩余');
  expect(chaoxingWorkTime({ ...work, timing: '截止日期：2026-10-31' }, now)).toBe(
    '截止 2026-10-31（具体时刻待确认）',
  );
  expect(chaoxingWorkTime({ ...work, timing: '剩余2天' }, now)).toBe('上次同步显示：剩余2天');
  expect(chaoxingWorkTime({ ...work, timing: '' }, now)).toContain('尚未读到');
  expect(
    chaoxingWorkTime(
      { ...work, timing: '剩余2天', detailTiming: '截止时间：2026-10-31 21:00' },
      now,
    ),
  ).toContain('剩余1小时');
});

it('recognizes English school status and preserves English relative timing as a snapshot', () => {
  expect(chaoxingWorkCompleted('Completed')).toBe(true);
  expect(chaoxingWorkCompleted('To be Submitted 13hour10minutes left')).toBe(false);
  expect(
    chaoxingWorkTime(
      { id: 'w', title: '报告', status: 'To be Submitted 13hour10minutes left', timing: '' },
      Date.now(),
    ),
  ).toContain('上次同步显示：To be Submitted');
  expect(chaoxingDeadline('End Time: 2026-11-02 20:00')).toEqual({
    date: '2026-11-02',
    time: '20:00',
  });
});
