import type { AgentTool } from '../shared';
import { queryTodosTool } from './query';
import { removeTodoTool } from './remove';
import { saveTodoTool } from './save';

export const todoTools = {
  query_todos: queryTodosTool,
  save_todo: saveTodoTool,
  remove_todo: removeTodoTool,
} satisfies Record<string, AgentTool>;
