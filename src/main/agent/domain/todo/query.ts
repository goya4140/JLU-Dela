import { z } from 'zod';
import { getTodoState } from '../../../todo';
import type { TodoItem } from '../../../../shared/api';
import { todoCompleted } from '../../../../shared/todo';
import { coverage, freshness, limit, match, offset, page, query, slimTodo, tool } from '../shared';

function matchesCompleted(item: TodoItem, completed: boolean | undefined) {
  return (
    completed === undefined ||
    (completed ? todoCompleted(item.status) : ['pending', 'resubmit'].includes(item.status))
  );
}

export const queryTodosTool = tool(
  '查询个人待办清单（只读本地记录），可按关键词与完成状态筛选。学习通作业请使用 query_chaoxing_works。',
  z.object({ query, completed: z.boolean().optional(), offset, limit }).strict(),
  ({ query, completed, offset, limit }) => {
    const state = getTodoState();
    const items = state.items.filter(
      (item) =>
        match(`${item.title} ${item.notes} ${item.courseName ?? ''}`, query) &&
        matchesCompleted(item, completed),
    );
    const warnings: string[] = [];
    if (state.error) warnings.push(`上次作业同步出错：${state.error}`);
    return {
      ...page(items.map(slimTodo), offset, limit),
      freshness: freshness('cached', state.syncedAt ?? undefined),
      coverage: coverage('personal_todos', warnings.length === 0, warnings),
    };
  },
);
