import { ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { storageDirectory } from '../storage';
import { searchLocalWorkspace } from '../workspace/local-tree';
import { z } from 'zod';
import { GLOBAL_SEARCH_PER_KIND_LIMIT, type GlobalSearchResult } from '../../shared/search';
import { getTodoState } from '../todo';
import { todoStatusLabels } from '../../shared/todo';
import { getDatabase } from '../database';
import { checkWorkspaceSender } from '../ipc';

const querySchema = z.string().trim().max(200);
const perKindLimit = GLOBAL_SEARCH_PER_KIND_LIMIT;

function likePattern(query: string): string {
  return `%${query.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')}%`;
}

type ProjectRow = { id: string; title: string; updatedAt: string };
type ChatRow = {
  id: string;
  projectId: string | null;
  title: string;
  subtitle: string;
  updatedAt: string;
};
type MailRow = {
  id: number;
  subject: string | null;
  senderName: string | null;
  senderAddress: string | null;
  snippet: string | null;
  date: string | null;
};

/**
 * Searches only data already stored in Dela's SQLite database. In particular,
 * No remote course files are downloaded here.
 */
export function queryGlobalSearch(query: string): GlobalSearchResult[] {
  const db = getDatabase();
  const pattern = likePattern(query);
  const projects = (
    query
      ? db
          .prepare(
            "SELECT id, name AS title, updated_at AS updatedAt FROM workspace_entries WHERE kind='project' AND name LIKE ? ESCAPE '!' ORDER BY updated_at DESC LIMIT ?",
          )
          .all(pattern, perKindLimit)
      : db
          .prepare(
            "SELECT id, name AS title, updated_at AS updatedAt FROM workspace_entries WHERE kind='project' ORDER BY updated_at DESC LIMIT ?",
          )
          .all(perKindLimit)
  ) as ProjectRow[];
  // 只按会话标题匹配：正文在 Pi 的 JSONL 会话文件里，sessions 表没有消息列。
  const chats = (
    query
      ? db
          .prepare(
            "SELECT sessions.id, sessions.project_id AS projectId, sessions.title, coalesce(project.name, '首页') AS subtitle, sessions.updated_at AS updatedAt FROM sessions LEFT JOIN workspace_entries AS project ON project.id=sessions.project_id AND project.kind='project' WHERE sessions.title LIKE ? ESCAPE '!' ORDER BY sessions.updated_at DESC LIMIT ?",
          )
          .all(pattern, perKindLimit)
      : db
          .prepare(
            "SELECT sessions.id, sessions.project_id AS projectId, sessions.title, coalesce(project.name, '首页') AS subtitle, sessions.updated_at AS updatedAt FROM sessions LEFT JOIN workspace_entries AS project ON project.id=sessions.project_id AND project.kind='project' ORDER BY sessions.updated_at DESC LIMIT ?",
          )
          .all(perKindLimit)
  ) as ChatRow[];
  const mail = (
    query
      ? db
          .prepare(
            "SELECT id, subject, sender_name AS senderName, sender_address AS senderAddress, snippet, date FROM mail_messages WHERE deleted_at IS NULL AND (subject LIKE ? ESCAPE '!' OR sender_name LIKE ? ESCAPE '!' OR sender_address LIKE ? ESCAPE '!' OR snippet LIKE ? ESCAPE '!' OR body_text LIKE ? ESCAPE '!') ORDER BY date DESC LIMIT ?",
          )
          .all(pattern, pattern, pattern, pattern, pattern, perKindLimit)
      : db
          .prepare(
            'SELECT id, subject, sender_name AS senderName, sender_address AS senderAddress, snippet, date FROM mail_messages WHERE deleted_at IS NULL ORDER BY date DESC LIMIT ?',
          )
          .all(perKindLimit)
  ) as MailRow[];
  const todos = getTodoState()
    .items.filter((item) =>
      `${item.title} ${item.notes} ${item.courseName ?? ''}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    )
    .slice(0, perKindLimit);
  return [
    ...todos.map((item) => ({
      kind: 'todo' as const,
      id: item.id,
      title: item.title,
      subtitle: `${item.courseName ?? '个人待办'} · ${todoStatusLabels[item.status]}${item.dueAt ? ` · ${item.dueAt}` : ''}`,
      target: { page: 'todo' as const, todoId: item.id },
    })),
    ...projects.map((row) => ({
      kind: 'project' as const,
      id: row.id,
      title: row.title,
      subtitle: null,
      target: { page: 'projects' as const, entryId: row.id },
    })),
    ...chats.map((row) => ({
      kind: 'chat' as const,
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      target: { page: 'chat' as const, projectId: row.projectId, sessionId: row.id },
    })),
    ...mail.map((row) => ({
      kind: 'mail' as const,
      id: row.id,
      title: row.subject || '(无主题)',
      subtitle: row.senderName || row.senderAddress || row.snippet,
      target: { page: 'mail' as const, messageId: row.id },
    })),
  ];
}

export async function queryCourseFiles(query: string): Promise<GlobalSearchResult[]> {
  const root = join(storageDirectory(), 'workspace', '学习通资料');
  if (!existsSync(root)) return [];
  const files = await searchLocalWorkspace(root, query);
  return files
    .filter((item) => item.kind === 'file')
    .slice(0, perKindLimit)
    .map((item) => ({
      kind: 'course-file',
      id: item.id,
      title: item.name,
      subtitle: relative(root, item.path ?? item.id),
      target: { page: 'sources', entryId: item.id },
    }));
}

export function registerSearchIpc(): void {
  ipcMain.handle('search:query', async (event, query: unknown) => {
    checkWorkspaceSender(event);
    const value = querySchema.parse(query);
    return [...queryGlobalSearch(value), ...(await queryCourseFiles(value))];
  });
}
