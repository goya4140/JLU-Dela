import { StudyCalendar, type StudyCalendarApi } from './StudyCalendar';
import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type {
  CalendarEventColor,
  TodoItem,
  TodoSaveInput,
  TodoState,
  TodoApi,
} from '../../../shared/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '@/components/ui/beautifului/atoms/Switch';
import { cn } from '../../lib/utils';
import { showToast } from '../../app/toasts';
import { errorText } from '../../workspace/store';
import { EventColorRow } from '../timetable/EventColorRow';
import { roundToMinute } from '../timetable/timetable-format';
import { DateTimeStepper } from './DateTimeStepper';
import { TodoDetail } from './TodoDetail';
import { TodoSheet } from './TodoSheet';

const inputClass =
  'w-full rounded-control bg-field px-2.5 py-1.5 text-13 text-ink shadow-hairline outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus-visible:bg-surface focus-visible:shadow-[0_0_0_1px_var(--bui-accent),0_0_0_3px_var(--bui-accent-tint)]';

// 颜色与「同时显示在课表页」两行在新建和编辑面板共用，结构与日历新建事件的分组行一致。
function CalendarOptionRows({
  calendar,
  color,
  onCalendarChange,
  onColorChange,
}: {
  calendar: boolean;
  color: CalendarEventColor;
  onCalendarChange: (value: boolean) => void;
  onColorChange: (value: CalendarEventColor) => void;
}) {
  return (
    <>
      <EventColorRow onColorChange={onColorChange} value={color} />
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="w-8 shrink-0 text-xs text-ink-3">日历</span>
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="text-13">同时显示在课表页</span>
          <Switch checked={calendar} label="同时显示在课表页" onChange={onCalendarChange} />
        </div>
      </div>
    </>
  );
}

/** 新建/编辑待办共用的底部滑出面板：标题、备注、截止时间、颜色与同时显示在课表页开关。 */
function TodoComposer({
  item,
  busy,
  onCancel,
  onDelete,
  onSave,
}: {
  item?: TodoItem;
  busy: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  onSave: (input: TodoSaveInput) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  // 新建默认取创建时刻（向下取整到分钟）；编辑保留原值，允许为空。
  const [dueAt, setDueAt] = useState<Date | null>(() =>
    item ? (item.dueAt ? roundToMinute(new Date(item.dueAt)) : null) : roundToMinute(new Date()),
  );
  const [calendar, setCalendar] = useState(item?.calendar ?? false);
  const [color, setColor] = useState<CalendarEventColor>(item?.color ?? 'slate');
  return (
    <TodoSheet
      label={item ? '编辑待办' : '新建待办'}
      title={item ? '编辑待办' : '新建待办'}
      onClose={onCancel}
    >
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            id: item?.id,
            title,
            notes,
            dueAt: dueAt ? dueAt.toISOString() : null,
            calendar,
            color,
          });
        }}
      >
        <Input
          autoFocus
          className="h-10 px-0 text-15 font-medium"
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：准备小组展示"
          value={title}
          variant="ghost"
        />
        <div className="grid divide-y overflow-hidden rounded-card border border-line">
          <div className="flex min-h-11 items-center gap-2 px-3">
            <span className="w-8 shrink-0 text-xs text-ink-3">截止</span>
            <div className="min-w-0 flex-1">
              {dueAt === null ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDueAt(roundToMinute(new Date()))}
                >
                  <Plus className="size-4" />
                  设置截止时间
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <DateTimeStepper onChange={setDueAt} value={dueAt} />
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink"
                    onClick={() => setDueAt(null)}
                    type="button"
                  >
                    <X className="size-3" />
                    清除
                  </button>
                </div>
              )}
            </div>
          </div>
          <CalendarOptionRows
            calendar={calendar}
            color={color}
            onCalendarChange={setCalendar}
            onColorChange={setColor}
          />
        </div>
        <textarea
          aria-label="备注"
          className={cn(inputClass, 'min-h-20 resize-y')}
          maxLength={10000}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="备注"
          rows={3}
          value={notes}
        />
        <div className="flex items-center justify-between gap-2">
          {item && onDelete ? (
            <Button
              variant="ghost"
              aria-label="删除待办"
              title="删除待办"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              取消
            </Button>
            <Button disabled={busy || !title.trim()} type="submit">
              保存
            </Button>
          </div>
        </div>
      </form>
    </TodoSheet>
  );
}

