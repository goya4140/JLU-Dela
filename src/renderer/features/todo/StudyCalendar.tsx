import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import type { TimetableLesson, TimetableState, TodoItem } from '../../../shared/api';
import type { ChaoxingCalendar, ChaoxingCalendarSync } from '../../../shared/chaoxing-calendar';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/beautifului/atoms/Switch';
import { useNavigationStore } from '../../navigation/view';
import { errorText } from '../../workspace/store';
import { cn } from '../../lib/utils';
import {
  addDays,
  dateKey,
  eventColorStyle,
  mondayOf,
  startOfDay,
  weekDays,
} from '../timetable/timetable-format';
import { monthGridDays, monthLabel } from './todo-calendar';
import { studyEntries, type StudyEntry } from './study-calendar';
import { TodoSheet } from './TodoSheet';

const sourceLabels = { course: '课程', assignment: '作业', personal: '个人待办' } as const;
type View = 'month' | 'week' | 'list';

export function StudyCalendar({
  todos,
  onOpenTodo,
  onCreateTodo,
}: {
  todos: readonly TodoItem[];
  onOpenTodo: (id: string) => void;
  onCreateTodo: () => void;
}) {
  const [academic, setAcademic] = useState<{
    state: TimetableState;
    lessons: readonly TimetableLesson[];
  } | null>(null);
  const [assignments, setAssignments] = useState<ChaoxingCalendar | null>(null);
  const [failures, setFailures] = useState<ChaoxingCalendarSync['failures']>([]);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [workError, setWorkError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [sources, setSources] = useState({ course: true, assignment: true, personal: true });
  const [showCompleted, setShowCompleted] = useState(false);
  const [selected, setSelected] = useState<StudyEntry | null>(null);
  const undatedSection = useRef<HTMLElement>(null);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const load = useCallback(async () => {
    const api = window.dela;
    if (!api) return;
    await Promise.allSettled([
      api.timetable
        ? Promise.all([api.timetable.getState(), api.timetable.listLessons()])
            .then(([state, lessons]) => {
              setAcademic({ state, lessons });
              setAcademicError(null);
            })
            .catch((error) => setAcademicError(errorText(error)))
        : Promise.resolve(),
      api.chaoxing?.calendar
        ? api.chaoxing
            .calendar()
            .then((data) => {
              setAssignments(data);
              setWorkError(null);
            })
            .catch((error) => setWorkError(errorText(error)))
        : Promise.resolve(),
    ]);
  }, []);
  useEffect(() => {
    let active = true;
    void load().finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function refreshWorks() {
    if (!window.dela?.chaoxing || syncing) return;
    setSyncing(true);
    setWorkError(null);
    try {
      const result = await window.dela.chaoxing.syncCalendar();
      setAssignments(result.data);
      setFailures(result.failures);
    } catch (error) {
      setWorkError(errorText(error));
    } finally {
      setSyncing(false);
    }
  }
  const week = mondayOf(anchor);
  const days =
    view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : monthGridDays(anchor);
  const rangeStart =
    view === 'list' ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : days[0]!;
  const rangeEnd =
    view === 'list'
      ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
      : addDays(days.at(-1)!, 1);
  const projected = studyEntries(todos, academic, assignments, rangeStart, rangeEnd);
  const visible = projected.entries.filter(
    (entry) => sources[entry.source] && (entry.source === 'course' || showCompleted || !entry.done),
  );
  const undated = visible.filter((entry) => !entry.date);
  const dated = visible.filter(
    (entry) => entry.date && entry.date >= dateKey(rangeStart) && entry.date < dateKey(rangeEnd),
  );
  const pendingCourses = assignments?.courses.filter((course) => !course.syncedAt) ?? [];
  const open = (entry: StudyEntry) =>
    entry.kind === 'personal' ? onOpenTodo(entry.todo.id) : setSelected(entry);
  const step = (amount: number) => {
    setExpandedDays([]);
    setAnchor(
      view === 'week'
        ? addDays(anchor, amount * 7)
        : new Date(anchor.getFullYear(), anchor.getMonth() + amount, 1),
    );
  };
  const renderEntry = (entry: StudyEntry) => (
    <button
      key={entry.id}
      type="button"
      onClick={() => open(entry)}
      title={`${sourceLabels[entry.source]} · ${entry.title}${entry.kind === 'assignment' ? ` · ${entry.work.courseName}` : ''}${entry.time ? ` · ${entry.time}` : ''}`}
      aria-label={`${sourceLabels[entry.source]}：${entry.title}${entry.time ? `，${entry.time}` : ''}`}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 rounded-control px-1.5 py-1 text-left text-2xs hover:opacity-80',
        view === 'week' && 'flex-wrap',
        entry.done && 'opacity-60',
      )}
      style={eventColorStyle(entry.color)}
    >
      <span className="shrink-0 @max-[520px]:hidden">
        {entry.source === 'assignment'
          ? entry.date
            ? '截止'
            : '作业'
          : entry.source === 'course'
            ? '课'
            : '待办'}
      </span>
      {entry.time && (
        <span className="shrink-0 tabular-nums @max-[520px]:hidden">{entry.time}</span>
      )}
      <span
        className={cn(
          'truncate font-medium',
          view === 'week' && 'w-full',
          entry.done && 'line-through',
        )}
      >
        {entry.title}
      </span>
    </button>
  );
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">学习日历</h1>
          <div className="flex items-center gap-1">
            <Button aria-label="上一段日期" size="icon-sm" variant="ghost" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <span className="text-sm font-medium tabular-nums">
              {view === 'week'
                ? `${dateKey(week)} — ${dateKey(addDays(week, 6))}`
                : monthLabel(anchor)}
            </span>
            <Button aria-label="下一段日期" size="icon-sm" variant="ghost" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(startOfDay(new Date()))}>
              今天
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={syncing || !window.dela?.chaoxing?.syncCalendar}
            onClick={() => void refreshWorks()}
          >
            <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
            {syncing ? '逐门读取作业…' : '刷新学习通作业'}
          </Button>
          <Button size="sm" disabled={!window.dela?.todo} onClick={onCreateTodo}>
            <Plus className="size-4" />
            新建待办
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 py-4">
        {(Object.keys(sourceLabels) as (keyof typeof sourceLabels)[]).map((source) => (
          <Button
            size="sm"
            variant={sources[source] ? 'secondary' : 'ghost'}
            aria-pressed={sources[source]}
            key={source}
            onClick={() => setSources({ ...sources, [source]: !sources[source] })}
          >
            {sourceLabels[source]}
          </Button>
        ))}
        {undated.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => undatedSection.current?.scrollIntoView({ block: 'nearest' })}
          >
            未定日期 · {undated.length}
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          <Switch checked={showCompleted} label="显示已完成" onChange={setShowCompleted} />
          显示已完成
        </label>
        <div
          role="group"
          aria-label="学习日历视图"
          className="flex gap-0.5 rounded-control bg-inset p-0.5"
        >
          {(
            [
              ['week', '周'],
              ['month', '月'],
              ['list', '列表'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? 'secondary' : 'ghost'}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-4 grid gap-2 text-xs text-ink-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              课表：
              {academic?.state.lastSyncedAt
                ? `更新于 ${new Date(academic.state.lastSyncedAt).toLocaleString('zh-CN')}`
                : '尚未同步'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => useNavigationStore.getState().navigate('timetable')}
            >
              查看或同步课表
            </Button>
          </div>
          <span>
            学习通：
            {assignments?.coursesSyncedAt
              ? `${assignments.courses.length - pendingCourses.length}/${assignments.courses.length} 门课程已有作业缓存`
              : '尚未同步课程'}
            ；仅包含本次读取的作业页面。
          </span>
          {pendingCourses.length > 0 && (
            <details aria-label="未读取课程">
              <summary>{pendingCourses.length} 门课程尚未读取作业</summary>
              <p className="pt-2">{pendingCourses.map((course) => course.name).join('、')}</p>
            </details>
          )}
          {academicError && (
            <p role="alert">
              课表读取失败：{academicError}。
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                重试本地读取
              </Button>
            </p>
          )}
          {workError && (
            <p role="alert" className="text-red">
              学习通读取失败：{workError}
              。请检查网络，或进入学习通确认可正常访问后重试；旧缓存保留。
            </p>
          )}
          {failures.map((failure) => (
            <p role="alert" className="text-red" key={failure.courseId ?? 'courses'}>
              {assignments?.courses.find((course) => course.id === failure.courseId)?.name ??
                '课程列表'}
              ：{failure.error}。
              {failure.reason === 'auth'
                ? '认证未完成，后续课程已停止读取；准备好后重试刷新。'
                : '旧缓存保留，可重试刷新。'}
            </p>
          ))}
          {sources.course && projected.warnings.length > 0 && (
            <details>
              <summary>课表日期提示（{projected.warnings.length}）</summary>
              {projected.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </details>
          )}
        </div>
        {!loaded && <p className="py-4 text-13 text-ink-3">正在读取本地日历…</p>}
        {view === 'list' ? (
          <section aria-label="学习日历列表" className="grid gap-2">
            {!dated.length && (
              <p className="py-6 text-center text-13 text-ink-3">本月暂无符合条件的安排</p>
            )}
            {dated.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"
              >
                <span className="text-xs tabular-nums text-ink-3">{entry.date}</span>
                {renderEntry(entry)}
              </div>
            ))}
          </section>
        ) : (
          <section aria-label={view === 'month' ? '学习月历' : '学习周历'} className="@container">
            <div
              className={cn(
                'grid gap-px',
                view === 'month' ? 'grid-cols-7' : 'grid-cols-1 md:grid-cols-7',
              )}
            >
              {view === 'month' &&
                weekDays.map((day) => (
                  <span key={day} className="py-2 text-center text-2xs text-ink-3">
                    {day}
                  </span>
                ))}
              {days.map((date) => {
                const key = dateKey(date),
                  entries = dated.filter((entry) => entry.date === key);
                const expanded = view === 'week' || expandedDays.includes(key);
                return (
                  <div
                    key={key}
                    aria-label={`${key}，${entries.length} 项安排`}
                    className={cn(
                      'min-w-0 border-b p-1.5',
                      view === 'month' ? 'min-h-24 max-md:min-h-20' : 'min-h-40',
                      date.getMonth() !== anchor.getMonth() && view === 'month' && 'bg-inset',
                    )}
                  >
                    <div className="mb-2 flex items-center gap-1">
                      {view === 'week' && (
                        <span className="text-xs text-ink-3">
                          {weekDays[(date.getDay() + 6) % 7]}
                        </span>
                      )}
                      <span
                        className={cn(
                          'grid size-6 place-items-center rounded-full text-xs font-medium',
                          key === dateKey(new Date()) && 'bg-ink text-surface',
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      {(expanded ? entries : entries.slice(0, 3)).map(renderEntry)}
                    </div>
                    {!expanded && entries.length > 3 && (
                      <button
                        className="mt-1 text-2xs text-ink-3 hover:text-ink"
                        onClick={() => setExpandedDays([...expandedDays, key])}
                      >
                        +{entries.length - 3} 更多
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {undated.length > 0 && (
          <section ref={undatedSection} aria-label="未定日期事项" className="mt-6 grid gap-2 pb-4">
            <h2 className="text-sm font-medium">截止时间待确认 / 无日期待办 · {undated.length}</h2>
            <p className="text-xs text-ink-3">时间提示保留自同步时刻，未推算截止日期。</p>
            {undated.map(renderEntry)}
          </section>
        )}
      </div>
      {selected && selected.kind !== 'personal' && (
        <TodoSheet label="学习日历详情" title={selected.title} onClose={() => setSelected(null)}>
          {selected.kind === 'course' ? (
            <div className="mt-4 grid gap-2 text-13">
              <p>教务课表 · {selected.date}</p>
              <p>
                {selected.time} – {selected.endTime}
              </p>
              <p>
                {selected.lesson.periodsText} · {selected.lesson.weeksText}
              </p>
              <p>
                {[selected.lesson.campus, selected.lesson.classroom, selected.lesson.teacher]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Button
                variant="outline"
                onClick={() => useNavigationStore.getState().navigate('timetable')}
              >
                查看课表
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid gap-2 text-13">
              <p>学习通 · {selected.work.courseName}</p>
              <p>平台状态：{selected.work.status || '未知'}</p>
              <p>
                截止：
                {selected.date
                  ? `${selected.date} ${selected.time ?? '（未提供具体时刻）'}`
                  : '待确认'}
              </p>
              <p className="whitespace-pre-wrap">
                平台时间原文：{selected.work.timing || '未提供'}
              </p>
              <p className="text-xs text-ink-3">
                更新于 {new Date(selected.work.syncedAt).toLocaleString('zh-CN')}
                ；状态和时间以本次同步为准。
              </p>
              <Button
                variant="outline"
                onClick={() => useNavigationStore.getState().navigate('chaoxing')}
              >
                前往学习通课程
              </Button>
            </div>
          )}
        </TodoSheet>
      )}
    </>
  );
}
