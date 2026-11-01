import { randomUUID } from 'node:crypto';
import { readdir, stat, realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, isAbsolute, sep, extname } from 'node:path';
import { z } from 'zod';
import { getDatabase } from '../database';
import { linkProjectFolder } from '../workspace/api';
import { availablePath } from '../storage';
import { newSession } from '../agent/session';
import type {
  KnowledgeCourse,
  KnowledgeEntries,
  KnowledgeFile,
  KnowledgeHit,
  KnowledgeRoot,
} from '../../shared/knowledge';

const excluded = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'target',
  '__pycache__',
  'venv',
]);
export function knowledgeState() {
  return {
    roots: getDatabase()
      .prepare('SELECT id,name,path FROM knowledge_roots')
      .all() as KnowledgeRoot[],
    courses: getDatabase()
      .prepare(
        'SELECT id,root_id AS rootId,name,relative_path AS relativePath FROM knowledge_courses',
      )
      .all() as KnowledgeCourse[],
  };
}
export async function attachKnowledge(path: string) {
  const canonical = await realpath(path);
  const project = linkProjectFolder(canonical);
  getDatabase()
    .prepare('INSERT OR IGNORE INTO knowledge_roots(id,name,path) VALUES(?,?,?)')
    .run(project.id, project.name, canonical);
  return knowledgeState().roots.find((root) => root.id === project.id)!;
}
async function inside(root: string, path: string) {
  const target = await realpath(resolve(root, path));
  const suffix = relative(root, target);
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith('..' + sep))
    throw new Error('资料超出所选知识库范围');
  return target;
}
function rootById(id: string) {
  const root = knowledgeState().roots.find((row) => row.id === id);
  if (!root) throw new Error('请先连接知识库文件夹');
  return root;
}
function courseById(id: string) {
  const course = knowledgeState().courses.find((row) => row.id === id);
  if (!course) throw new Error('课程不存在，请重新选择');
  return course;
}
export async function courseDirectory(id: string) {
  const course = courseById(id);
  return inside(rootById(course.rootId).path, course.relativePath);
}
const collator = (a: string, b: string) => a.localeCompare(b, 'zh-CN');
/** 除隐藏项与被排除的依赖目录外，不跟随符号链接（与 knowledgeFiles 的遍历口径一致）。 */
function visible(row: { name: string; isSymbolicLink(): boolean }) {
  return !row.name.startsWith('.') && !excluded.has(row.name) && !row.isSymbolicLink();
}
export async function knowledgeFolders(rootId: string, path: string) {
  const directory = await inside(rootById(rootId).path, path);
  return (await readdir(directory, { withFileTypes: true }))
    .filter((row) => row.isDirectory() && visible(row))
    .map((row) => row.name)
    .sort(collator);
}
/**
 * 浏览已连接文件夹时的目录内容：子文件夹与文件都返回，文件带相对路径与体积。
 * 文件按名称排序，调用方据此决定直接打开还是在设为课程后再阅读。
 */
export async function knowledgeEntries(rootId: string, path: string): Promise<KnowledgeEntries> {
  const root = rootById(rootId),
    directory = await inside(root.path, path);
  const rows = await readdir(directory, { withFileTypes: true });
  const folders = rows
    .filter((row) => row.isDirectory() && visible(row))
    .map((row) => row.name)
    .sort(collator);
  const files: KnowledgeEntries['files'] = [];
  for (const row of rows) {
    if (!row.isFile() || !visible(row)) continue;
    const target = join(directory, row.name);
    let bytes = 0;
    try {
      bytes = (await stat(target)).size;
    } catch {
      // 读取失败（权限不足或被占用）仍列出条目，体积留空，交给打开时再报错。
    }
    files.push({ name: row.name, path: relative(root.path, target), bytes });
  }
  files.sort((a, b) => collator(a.name, b.name));
  return { folders, files };
}
/** 取消课程：删除本机登记与 PDF 正文索引，磁盘上的课程文件保持原位。 */
export function removeCourse(id: string) {
  const db = getDatabase();
  courseById(id);
  db.prepare('DELETE FROM knowledge_documents WHERE course_id=?').run(id);
  db.prepare('DELETE FROM knowledge_courses WHERE id=?').run(id);
}
/**
 * 断开知识库：删除该文件夹下的课程登记与索引，并移除连接记录。
 * 磁盘文件与工作台项目都保留，重新连接同一目录即恢复浏览。
 */