export type TodoPageApi = Omit<TodoApi, 'onUpdate'> & Partial<Pick<TodoApi, 'onUpdate'>>;
export function TodoView({
  request,
  api = window.dela?.todo,
  calendarApi,
  onOpenTimetable,
  onOpenWork,
  onOpenLink,
}: {
  request?: { id: string };
  api?: TodoPageApi;
  calendarApi?: StudyCalendarApi;
  onOpenTimetable?: () => void;
  onOpenWork?: ((courseId: string, workId: string) => void) | null;
  onOpenLink?: (url: string) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [state, setState] = useState<TodoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!api) return;
    let active = true;
    let updated = false;
    const off = api.onUpdate?.((value) => {
      updated = true;
      if (active) setState(value);
    });
    void api
      .getState()
      .then((value) => {
        if (active && !updated) setState(value);
      })
      .catch((error: unknown) => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
      off?.();
    };
  }, [api]);
  useEffect(() => {
    if (!request) return;
    setCreating(false);
    setEditingId(null);
    setDetailId(request.id);
    void api?.markRead(request.id).catch((reason: unknown) => {
      showToast({ variant: 'error', title: '标记已读失败', description: errorText(reason) });
    });
  }, [request, api]);
  const run = async (
    operation: () => Promise<TodoState>,
    options?: { after?: () => void; failTitle?: string },
  ) => {
    setBusy(true);
    try {
      setState(await operation());
      options?.after?.();
    } catch (reason) {
      showToast({
        variant: 'error',
        title: options?.failTitle ?? '待办操作失败',
        description: errorText(reason),
      });
    } finally {
      setBusy(false);
    }
  };
  const detail = state?.items.find((item) => item.id === detailId);
  const editing = state?.items.find((item) => item.id === editingId);
  const openItem = (id: string) => {
    setDetailId(id);
    void run(() => api!.markRead(id), { failTitle: '标记已读失败' });
  };
  return (
    <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-6 py-6 max-md:px-4">
      {error && (
        <p role="alert" className="text-13 text-red">
          {error}
        </p>
      )}
      <StudyCalendar
        api={calendarApi}
        onOpenTimetable={onOpenTimetable}
        onOpenWork={onOpenWork}
        now={now}
        todos={state?.items ?? []}
        onOpenTodo={openItem}
        onCreateTodo={() => {
          setCreating(true);
          setEditingId(null);
          setDetailId(null);
        }}
      />
      {detail && (
        <TodoDetail
          busy={busy}
          item={detail}
          now={now}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setEditingId(detail.id);
          }}
          onDelete={() =>
            void run(() => api!.remove(detail.id), {
              failTitle: '删除待办失败',
            })
          }
          onToggleCompleted={() => {
            if (!busy)
              void run(() =>
                api!.save({
                  id: detail.id,
                  title: detail.title,
                  completed: detail.status !== 'completed',
                }),
              );
          }}
          onOpenLink={(url) =>
            void (
              onOpenLink ? Promise.resolve(onOpenLink(url)) : window.dela?.workspace.openLink(url)
            )?.catch((reason: unknown) =>
              showToast({
                variant: 'error',
                title: '打开链接失败',
                description: errorText(reason),
              }),
            )
          }
        />
      )}
      {(creating || editing) && (
        <TodoComposer
          key={editing ? editing.id : 'new'}
          item={editing}
          busy={busy}
          onCancel={() => {
            setCreating(false);
            setEditingId(null);
          }}
          onDelete={
            editing
              ? () =>
                  void run(() => api!.remove(editing.id), {
                    after: () => setEditingId(null),
                    failTitle: '删除待办失败',
                  })
              : undefined
          }
          onSave={(input) =>
            void run(() => api!.save(input), {
              after: () => {
                setCreating(false);
                setEditingId(null);
              },
              failTitle: '保存待办失败',
            })
          }
        />
      )}
    </div>
  );
}
