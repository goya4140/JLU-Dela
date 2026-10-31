import { saveTodo, todoSaveSchema } from '../../../todo';
import { slimTodo, tool, toolError } from '../shared';

export const saveTodoTool = tool(
  '新建或修改个人待办（本地写）。提供 id 时更新已有条目；学习通作业请在学校平台完成。completed 控制完成状态；dueAt 为 UTC ISO 8601；calendar+color 控制是否在日历中按截止时间显示。',
  todoSaveSchema,
  (input) => {
    try {
      const state = saveTodo(input);
      return { ...state, items: state.items.map(slimTodo) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('待办不存在')) throw toolError('NOT_FOUND', message);
      throw error;
    }
  },
);
