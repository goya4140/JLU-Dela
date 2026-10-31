// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimetableLesson, TodoItem, TodoState } from '../../../shared/api';
import { TodoView } from './TodoView';

const todo: TodoItem = {
  id: 'personal:1',
  source: 'personal',
  title: '读书计划',
  notes: '',
  dueAt: null,
  status: 'pending',
  readAt: null,
  createdAt: '',
};
const state: TodoState = {
  items: [todo],
  connected: false,
  syncing: false,
  syncedAt: null,
  error: null,
};
const lesson: TimetableLesson = {
  id: 1,
  semester: '2026',
  courseCode: 'CS1',
  courseName: '实验课',
  className: null,
  teacher: null,
  campus: null,
  classroom: '实验室',
  weekday: 1,
  startPeriod: 1,
  endPeriod: 2,
  startMinute: 480,
  endMinute: 575,
  periodsText: '1-2节',
  weeksText: '1,3周',
  weekNumbers: [1, 3],
  credits: null,
  note: null,
};
const assignments = {
  coursesSyncedAt: '2026-10-31T00:00:00Z',
  courses: [{ id: 'a', name: '软件工程', syncedAt: '2026-10-31T00:00:00Z' }],
  works: [
    {
      id: '1',
      courseId: 'a',
      courseName: '软件工程',
      title: '课程报告',
      status: '未交',
      timing: '截止时间：2026-10-27 23:59',
      syncedAt: '2026-10-31T00:00:00Z',
      deadline: { date: '2026-10-27', time: '23:59' },
    },
    {
      id: '2',
      courseId: 'a',
      courseName: '软件工程',
      title: '未定日期作业',
      status: '未交',
      timing: '剩余2天',
      syncedAt: '2026-10-31T00:00:00Z',
      deadline: null,
    },
    {
      id: '3',
      courseId: 'a',
      courseName: '软件工程',
      title: '已交报告',
      status: '已提交',
      timing: '截止日期：2026-10-28',
      syncedAt: '2026-10-31T00:00:00Z',
      deadline: { date: '2026-10-28', time: null },
    },
  ],
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T04:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  window.dela = {
    todo: {
      getState: vi.fn(async () => state),
      onUpdate: vi.fn(() => () => {}),
      markRead: vi.fn(async () => state),
      save: vi.fn(async () => state),
      remove: vi.fn(async () => state),
    },
    timetable: {
      getState: vi.fn(async () => ({
        semester: '2026',
        semesterStart: '2026-10-12',
        totalWeeks: 16,
        lastSyncedAt: null,
      })),
      listLessons: vi.fn(async () => [lesson]),
    },
    chaoxing: {
      calendar: vi.fn(async () => assignments),
      syncCalendar: vi.fn(async () => ({ data: assignments, failures: [] })),
    },
  } as unknown as NonNullable<typeof window.dela>;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete window.dela;
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
const mount = () =>
  act(async () => {
    root.render(<TodoView />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('学习日历', () => {
  it('loads local snapshots without syncing, filters sources, and leaves relative deadlines outside day cells', async () => {
    await mount();
    expect(host.querySelector('[aria-label="学习月历"]')).not.toBeNull();
    expect(host.querySelector('[aria-label^="课程：实验课"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="2026-10-27，1 项安排"]')?.textContent).toContain(
      '课程报告',
    );
    expect(host.querySelector('[aria-label="未定日期事项"]')?.textContent).toContain(
      '未定日期作业',
    );
    expect(host.querySelector('[aria-label="学习月历"]')?.textContent).not.toContain(
      '未定日期作业',
    );
    expect(host.textContent).not.toContain('已交报告');
    expect(window.dela!.chaoxing.syncCalendar).not.toHaveBeenCalled();
    await act(async () => button('作业').click());
    expect(host.textContent).not.toContain('课程报告');
    expect(host.querySelector('[aria-label^="课程：实验课"]')).not.toBeNull();
    await act(async () => button('作业').click());
    await act(async () =>
      (host.querySelector('[aria-label="显示已完成"]') as HTMLButtonElement).click(),
    );
    expect(host.textContent).toContain('已交报告');
    expect(host.querySelector('[aria-label^="课程：实验课"]')).not.toBeNull();
  });
  it('shows work metadata without a completion action; personal tasks retain completion and editing', async () => {
    await mount();
    await act(async () =>
      (host.querySelector('[aria-label^="作业：课程报告"]') as HTMLButtonElement).click(),
    );
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('软件工程');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('23:59');
    expect(button('标为完成')).toBeUndefined();
    await act(async () => (host.querySelector('[aria-label="关闭"]') as HTMLButtonElement).click());
    await act(async () =>
      (host.querySelector('[aria-label="个人待办：读书计划"]') as HTMLButtonElement).click(),
    );
    await act(async () => button('标为完成').click());
    expect(window.dela!.todo.save).toHaveBeenCalledWith({
      id: todo.id,
      title: todo.title,
      completed: true,
    });
  });
  it('retains visible snapshots when refresh fails and offers week/list views', async () => {
    vi.mocked(window.dela!.chaoxing.syncCalendar).mockRejectedValue(new Error('网络超时'));
    await mount();
    await act(async () => button('刷新学习通作业').click());
    expect(host.textContent).toContain('网络超时');
    expect(host.textContent).toContain('课程报告');
    await act(async () => button('周').click());
    expect(host.querySelector('[aria-label="学习周历"]')).not.toBeNull();
    expect(host.textContent).toContain('实验课');
    await act(async () => button('列表').click());
    expect(host.querySelector('[aria-label="学习日历列表"]')?.textContent).toContain('课程报告');
  });
});
