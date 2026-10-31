import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { TimetableState, TimetableLesson, TimetableResult } from '../../shared/timetable';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { WeekCalendar, type CalendarItemDetail } from '../features/timetable/WeekCalendar';
import { MonthCalendar } from '../features/timetable/MonthCalendar';
import { EventDetailDialog } from '../features/timetable/EventDetailDialog';
import {
  activeInWeek,
  addDays,
  formatSyncTime,
  mondayOf,
  semesterLabel,
  semesterOptions,
  weekForDate,
  weekStartFor,
} from '../features/timetable/timetable-format';
import { cn } from '../lib/utils';
import { webCall } from './api';

export function WebTimetable() {
  const [state, setState] = useState<TimetableState | null>(null);
  const [lessons, setLessons] = useState<readonly TimetableLesson[]>([]);
  const [semester, setSemester] = useState<string>();
  const [week, setWeek] = useState(1);
  const [month, setMonth] = useState(() => new Date());
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<CalendarItemDetail | null>(null);
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      webCall<TimetableState>('schedule.state', semester ? [semester] : []),
      webCall<TimetableLesson[]>('schedule.lessons', semester ? [semester] : []),
    ])
      .then(([next, rows]) => {
        if (!active) return;
        setState(next);
        setLessons(rows);
        setError('');
        if (loaded.current !== next.semester) {
          loaded.current = next.semester;
          setWeek(Math.max(1, weekForDate(next.semesterStart, new Date()) ?? 1));
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [semester]);
  async function sync() {
    setBusy(true);
    setError('');
    try {
      const result = await webCall<TimetableResult>('schedule.sync', semester ? [semester] : []);
      if (!result.ok) throw new Error(result.error ?? '课表同步失败');
      const [next, rows] = await Promise.all([
        webCall<TimetableState>('schedule.state', semester ? [semester] : []),
        webCall<TimetableLesson[]>('schedule.lessons', semester ? [semester] : []),
      ]);
      setState(next);
      setLessons(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '课表同步失败');
    } finally {
      setBusy(false);
    }
  }
  const start = weekStartFor(state?.semesterStart ?? null, week);
  const end = start ? addDays(start, 6) : null;
  const weeks = Array.from(
    {
      length: Math.max(
        state?.totalWeeks ?? 0,
        ...lessons.flatMap((row) => [...row.weekNumbers]),
        1,
      ),
    },
    (_, index) => index + 1,
  );
  function move(direction: number) {
    if (mode === 'month') setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));
    else setWeek(Math.max(1, Math.min(weeks.length, week + direction)));
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="border-b border-line bg-surface/95 px-4 py-2 backdrop-blur max-md:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {mode === 'month'
                ? `${month.getFullYear()}年 ${month.getMonth() + 1}月`
                : start && end
                  ? `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`
                  : `第 ${week} 教学周`}
            </h1>
            <p className="text-2xs text-ink-3">{state ? semesterLabel(state.semester) : '课表'}</p>
          </div>
          <div className="flex items-center rounded-control border border-line bg-surface shadow-hairline">
            <Button
              aria-label="上一段时间"
              size="icon-sm"
              variant="ghost"
              className="rounded-r-none"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-none border-x"
              onClick={() => {
                setMonth(new Date());
                setWeek(Math.max(1, weekForDate(state?.semesterStart ?? null, new Date()) ?? 1));
              }}
            >
              {mode === 'week' ? '本周' : '本月'}
            </Button>
            <Button
              aria-label="下一段时间"
              size="icon-sm"
              variant="ghost"
              className="rounded-l-none"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              aria-label="同步课表"
              title={formatSyncTime(state?.lastSyncedAt ?? null)}
              disabled={busy}
              size="icon-sm"
              variant="ghost"
              onClick={() => void sync()}
            >
              <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
            </Button>
            <div className="flex items-center rounded-control bg-hover-2 p-0.5">
              {(['week', 'month'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={mode === value}
                  className={cn(
                    'h-7 rounded px-3 text-xs font-medium transition-colors',
                    mode === value ? 'bg-surface shadow-hairline' : 'text-ink-3 hover:text-ink',
                  )}
                  onClick={() => setMode(value)}
                >
                  {value === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {state && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={state.semester} onValueChange={setSemester}>
              <SelectTrigger aria-label="学期">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {semesterOptions(state.semester).map((value) => (
                  <SelectItem key={value} value={value}>
                    {semesterLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode === 'week' && (
              <Select value={String(week)} onValueChange={(value) => setWeek(Number(value))}>
                <SelectTrigger aria-label="教学周">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      第 {value} 周
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </header>
      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-control bg-red-tint p-3 text-xs text-red">
          {error}
        </p>
      )}
      {state?.warnings?.map((warning) => (
        <p key={warning} role="status" className="px-4 py-2 text-xs text-ink-3">
          {warning}
        </p>
      ))}
      {!state ? (
        <p className="p-6 text-13 text-ink-3">正在读取课表…</p>
      ) : !state.lastSyncedAt ? (
        <div className="grid flex-1 place-items-center p-6">
          <div className="grid justify-items-center gap-4">
            <h2 className="text-lg font-semibold">同步吉大课表</h2>
            <Button disabled={busy} onClick={() => void sync()}>
              登录并同步
            </Button>
            <p className="text-xs text-ink-3">需要认证时，请在本机 Dela 中完成学校登录。</p>
          </div>
        </div>
      ) : mode === 'week' ? (
        <WeekCalendar
          lessons={lessons.filter((row) => activeInWeek(row, week))}
          events={[]}
          weekStart={start ?? mondayOf(new Date())}
          onOpen={setDetail}
        />
      ) : (
        <MonthCalendar
          lessons={lessons}
          events={[]}
          month={month}
          semesterStart={state.semesterStart}
        />
      )}
      {detail && (
        <EventDetailDialog
          detail={detail}
          onClose={() => setDetail(null)}
          onDeleted={() => setDetail(null)}
        />
      )}
    </div>
  );
}
