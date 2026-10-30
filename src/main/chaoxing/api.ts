import { safeStorage, type WebContents } from 'electron';
import { mkdirSync, rmSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { getDatabase } from '../database';
import { readSchoolPage } from '../jlu/reader';
import { platformResult } from '../jlu/api';
import { chaoxingSession, isChaoxingLoginUrl } from './session';
import {
  chaoxingCoursesScript,
  chaoxingEntryScript,
  chaoxingFilesScript,
  chaoxingFrameScript,
  chaoxingWorksScript,
} from '../../shared/chaoxing-collectors';
import { getWorkspaceState } from '../workspace/api';
import { safeFileName } from '../vsjtu/transcript';
import { availablePath } from '../storage';

const id = z.string().regex(/^[A-Za-z0-9:_-]{1,180}$/);
const schoolUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'chaoxing.com' || url.hostname.endsWith('.chaoxing.com')) &&
      !url.username &&
      !url.password
    );
  });
const courseSchema = z.object({
  id,
  name: z.string().min(1),
  teacher: z.string(),
  ended: z.boolean(),
});
const fileSchema = z.object({
  id,
  name: z.string().min(1),
  type: z.string(),
  size: z.string(),
  creator: z.string(),
  date: z.string(),
  downloadable: z.boolean(),
});
const workSchema = z.object({
  id,
  title: z.string().min(1),
  status: z.string(),
  timing: z.string(),
});
const coursesSchema = z.object({ items: z.array(courseSchema), syncedAt: z.string().datetime() });
const filesSchema = z.object({
  courseId: id,
  folderId: z.string(),
  name: z.string(),
  items: z.array(fileSchema),
  syncedAt: z.string().datetime(),
});
const worksSchema = z.object({
  courseId: id,
  items: z.array(workSchema),
  syncedAt: z.string().datetime(),
});
export async function chaoxingResult<T>(work: () => Promise<T>) {
  return platformResult(async () => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('学习通页面结构无法识别，本地缓存未更新');
      throw error;
    }
  });
}
function cache<T>(key: string, schema: z.ZodType<T>): T | null {
  const row = getDatabase()
    .prepare('SELECT data FROM jlu_platform_cache WHERE key=?')
    .get('cx:' + key) as { data: string } | undefined;
  return row ? schema.parse(JSON.parse(row.data)) : null;
}
function save<T>(key: string, data: T): T {
  getDatabase()
    .prepare('INSERT OR REPLACE INTO jlu_platform_cache(key,data) VALUES (?,?)')
    .run('cx:' + key, JSON.stringify(data));
  return data;
}
function privateRoutes(): Record<string, string> {
  const data = cache('routes', z.string());
  if (!data) return {};
  return z
    .record(z.string(), schoolUrl)
    .parse(JSON.parse(safeStorage.decryptString(Buffer.from(data, 'base64'))));
}
function saveRoutes(routes: Record<string, string>) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存学习通会话入口');
  save('routes', safeStorage.encryptString(JSON.stringify(routes)).toString('base64'));
}
async function read(url: string, script: string, sender?: WebContents) {
  schoolUrl.parse(url);
  const target = new URL(url);
  return readSchoolPage({
    url,
    title: '学习通',
    sender,
    script,
    sessionStore: chaoxingSession,
    isLoginUrl: isChaoxingLoginUrl,
    loginScript: `Boolean(document.querySelector('#phone, #pwd, input[type="password"]'))`,
    accepts: (current) =>
      (current.origin === target.origin && current.pathname === target.pathname) ||
      (target.pathname === '/visit/stucoursemiddle' &&
        current.hostname === 'mooc2-ans.chaoxing.com' &&
        current.pathname === '/mooc2-ans/mycourse/stu'),
    resumeFrom: (current) =>
      current.hostname === 'i.chaoxing.com' &&
      current.pathname === '/base' &&
      target.hostname !== 'i.chaoxing.com',
  });
}
export function getChaoxingCourses() {
  return cache('courses', coursesSchema);
}
export async function syncChaoxingCourses(sender?: WebContents) {
  const entry = z
    .object({ url: schoolUrl })
    .parse(await read('https://i.chaoxing.com/base', chaoxingEntryScript, sender));
  const rows = z
    .array(courseSchema.extend({ url: schoolUrl }))
    .parse(await read(entry.url, chaoxingCoursesScript, sender));
  const routes = privateRoutes();
  for (const row of rows) routes['course:' + row.id] = row.url;
  saveRoutes(routes);
  return save('courses', {
    items: rows.map(({ url: _url, ...course }) => course),
    syncedAt: new Date().toISOString(),
  });
}
function ownCourse(courseId: string) {
  id.parse(courseId);
  const course = getChaoxingCourses()?.items.find((row) => row.id === courseId);
  if (!course) throw new Error('请先同步并选择自己的学习通课程');
  return course;
}
async function courseFrame(courseId: string, kind: 'files' | 'works', sender?: WebContents) {
  ownCourse(courseId);
  const routes = privateRoutes();
  let route = routes['course:' + courseId];
  if (!route) throw new Error('请先重新同步学习通课程');
  if (new URL(route).pathname === '/visit/stucoursemiddle') {
    route = z
      .object({ url: schoolUrl })
      .parse(await read(route, `(() => ({ready:true,data:{url:location.href}}))()`, sender)).url;
    routes['course:' + courseId] = route;
    saveRoutes(routes);
  }
  const url = new URL(route);
  url.searchParams.set('pageHeader', kind === 'files' ? '3' : '8');
  return z.object({ url: schoolUrl }).parse(await read(url.href, chaoxingFrameScript(kind), sender))
    .url;
}
export function getChaoxingFiles(courseId: string, folderId = '') {
  id.parse(courseId);
  if (folderId) id.parse(folderId);
  return cache(`files:${courseId}:${folderId}`, filesSchema);
}
export async function syncChaoxingFiles(courseId: string, folderId = '', sender?: WebContents) {
  ownCourse(courseId);
  if (folderId) id.parse(folderId);
  let routes = privateRoutes();
  const url = folderId
    ? routes[`folder:${courseId}:${folderId}`]
    : await courseFrame(courseId, 'files', sender);
  if (!url) throw new Error('请从资料根目录进入此文件夹');
  const rows = z
    .array(
      fileSchema.extend({ folderUrl: schoolUrl.nullable(), downloadUrl: schoolUrl.nullable() }),
    )
    .parse(await read(url, chaoxingFilesScript, sender));
  routes = privateRoutes();
  for (const row of rows) {
    if (row.folderUrl) routes[`folder:${courseId}:${row.id}`] = row.folderUrl;
    if (row.downloadUrl) routes[`download:${courseId}:${folderId}:${row.id}`] = row.downloadUrl;
  }
  saveRoutes(routes);
  return save(`files:${courseId}:${folderId}`, {
    courseId,
    folderId,
    name: folderId ? new URL(url).searchParams.get('dataName') || '资料' : '课程资料',
    items: rows.map(({ folderUrl: _folder, downloadUrl: _download, ...file }) => file),
    syncedAt: new Date().toISOString(),
  });
}
export function getChaoxingWorks(courseId: string) {
  id.parse(courseId);
  return cache('works:' + courseId, worksSchema);
}
export async function syncChaoxingWorks(courseId: string, sender?: WebContents) {
  const url = await courseFrame(courseId, 'works', sender);
  const items = z.array(workSchema).parse(await read(url, chaoxingWorksScript, sender));
  return save('works:' + courseId, { courseId, items, syncedAt: new Date().toISOString() });
}
export async function importChaoxingFile(courseId: string, folderId: string, fileId: string) {
  const course = ownCourse(courseId);
  const file = getChaoxingFiles(courseId, folderId)?.items.find(
    (row) => row.id === id.parse(fileId),
  );
  const route = privateRoutes()[`download:${courseId}:${folderId}:${fileId}`];
  if (!file?.downloadable || !route) throw new Error('学校未提供该文件的下载入口');
  const campus = await chaoxingSession.get();
  let target = route;
  let response: Response | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!schoolUrl.safeParse(target).success)
      throw new Error('该资料的下载地址暂不支持，请使用学习通下载');
    response = await campus.fetch(target, {
      credentials: 'include',
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('学习通下载跳转缺少地址');
      target = new URL(location, target).href;
      continue;
    }
    break;
  }
  if (
    !response?.ok ||
    !response.body ||
    /text\/html|application\/json/.test(response.headers.get('content-type') || '')
  ) {
    await response?.body?.cancel();
    throw new Error('文件未能下载，请刷新课程资料并重试');
  }
  const directory = join(getWorkspaceState().directory, '学习通资料', safeFileName(course.name));
  mkdirSync(directory, { recursive: true });
  const path = availablePath(directory, safeFileName(file.name), false);
  let received = 0;
  let created = false;
  const output = createWriteStream(path, { flags: 'wx' });
  output.once('open', () => {
    created = true;
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          received += chunk.length;
          if (received > 200 * 1024 * 1024) throw new Error('文件超过 200 MB，请在学习通中下载');
          yield chunk;
        }
      },
      output,
    );
  } catch (error) {
    if (created) rmSync(path, { force: true });
    throw error;
  }
  return { id: path };
}
