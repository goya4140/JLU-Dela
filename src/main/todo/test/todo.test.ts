import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
}));
vi.mock('../../database', () => ({ getDatabase: vi.fn() }));
vi.mock('../../ipc', () => ({ checkWorkspaceSender: vi.fn() }));
import { getDatabase } from '../../database';
import {
  getTodoState,
  markTodoRead,
  refreshTodos,
  removeTodo,
  saveTodo,
  todoNotifications,
} from '..';

let db: DatabaseSync;
beforeEach(() => {
  vi.clearAllMocks();
  db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE todo_items (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL, read_at TEXT, notice_at TEXT); CREATE TABLE workspace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  );
  vi.mocked(getDatabase).mockReturnValue({
    prepare: (sql: string) => db.prepare(sql),
    transaction: (fn: () => void) => () => {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as ReturnType<typeof getDatabase>);
});
afterEach(() => db.close());

describe('个人 TODO 持久化', () => {
  it('does not show, notify, mutate or delete legacy remote records', async () => {
    db.prepare('INSERT INTO todo_items VALUES (?, ?, ?, ?, ?)').run(
      'legacy',
      'old-owner',
      JSON.stringify({ id: 'legacy', source: 'canvas', title: '旧作业' }),
      null,
      '2026-10-01',
    );
    expect((await refreshTodos()).items).toEqual([]);
    expect(todoNotifications()).toEqual([]);
    markTodoRead();
    removeTodo('legacy');
    expect(db.prepare('SELECT read_at FROM todo_items WHERE id=?').get('legacy')).toMatchObject({
      read_at: null,
    });
  });
  it('个人待办可编辑、完成、重开和删除', async () => {
    const item = saveTodo({ title: '准备报告' }).items[0]!;
    saveTodo({ id: item.id, title: '准备报告', completed: true });
    expect(getTodoState().items[0]!.status).toBe('completed');
    saveTodo({ id: item.id, title: '报告', notes: '补图', completed: false });
    expect(getTodoState().items[0]).toMatchObject({
      title: '报告',
      notes: '补图',
      status: 'pending',
    });
    await refreshTodos();
    removeTodo(item.id);
    expect(getTodoState().items).toHaveLength(0);
  });
  it('写入日历标记与颜色随待办保存，完成等局部更新不会丢失', () => {
    const item = saveTodo({
      title: '准备报告',
      dueAt: '2026-09-22T10:00:00.000Z',
      calendar: true,
      color: 'rose',
    }).items[0]!;
    expect(item).toMatchObject({ calendar: true, color: 'rose' });
    saveTodo({ id: item.id, title: '准备报告', completed: true });
    expect(getTodoState().items[0]).toMatchObject({
      calendar: true,
      color: 'rose',
      status: 'completed',
    });
    expect(() => saveTodo({ title: '非法颜色', color: 'nope' })).toThrow();
  });
});
