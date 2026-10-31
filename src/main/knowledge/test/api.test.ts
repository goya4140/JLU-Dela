import Database from 'better-sqlite3';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
let db: Database.Database, root: string;
const projectId = randomUUID();
vi.mock('../../database', () => ({ getDatabase: () => db }));
vi.mock('../../workspace/api', () => ({
  linkProjectFolder: (path: string) => ({ id: projectId, path, name: '示例知识库' }),
}));
vi.mock('../../agent/session', () => ({ newSession: () => ({ sessionId: randomUUID() }) }));
import {
  attachKnowledge,
  enrollCourse,
  knowledgeFolders,
  knowledgeFiles,
  searchKnowledge,
  indexKnowledgePdf,
  knowledgeNote,
} from '../api';
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'knowledge-test-')));
  db = new Database(':memory:');
  db.exec(`CREATE TABLE knowledge_roots(id TEXT PRIMARY KEY,name TEXT,path TEXT);
 CREATE TABLE knowledge_courses(id TEXT PRIMARY KEY,root_id TEXT,name TEXT,relative_path TEXT,session_id TEXT);
 CREATE TABLE knowledge_documents(course_id TEXT,path TEXT,revision TEXT,pages TEXT,PRIMARY KEY(course_id,path));`);
  mkdirSync(join(root, '学期', '课程'), { recursive: true });
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
async function course() {
  const library = await attachKnowledge(root);
  return enrollCourse(library.id, '学期/课程');
}
it('connects and enrolls folders in place without rewriting source files', async () => {
  writeFileSync(join(root, '学期', '课程', '笔记.md'), '原有笔记');
  const row = await course();
  expect(await enrollCourse(projectId, '学期/课程')).toEqual(row);
  expect(await knowledgeFolders(projectId, '学期')).toEqual(['课程']);
  expect((await knowledgeFiles(row.id))[0]?.path).toBe('笔记.md');
  expect(readFileSync(join(root, '学期', '课程', '笔记.md'), 'utf8')).toBe('原有笔记');
});
it('finds Chinese note text with line and heading and reads external edits on the next search', async () => {
  const row = await course(),
    file = join(root, '学期', '课程', '笔记.md');
  writeFileSync(file, '# 可靠传输\n滑动窗口需要确认机制');
  expect(await searchKnowledge(row.id, '滑动窗口')).toEqual([
    expect.objectContaining({ title: '可靠传输', line: 2, path: '笔记.md' }),
  ]);
  writeFileSync(file, '# 外部修改\n拥塞控制');
  expect(await searchKnowledge(row.id, '滑动窗口')).toEqual([]);
  expect((await searchKnowledge(row.id, '拥塞控制'))[0]?.line).toBe(2);
});
it('keeps PDF page references and invalidates cached text when the original changes or disappears', async () => {
  const row = await course(),
    file = join(root, '学期', '课程', '课件.pdf');
  writeFileSync(file, '%PDF-fixture');
  const original = (await knowledgeFiles(row.id))[0]!;
  await indexKnowledgePdf(row.id, original.path, original.revision, ['概述', '滑动窗口与确认']);
  expect((await searchKnowledge(row.id, '滑动窗口'))[0]?.page).toBe(2);
  writeFileSync(file, '%PDF-fixture-updated');
  expect(await searchKnowledge(row.id, '滑动窗口')).toEqual([]);
  await expect(
    indexKnowledgePdf(row.id, original.path, original.revision, ['旧片段']),
  ).rejects.toThrow('更新');
  unlinkSync(file);
  expect(await knowledgeFiles(row.id)).toEqual([]);
});
it('excludes dependency and hidden folders and refuses escaping paths and symlinks', async () => {
  const row = await course();
  mkdirSync(join(root, '学期', '课程', 'node_modules'));
  writeFileSync(join(root, '学期', '课程', 'node_modules', 'secret.md'), 'secret');
  symlinkSync(tmpdir(), join(root, '跳转'));
  expect(await knowledgeFolders(projectId, '')).not.toContain('跳转');
  await expect(enrollCourse(projectId, '跳转')).rejects.toThrow('范围');
  await expect(enrollCourse(projectId, '..')).rejects.toThrow('范围');
  expect(await knowledgeFiles(row.id)).toEqual([]);
});
it('writes a new Markdown note in its course and never overwrites an existing note', async () => {
  const row = await course();
  const path = await knowledgeNote(row.id, '# 学习记录\n\n引用：课件.pdf 第 2 页');
  expect(path).toBe(join(root, '学期', '课程', '笔记', '学习笔记.md'));
  expect(await knowledgeNote(row.id, '另一份笔记')).not.toBe(path);
  expect(readFileSync(path, 'utf8')).toContain('引用');
});
