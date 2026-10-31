import type { ChaoxingWork } from './chaoxing';

export interface ChaoxingCalendarWork extends ChaoxingWork {
  courseId: string;
  courseName: string;
  syncedAt: string;
  deadline: { date: string; time: string | null } | null;
}
export interface ChaoxingCalendar {
  courses: { id: string; name: string; syncedAt: string | null }[];
  works: ChaoxingCalendarWork[];
  coursesSyncedAt: string | null;
}
export interface ChaoxingCalendarSync {
  data: ChaoxingCalendar;
  failures: { courseId: string | null; error: string; reason?: 'auth' }[];
}

export function chaoxingDeadline(timing: string): ChaoxingCalendarWork['deadline'] {
  const match = timing.match(
    /(?:截止时间|截止日期|截止|deadline|due(?:\s+date)?|end\s*(?:time|date))\s*[:：]?\s*(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const remainder = timing.slice(match.index! + match[0].length);
  if (/^[\d:]/.test(remainder) || (hour === undefined && /^\s*[T\d]/.test(remainder))) return null;
  const date = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  const value = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) return null;
  if (
    hour !== undefined &&
    (Number(hour) > 23 || Number(minute) > 59 || (second !== undefined && Number(second) > 59))
  )
    return null;
  return {
    date,
    time:
      hour === undefined
        ? null
        : `${hour.padStart(2, '0')}:${minute}${second === undefined ? '' : `:${second}`}`,
  };
}

export function chaoxingWorkCompleted(status: string): boolean {
  return /^(已完成|已提交|已批阅|已批改|已评分|已交|completed|submitted|graded|marked)(?:\s|$)/i.test(
    status.trim(),
  );
}

export function chaoxingWorkTime(work: ChaoxingWork, now: number): string {
  const deadline = chaoxingDeadline(work.detailTiming ?? '') ?? chaoxingDeadline(work.timing);
  const snapshot = work.timing || (/left|remaining|剩余/i.test(work.status) ? work.status : '');
  if (!deadline)
    return snapshot ? `上次同步显示：${snapshot}` : '尚未读到截止时间，请打开原网页查看';
  const label = `截止 ${deadline.date}${deadline.time ? ` ${deadline.time}` : '（具体时刻待确认）'}`;
  if (!deadline.time || chaoxingWorkCompleted(work.status)) return label;
  const remaining =
    new Date(
      `${deadline.date}T${deadline.time.length === 5 ? deadline.time + ':00' : deadline.time}+08:00`,
    ).getTime() - now;
  if (remaining <= 0) return `${label} · 已过截止时间`;
  const minutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `${label} · 剩余${days ? `${days}天` : ''}${hours ? `${hours}小时` : ''}${!days && (minutes % 60 || !hours) ? `${minutes % 60}分钟` : ''}`;
}
