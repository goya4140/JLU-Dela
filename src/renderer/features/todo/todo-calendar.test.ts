import { describe, expect, it } from 'vitest';
import { dateKey } from '../timetable/timetable-format';
import { monthGridDays } from './todo-calendar';

describe('学习月历', () => {
  it('月历从周一开始并补齐完整周', () => {
    const days = monthGridDays(new Date(2026, 9, 1));

    expect(days).toHaveLength(35);
    expect(days[0]!.getDay()).toBe(1);
    expect(dateKey(days[0]!)).toBe('2026-09-28');
    expect(days.some((day) => dateKey(day) === '2026-10-31')).toBe(true);
  });
});
