import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoItem, TodoState } from '../../../../../shared/api';
import { todoTools } from '../index';

vi.mock('../../../../todo', async () => {
  const { z } = await import('zod');
  return {
    getTodoState: vi.fn(),
    refreshTodos: vi.fn(),
    saveTodo: vi.fn(),
    removeTodo: vi.fn(),
    // 与业务 todoSaveSchema 同形（校验本身属业务层职责，这里用可放行的等价 schema）。
    todoSaveSchema: z.object({
      id: z.string().optional(),
      title: z.string(),
      notes: z.string().optional(),
      dueAt: z.string().nullable().optional(),
      completed: z.boolean().optional(),
      calendar: z.boolean().optional(),
      color: z.string().optional(),
    }),
  };
});

import { getTodoState, removeTodo, saveTodo } from '../../../../todo';

const state = vi.mocked(getTodoState);
const save = vi.mocked(saveTodo);
const remove = vi.mocked(removeTodo);

function todoItem(overrides: Partial<TodoItem>): TodoItem {
  return {
    id: '0d7d21f5-8d5a-4f97-9c7f-2f5dfc1a1b2a',
    source: 'personal',
    title: '写周报',
    notes: '',
    dueAt: null,
    status: 'pending',
    readAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function todoState(overrides: Partial<TodoState> = {}): TodoState {
  return {
    items: [
      todoItem({
        id: '0d7d21f5-8d5a-4f97-9c7f-2f5dfc1a1b2a',
        title: '写周报',
        status: 'pending',
      }),
      todoItem({
        id: 'canvas:owner:1:2',
        source: 'canvas',
        title: '作业一',
        courseId: 1,
        courseName: '操作系统',
        dueAt: '2026-10-01T16:00:00.000Z',
        status: 'submitted',
        description: '<p>作业描述 HTML</p>',
      }),
    ],
    connected: true,
    syncing: false,
    syncedAt: '2026-09-28T00:00:00.000Z',
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.mockReturnValue(todoState());
});

describe('query_todos', () => {
  it('returns the unified list without assignment descriptions', () => {
    const result = todoTools.query_todos.execute({}) as {
      items: { id: string; description?: unknown }[];
      total: number;
      freshness: unknown;
      coverage: unknown;
    };
    expect(result.total).toBe(2);
    expect(result.items.every((item) => item.description === undefined)).toBe(true);
    expect(result.freshness).toEqual({ kind: 'cached', syncedAt: '2026-09-28T00:00:00.000Z' });
    expect(result.coverage).toEqual({
      scope: 'personal_todos',
      complete: true,
    });
  });

  it('filters by keyword and completion status across both sources', () => {
    const result = todoTools.query_todos.execute({ query: '作业' }) as { total: number };
    expect(result.total).toBe(1);
    const completed = todoTools.query_todos.execute({ query: '', completed: true }) as {
      total: number;
    };
    expect(completed.total).toBe(1); // submitted 算已完成
    const open = todoTools.query_todos.execute({ query: '', completed: false }) as {
      total: number;
    };
    expect(open.total).toBe(1); // pending；unknown/offline 两不算
  });
});

describe('save_todo', () => {
  it('passes color and completion through and returns the slimmed state', () => {
    save.mockReturnValue(todoState());
    const input = { title: '复习', completed: true, color: 'sage' };
    const result = todoTools.save_todo.execute(input) as {
      items: { description?: unknown }[];
    };
    expect(save).toHaveBeenCalledWith(input);
    expect(result.items.every((item) => item.description === undefined)).toBe(true);
  });

  it('maps a missing target id to NOT_FOUND', () => {
    save.mockImplementation(() => {
      throw new Error('待办不存在，Canvas 作业的完成状态只能通过同步更新');
    });
    let caught: unknown;
    try {
      todoTools.save_todo.execute({ id: 'missing', title: 'x' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('remove_todo', () => {
  it('removes a personal todo after the existence precheck', () => {
    remove.mockReturnValue(todoState({ items: [] }));
    const result = todoTools.remove_todo.execute({
      id: '0d7d21f5-8d5a-4f97-9c7f-2f5dfc1a1b2a',
    }) as {
      removedId: string;
    };
    expect(remove).toHaveBeenCalledWith('0d7d21f5-8d5a-4f97-9c7f-2f5dfc1a1b2a');
    expect(result.removedId).toBe('0d7d21f5-8d5a-4f97-9c7f-2f5dfc1a1b2a');
  });

  it('refuses canvas assignments and unknown ids', () => {
    let caught: unknown;
    try {
      todoTools.remove_todo.execute({ id: 'canvas:owner:1:2' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'OPERATION_FAILED' });
    expect(remove).not.toHaveBeenCalled();

    caught = undefined;
    try {
      todoTools.remove_todo.execute({ id: 'nope' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'NOT_FOUND' });
    expect(remove).not.toHaveBeenCalled();
  });
});
