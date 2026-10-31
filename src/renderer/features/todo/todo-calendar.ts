import { addDays, dayMilliseconds, mondayOf } from '../timetable/timetable-format';

/** 月历固定从周一开始，补足到完整周；相邻月份的日期也保留在网格里。 */
export function monthGridDays(month: Date): Date[] {
  const first = mondayOf(new Date(month.getFullYear(), month.getMonth(), 1));
  const nextMonth = mondayOf(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const count = Math.round((addDays(nextMonth, 7).getTime() - first.getTime()) / dayMilliseconds);
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

export function monthLabel(month: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(month);
}
