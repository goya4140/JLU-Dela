import type { CalendarEventColor } from './timetable';

export type TodoStatus =
  'pending' | 'completed' | 'submitted' | 'graded' | 'excused' | 'resubmit' | 'offline' | 'unknown';
export interface TodoItem {
  id: string;
  source: 'personal' | 'canvas';
  title: string;
  notes: string;
  dueAt: string | null;
  status: TodoStatus;
  readAt: string | null;
  createdAt: string;
  /** 仅个人待办：开启后在日历（周/月视图）中按截止时间显示。 */
  calendar?: boolean;
  /** 仅个人待办：写入日历时的候选色；未选时渲染回退石墨色。 */
  color?: CalendarEventColor;
  courseId?: number;
  /** 历史课程代码，用于保持旧日历条目的配色。 */
  courseCode?: string;
  courseName?: string;
  assignmentId?: number;
  url?: string;
  /** 历史作业描述 HTML，renderer 经沙箱 iframe 渲染。 */
  description?: string;
  submittedAt?: string | null;
  syncedAt?: string;
}
export interface TodoState {
  items: TodoItem[];
  connected: boolean;
  syncing: boolean;
  syncedAt: string | null;
  error: string | null;
}
export interface TodoSaveInput {
  id?: string;
  title: string;
  notes?: string;
  dueAt?: string | null;
  completed?: boolean;
  calendar?: boolean;
  color?: CalendarEventColor;
}
export interface TodoApi {
  getState(): Promise<TodoState>;
  refresh(): Promise<TodoState>;
  save(input: TodoSaveInput): Promise<TodoState>;
  remove(id: string): Promise<TodoState>;
  markRead(id: string): Promise<TodoState>;
  onUpdate(listener: (state: TodoState) => void): () => void;
}

export const todoStatusLabels: Record<TodoStatus, string> = {
  pending: '未完成',
  completed: '已完成',
  submitted: '已提交',
  graded: '已批改',
  excused: '已豁免',
  resubmit: '需重新提交',
  offline: '线下 / 无需在线提交',
  unknown: '待同步确认',
};

export function todoCompleted(status: TodoStatus): boolean {
  return ['completed', 'submitted', 'graded', 'excused'].includes(status);
}
