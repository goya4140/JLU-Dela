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
  detachKnowledge,
  enrollCourse,
  knowledgeEntries,
  knowledgeFolders,
  knowledgeFiles,
  knowledgeState,
  removeCourse,
  searchKnowledge,
  indexKnowledgePdf,
  knowledgeNote,
} from '../api';
beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'knowledge-test-')));
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
  // Windows 未开启开发者模式时无法创建符号链接（EPERM），此时跳过链接相关断言。
  const linked = (() => {
    try {
      symlinkSync(tmpdir(), join(root, '跳转'));
      return true;
    } catch {
      return false;
    }
  })();
  if (linked) {
    expect(await knowledgeFolders(projectId, '')).not.toContain('跳转');
    await expect(enrollCourse(projectId, '跳转')).rejects.toThrow('范围');
  }
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
it('lists files as well as folders when browsing a connected folder', async () => {
  const library = await attachKnowledge(root);
  writeFileSync(join(root, '学期', '课件.pdf'), '%PDF-fixture');
  writeFileSync(join(root, '学期', '说明.txt'), 'hello');
  writeFileSync(join(root, '学期', '.hidden.md'), 'hidden');
  mkdirSync(join(root, '学期', 'node_modules'));

  const browsing = await knowledgeEntries(library.id, '');
  expect(browsing.folders).toEqual(['学期']);
  expect(browsing.files).toEqual([]);

  const inside = await knowledgeEntries(library.id, '学期');
  expect(inside.folders).toEqual(['课程']);
  expect(inside.files.map((file) => file.path.split(/[\\/]/).at(-1))).toEqual([
    '课件.pdf',
    '说明.txt',
  ]);
  expect(inside.files.find((file) => file.name === '说明.txt')?.bytes).toBe(5);
  expect(inside.files.some((file) => file.name === '.hidden.md')).toBe(false);
});
it('cancels a course registration and its PDF index while keeping the files on disk', async () => {
  const row = await course(),
    file = join(root, '学期', '课程', '课件.pdf');
  writeFileSync(file, '%PDF-fixture');
  const pdf = (await knowledgeFiles(row.id))[0]!;
  await indexKnowledgePdf(row.id, pdf.path, pdf.revision, ['滑动窗口']);

  removeCourse(row.id);

  expect(knowledgeState().courses).toEqual([]);
  expect(db.prepare('SELECT COUNT(*) AS n FROM knowledge_documents').get()).toEqual({ n: 0 });
  expect(readFileSync(file, 'utf8')).toBe('%PDF-fixture');
  // 取消后同一目录可以重新登记，索引需重新提取。
  const again = await enrollCourse(projectId, '学期/课程');
  expect(await searchKnowledge(again.id, '滑动窗口')).toEqual([]);
  expect(() => removeCourse(row.id)).toThrow('课程不存在');
});
it('detaches a connected folder with its courses and indexes but keeps the files', async () => {
  const row = await course(),
    file = join(root, '学期', '课程', '笔记.md');
  writeFileSync(file, '原有笔记');

  expect(detachKnowledge(projectId)).toBe(1);

  expect(knowledgeState()).toEqual({ roots: [], courses: [] });
  expect(db.prepare('SELECT COUNT(*) AS n FROM knowledge_documents').get()).toEqual({ n: 0 });
  expect(readFileSync(file, 'utf8')).toBe('原有笔记');
  expect(() => detachKnowledge(projectId)).toThrow('请先连接知识库文件夹');
  expect(() => removeCourse(row.id)).toThrow('课程不存在');
});
