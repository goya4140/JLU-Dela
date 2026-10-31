import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDatabase } from '../database';
import { checkWorkspaceSender } from '../ipc';
import { calendarEventColors } from '../../shared/api';
import type { NotificationItem, TodoItem, TodoState } from '../../shared/api';

const idSchema = z.string().min(1).max(512);
export const todoSaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(10000).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    completed: z.boolean().optional(),
    calendar: z.boolean().optional(),
    color: z.enum(calendarEventColors).optional(),
  })
  .strict();
type TodoRow = {
  id: string;
  owner: string;
  data: string;
  read_at: string | null;
  notice_at: string | null;
};
function rows(): TodoRow[] {
  return getDatabase().prepare("SELECT * FROM todo_items WHERE owner='local'").all() as TodoRow[];
}

export function getTodoState(): TodoState {
  return {
    items: rows()
      .map((row) => ({ ...JSON.parse(row.data), readAt: row.read_at }) as TodoItem)
      .sort(
        (a, b) => (a.dueAt ?? 'z').localeCompare(b.dueAt ?? 'z') || a.title.localeCompare(b.title),
      ),
    connected: false,
    syncing: false,
    syncedAt: null,
    error: null,
  };
}

export function broadcastTodos(): TodoState {
  const state = getTodoState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    const url = window.webContents.getURL();
    if (
      url.startsWith('http://127.0.0.1:5173/') ||
      (url.startsWith('file:') && /\/renderer\/index\.html(?:\?|$)/.test(url))
    ) {
      window.webContents.send('todo:state', state);
    }
  }
  return state;
}

export function saveTodo(input: unknown): TodoState {
  const value = todoSaveSchema.parse(input);
  const existing = value.id
    ? rows().find((row) => row.id === value.id && row.owner === 'local')
    : undefined;
  if (value.id && !existing) throw new Error('个人待办不存在');
  const old = existing ? (JSON.parse(existing.data) as TodoItem) : undefined;
  const now = new Date().toISOString();
  const item: TodoItem = {
    id: value.id ?? randomUUID(),
    source: 'personal',
    title: value.title,
    notes: value.notes ?? old?.notes ?? '',
    dueAt: value.dueAt === undefined ? (old?.dueAt ?? null) : value.dueAt,
    status:
      value.completed === undefined
        ? (old?.status ?? 'pending')
        : value.completed
          ? 'completed'
          : 'pending',
    calendar: value.calendar ?? old?.calendar ?? false,
    color: value.color ?? old?.color,
    createdAt: old?.createdAt ?? now,
    readAt: now,
  };
  getDatabase()
    .prepare(
      "INSERT INTO todo_items(id, owner, data, read_at) VALUES (?, 'local', ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .run(item.id, JSON.stringify(item), now);
  return broadcastTodos();
}

export function removeTodo(input: unknown): TodoState {
  getDatabase()
    .prepare("DELETE FROM todo_items WHERE id=? AND owner='local'")
    .run(idSchema.parse(input));
  return broadcastTodos();
}

export function markTodoRead(input?: unknown): TodoState {
  const id = input === undefined ? null : idSchema.parse(input);
  getDatabase()
    .prepare(
      "UPDATE todo_items SET read_at=COALESCE(read_at, ?) WHERE owner='local' AND (? IS NULL OR id=?)",
    )
    .run(new Date().toISOString(), id, id);
  return broadcastTodos();
}

export function todoNotifications(): NotificationItem[] {
  return [];
}

export async function refreshTodos(): Promise<TodoState> {
  return broadcastTodos();
}

export function registerTodoIpc(): void {
  for (const [name, fn] of Object.entries({
    'get-state': getTodoState,
    refresh: refreshTodos,
    save: saveTodo,
    remove: removeTodo,
    'mark-read': (id: unknown) => markTodoRead(idSchema.parse(id)),
  })) {
    ipcMain.handle(`todo:${name}`, (event, input: unknown) => {
      checkWorkspaceSender(event);
      return fn(input);
    });
  }
}
