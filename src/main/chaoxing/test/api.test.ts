import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
let db: Database.Database, directory: string;
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('electron', () => ({
  net: { request: mocks.request },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from('sealed:' + value),
    decryptString: (value: Buffer) => value.toString().slice(7),
  },
}));
vi.mock('../../database', () => ({ getDatabase: () => db }));
vi.mock('../../jlu/reader', () => ({ readSchoolPage: vi.fn() }));
vi.mock('../../jlu/api', () => ({
  platformResult: async (work: () => Promise<unknown>) => {
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message,
        ...((error as Error).cause === 'auth' ? { reason: 'auth' } : {}),
      };
    }
  },
}));
vi.mock('../session', () => ({
  chaoxingSession: {
    partition: 'persist:chaoxing',
    get: async () => ({}),
    flush: async () => {},
  },
  isChaoxingLoginUrl: () => false,
}));
vi.mock('../../workspace/api', () => ({ getWorkspaceState: () => ({ directory }) }));
vi.mock('../../storage', () => ({ availablePath: (dir: string, name: string) => join(dir, name) }));
import { readSchoolPage } from '../../jlu/reader';
import {
  getChaoxingCourses,
  getChaoxingCalendar,
  syncChaoxingCalendar,
  getChaoxingFiles,
  getChaoxingWorks,
  syncChaoxingCourses,
  syncChaoxingFiles,
  syncChaoxingWorks,
  importChaoxingFile,
  chaoxingResult,
} from '../api';
const reader = vi.mocked(readSchoolPage);
beforeEach(() => {
  vi.clearAllMocks();
  db = new Database(':memory:');
  db.exec('CREATE TABLE jlu_platform_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL)');
  directory = mkdtempSync(join(tmpdir(), 'dela-cx-api-'));
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
async function seedCourse() {
  reader
    .mockResolvedValueOnce({ url: 'https://mooc2-ans.chaoxing.com/visit/interaction?s=private' })
    .mockResolvedValueOnce([
      {
        id: '1:2',
        name: '示例课程',
        teacher: '示例教师',
        ended: false,
        url: 'https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=1&clazzid=2&enc=private',
      },
    ]);
  return syncChaoxingCourses();
}
async function seedFile() {
  await seedCourse();
  reader
    .mockResolvedValueOnce({
      url: 'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=1&clazzid=2&enc=private',
    })
    .mockResolvedValueOnce({
      url: 'https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?enc=private',
    })
    .mockResolvedValueOnce([
      {
        id: 'd1',
        name: '示例.pdf',
        type: 'pdf',
        size: '5KB',
        creator: '教师',
        date: '10-31',
        downloadable: true,
        folderUrl: null,
        downloadUrl: 'https://mooc1.chaoxing.com/coursedata/downloadData?dataId=d1&enc=private',
      },
    ]);
  return syncChaoxingFiles('1:2');
}
it('keeps signed course routes outside renderer and plaintext caches, and preserves data on failed refresh', async () => {
  const data = await seedCourse();
  expect(JSON.stringify(data)).not.toMatch(/private|url|enc/);
  const routes = db.prepare("SELECT data FROM jlu_platform_cache WHERE key='cx:routes'").get() as {
    data: string;
  };
  expect(routes.data).not.toContain('enc=private');
  expect(getChaoxingCourses()).toEqual(data);
  reader.mockRejectedValueOnce(new Error('network unavailable'));
  expect(await chaoxingResult(() => syncChaoxingCourses())).toEqual({
    ok: false,
    error: 'network unavailable',
  });
  expect(getChaoxingCourses()).toEqual(data);
});
it('resolves the course landing page before reading metadata and retains assignments on invalid responses', async () => {
  await seedFile();
  expect(JSON.stringify(getChaoxingFiles('1:2'))).not.toContain('private');
  expect(
    reader.mock.calls.some(([options]) =>
      options.accepts(new URL('https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu')),
    ),
  ).toBe(true);
  reader
    .mockResolvedValueOnce({ url: 'https://mooc1.chaoxing.com/mooc2/work/list?enc=private' })
    .mockResolvedValueOnce([{ id: 'w1', title: '示例作业', status: '未交', timing: '剩余2天' }]);
  const works = await syncChaoxingWorks('1:2');
  expect(getChaoxingWorks('1:2')).toEqual(works);
  reader
    .mockResolvedValueOnce({ url: 'https://mooc1.chaoxing.com/mooc2/work/list' })
    .mockResolvedValueOnce({ maintenance: true });
  expect(await chaoxingResult(() => syncChaoxingWorks('1:2'))).toMatchObject({
    ok: false,
    error: expect.stringContaining('结构'),
  });
  expect(getChaoxingWorks('1:2')).toEqual(works);
});
function downloadRequest(target = 'https://download.chaoxing.com/fixture.pdf', statusCode = 200) {
  const request = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    end: () => queueMicrotask(() => request.emit('redirect', 302, 'GET', target)),
    followRedirect: vi.fn(() => {
      const response = Object.assign(Readable.from([Buffer.from('%PDF-fixture')]), {
        statusCode,
        headers: { 'content-type': 'application/pdf' },
      });
      request.emit('response', response);
    }),
    abort: () => request.emit('abort'),
  });
  mocks.request.mockReturnValueOnce(request);
  return request;
}
it.each(['https://download.chaoxing.com/fixture.pdf', 'https://d0.cldisk.com/fixture.pdf'])(
  'follows the allowed native download redirect %s and imports inside the workspace',
  async (target) => {
    await seedFile();
    const request = downloadRequest(target);
    const result = await importChaoxingFile('1:2', '', 'd1');
    expect(request.followRedirect).toHaveBeenCalledOnce();
    expect(request.setHeader).toHaveBeenCalledWith('Referer', 'https://mooc2-ans.chaoxing.com/');
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ useSessionCookies: true, redirect: 'manual' }),
    );
    expect(result.id.startsWith(join(directory, 'workspace'))).toBe(true);
    expect(readFileSync(result.id, 'utf8')).toBe('%PDF-fixture');
  },
);
it('refuses non-school native redirect destinations', async () => {
  await seedFile();
  const request = downloadRequest('https://example.com/private');
  await expect(importChaoxingFile('1:2', '', 'd1')).rejects.toThrow('下载地址暂不支持');
  expect(request.followRedirect).not.toHaveBeenCalled();
});
it('reports a refused file download as a download failure and retains the directory cache', async () => {
  const files = await seedFile();
  downloadRequest('https://d0.cldisk.com/fixture.pdf', 403);
  await expect(importChaoxingFile('1:2', '', 'd1')).rejects.toThrow('下载失败（403）');
  expect(getChaoxingFiles('1:2')).toEqual(files);
});
it('does not replace or remove an existing note when file creation is refused', async () => {
  await seedFile();
  const folder = join(directory, 'workspace', '学习通资料', '示例课程');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, '示例.pdf');
  writeFileSync(file, 'original');
  downloadRequest();
  await expect(importChaoxingFile('1:2', '', 'd1')).rejects.toThrow();
  expect(readFileSync(file, 'utf8')).toBe('original');
});