export function detachKnowledge(id: string) {
  const db = getDatabase();
  rootById(id);
  const courses = knowledgeState().courses.filter((row) => row.rootId === id);
  for (const course of courses) {
    db.prepare('DELETE FROM knowledge_documents WHERE course_id=?').run(course.id);
    db.prepare('DELETE FROM knowledge_courses WHERE id=?').run(course.id);
  }
  db.prepare('DELETE FROM knowledge_roots WHERE id=?').run(id);
  return courses.length;
}
export async function enrollCourse(rootId: string, path: string) {
  const root = rootById(rootId),
    directory = await inside(root.path, path);
  if (!(await stat(directory)).isDirectory()) throw new Error('请选择课程文件夹');
  const relativePath = relative(root.path, directory);
  const existing = knowledgeState().courses.find(
    (row) => row.rootId === rootId && row.relativePath === relativePath,
  );
  if (existing) return existing;
  const course = { id: randomUUID(), rootId, name: basename(directory), relativePath };
  getDatabase()
    .prepare('INSERT INTO knowledge_courses(id,root_id,name,relative_path) VALUES(?,?,?,?)')
    .run(course.id, rootId, course.name, relativePath);
  return course;
}
export async function knowledgeFiles(courseId: string): Promise<KnowledgeFile[]> {
  const root = await courseDirectory(courseId),
    files: KnowledgeFile[] = [];
  const indexed = new Map(
    (
      getDatabase()
        .prepare('SELECT path,revision FROM knowledge_documents WHERE course_id=?')
        .all(courseId) as { path: string; revision: string }[]
    ).map((row) => [row.path, row.revision]),
  );
  async function walk(directory: string) {
    for (const row of await readdir(directory, { withFileTypes: true })) {
      if (row.name.startsWith('.') || excluded.has(row.name) || row.isSymbolicLink()) continue;
      const path = join(directory, row.name);
      if (row.isDirectory()) await walk(path);
      else if (row.isFile()) {
        const info = await stat(path),
          local = relative(root, path),
          revision = `${info.mtimeMs}-${info.size}`;
        files.push({
          path: local,
          name: row.name,
          bytes: info.size,
          revision,
          indexed: indexed.get(local) === revision,
        });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}
export async function searchKnowledge(courseId: string, query: string): Promise<KnowledgeHit[]> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const root = await courseDirectory(courseId),
    files = await knowledgeFiles(courseId),
    hits: KnowledgeHit[] = [];
  for (const file of files) {
    const suffix = extname(file.path).toLowerCase();
    let found = false;
    if (['.md', '.txt'].includes(suffix) && file.bytes <= 2 * 1024 * 1024) {
      const text = await readFile(await inside(root, file.path), 'utf8');
      let heading = '';
      for (const [line, value] of text.split('\n').entries()) {
        if (/^#{1,6}\s/.test(value)) heading = value.replace(/^#+\s*/, '');
        const offset = value.toLocaleLowerCase().indexOf(needle);
        if (offset < 0) continue;
        hits.push({
          path: file.path,
          title: heading || file.name,
          excerpt: value.slice(Math.max(0, offset - 100), offset + 300),
          line: line + 1,
        });
        found = true;
        break;
      }
    } else if (suffix === '.pdf' && file.indexed) {
      const row = getDatabase()
        .prepare('SELECT pages FROM knowledge_documents WHERE course_id=? AND path=?')
        .get(courseId, file.path) as { pages: string };
      const pages = JSON.parse(row.pages) as string[];
      for (const [page, text] of pages.entries()) {
        const offset = text.toLocaleLowerCase().indexOf(needle);
        if (offset < 0) continue;
        hits.push({
          path: file.path,
          title: file.name,
          excerpt: text.slice(Math.max(0, offset - 100), offset + 300),
          page: page + 1,
        });
        found = true;
        if (hits.length >= 50) break;
      }
    }
    if (!found && file.path.toLocaleLowerCase().includes(needle))
      hits.push({
        path: file.path,
        title: file.name,
        excerpt: '文件名匹配；正文未命中或尚未提取。',
      });
    if (hits.length >= 50) break;
  }
  return hits.slice(0, 50);
}
export async function indexKnowledgePdf(
  courseId: string,
  path: string,
  revision: string,
  pages: unknown,
) {
  const parsed = z
    .array(z.string().max(100000))
    .min(1)
    .max(300)
    .refine((rows) => rows.reduce((n, row) => n + row.length, 0) <= 2000000, '文件正文过长')
    .parse(pages);
  const root = await courseDirectory(courseId),
    target = await inside(root, path);
  if (extname(target).toLowerCase() !== '.pdf') throw new Error('只能提取 PDF 正文');
  const info = await stat(target);
  if (revision !== `${info.mtimeMs}-${info.size}`)
    throw new Error('文件已在外部更新，请刷新后重新提取');
  getDatabase()
    .prepare(
      'INSERT OR REPLACE INTO knowledge_documents(course_id,path,revision,pages) VALUES(?,?,?,?)',
    )
    .run(courseId, relative(root, target), revision, JSON.stringify(parsed));
}
export function knowledgeSession(courseId: string) {
  const course = courseById(courseId);
  const row = getDatabase()
    .prepare('SELECT session_id AS id FROM knowledge_courses WHERE id=?')
    .get(courseId) as { id: string | null };
  if (row.id && getDatabase().prepare('SELECT id FROM sessions WHERE id=?').get(row.id))
    return row.id;
  const chat = newSession(course.rootId, 'chat', false);
  getDatabase()
    .prepare('UPDATE knowledge_courses SET session_id=? WHERE id=?')
    .run(chat.sessionId, courseId);
  return chat.sessionId!;
}
export async function knowledgeNote(courseId: string, text: string) {
  if (!text.trim()) throw new Error('笔记内容不能为空');
  const root = await courseDirectory(courseId);
  let directory = join(root, '笔记');
  await mkdir(directory, { recursive: true });
  directory = await inside(root, '笔记');
  const path = availablePath(directory, '学习笔记.md');
  await writeFile(path, text, { flag: 'wx' });
  return path;
}