it('aggregates only cached course works, without reading a school page or exposing signed routes', async () => {
  await seedCourse();
  db.prepare('INSERT INTO jlu_platform_cache VALUES (?, ?)').run(
    'cx:works:1:2',
    JSON.stringify({
      courseId: '1:2',
      syncedAt: '2026-10-31T00:00:00Z',
      items: [{ id: 'w', title: '报告', status: '未交', timing: '截止时间：2026-11-02 23:59' }],
    }),
  );
  reader.mockClear();
  expect(getChaoxingCalendar().works[0]).toMatchObject({
    courseId: '1:2',
    deadline: { date: '2026-11-02', time: '23:59' },
  });
  expect(JSON.stringify(getChaoxingCalendar())).not.toContain('private');
  expect(reader).not.toHaveBeenCalled();
});
it('continues after a course network failure, stops on authentication, and preserves previous snapshots', async () => {
  const courses = ['1', '2', '3'].map((key) => ({
    id: key,
    name: '课程' + key,
    teacher: '',
    ended: false,
    url: 'https://mooc1.chaoxing.com/mycourse/stu?courseid=' + key,
  }));
  db.prepare('INSERT INTO jlu_platform_cache VALUES (?, ?)').run(
    'cx:works:1',
    JSON.stringify({
      courseId: '1',
      syncedAt: '2026-10-30T00:00:00Z',
      items: [{ id: 'w', title: '旧作业', status: '未交', timing: '剩余2天' }],
    }),
  );
  reader
    .mockResolvedValueOnce({ url: 'https://mooc2-ans.chaoxing.com/visit/interaction' })
    .mockResolvedValueOnce(courses)
    .mockRejectedValueOnce(new Error('网络超时'))
    .mockRejectedValueOnce(new Error('需要登录', { cause: 'auth' }));
  const result = await syncChaoxingCalendar();
  expect(result.failures).toEqual([
    { courseId: '1', error: '网络超时', reason: undefined },
    { courseId: '2', error: '需要登录', reason: 'auth' },
  ]);
  expect(result.data.works).toEqual([expect.objectContaining({ title: '旧作业' })]);
  expect(reader).toHaveBeenCalledTimes(4);
});
