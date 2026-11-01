import Database from 'better-sqlite3';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
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
vi.mock('../../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage')>();
  return { ...actual, availablePath: vi.fn(actual.availablePath) };
});
import { availablePath } from '../../storage';
import { readSchoolPage } from '../../jlu/reader';
import {
  cachedWorkEntry,
  saveWorkTiming,
  getChaoxingCourses,
  getChaoxingCalendar,
  syncChaoxingCalendar,
  getChaoxingFiles,
  getChaoxingWorks,
  syncChaoxingCourses,
  syncChaoxingFiles,
  syncChaoxingWorks,
  importChaoxingFile,
  bindChaoxingCourse,
  linkChaoxingFile,
  chaoxingResult,
} from '../api';
const reader = vi.mocked(readSchoolPage);
beforeEach(() => {
  vi.clearAllMocks();
  db = new Database(':memory:');
  db.exec('CREATE TABLE jlu_platform_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL)');
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'dela-cx-api-')));
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
    .mockResolvedValueOnce([
      {
        id: 'w1',
        title: '示例作业',
        status: '未交',
        timing: '剩余2天',
        url: 'https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?workId=w1&enc=private',
      },
    ]);
  const works = await syncChaoxingWorks('1:2');
  expect(getChaoxingWorks('1:2')).toEqual(works);
  expect(JSON.stringify(works)).not.toContain('private');
  expect(cachedWorkEntry('1:2', 'w1')).toMatchObject({
    exact: true,
    url: expect.stringContaining('enc=private'),
  });
  const plaintext = db
    .prepare("SELECT data FROM jlu_platform_cache WHERE key='cx:works:1:2'")
    .get() as { data: string };
  expect(plaintext.data).not.toMatch(/enc=|https:/);
  expect(saveWorkTiming('1:2', 'w1', '剩余2天')).toBe(false);
  expect(saveWorkTiming('1:2', 'missing', '截止时间：2026-11-02 20:00')).toBe(false);

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
  const folder = join(directory, 'workspace', '学习通资料', '示例课程 (1_2)');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, '示例.pdf');
  writeFileSync(file, 'original');
  vi.mocked(availablePath).mockReturnValueOnce(file);
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

it('retains a detail deadline across relative list refreshes, but lets newer explicit list dates replace it', async () => {
  await seedCourse();
  let first = true;
  const refresh = async (timing: string) => {
    if (first) reader.mockResolvedValueOnce({ url: 'https://mooc1.chaoxing.com/course' });
    first = false;
    reader.mockResolvedValueOnce({ url: 'https://mooc1.chaoxing.com/list' }).mockResolvedValueOnce([
      {
        id: 'w1',
        title: '报告',
        status: '未交',
        timing,
        url: 'https://mooc1.chaoxing.com/task?workId=w1&enc=private',
      },
    ]);
    return syncChaoxingWorks('1:2');
  };
  await refresh('剩余2天');
  expect(saveWorkTiming('1:2', 'w1', '截止时间：2026-11-02 20:00')).toBe(true);
  await refresh('剩余1天');
  expect(getChaoxingCalendar().works[0]?.deadline).toEqual({ date: '2026-11-02', time: '20:00' });
  expect(getChaoxingWorks('1:2')?.items[0]?.detailSyncedAt).toBeTruthy();
  await refresh('截止时间：2026-11-04 21:00');
  expect(getChaoxingCalendar().works[0]?.deadline).toEqual({ date: '2026-11-04', time: '21:00' });
  expect(getChaoxingWorks('1:2')?.items[0]?.detailSyncedAt).toBeUndefined();
});

function localCourse() {
  db.exec(
    'CREATE TABLE knowledge_roots(id TEXT PRIMARY KEY,path TEXT); CREATE TABLE knowledge_courses(id TEXT PRIMARY KEY,root_id TEXT,name TEXT,relative_path TEXT)',
  );
  const id = crypto.randomUUID(),
    rootId = crypto.randomUUID();
  const root = join(directory, '本地知识库'),
    path = join(root, '计算机网络');
  mkdirSync(path, { recursive: true });
  db.prepare('INSERT INTO knowledge_roots VALUES (?,?)').run(rootId, root);
  db.prepare('INSERT INTO knowledge_courses VALUES (?,?,?,?)').run(
    id,
    rootId,
    '计算机网络',
    '计算机网络',
  );
  return { id, path };
}
it('binds courses explicitly and opens an associated file without downloading it again', async () => {
  await seedFile();
  const course = localCourse();
  const file = join(course.path, '已有课件.pdf');
  writeFileSync(file, 'existing local notes');
  expect(bindChaoxingCourse('1:2', course.id)).toMatchObject({ knowledgeCourseId: course.id });
  linkChaoxingFile('1:2', '', 'd1', file);
  expect(getChaoxingFiles('1:2')?.items[0]?.local).toMatchObject({
    origin: 'linked',
    status: 'ready',
  });
  expect(await importChaoxingFile('1:2', '', 'd1')).toEqual({
    id: expect.stringContaining('已有课件.pdf'),
  });
  expect(mocks.request).not.toHaveBeenCalled();
  writeFileSync(file, 'edited locally');
  expect(getChaoxingFiles('1:2')?.items[0]?.local?.status).toBe('local-changed');
  expect(bindChaoxingCourse('1:2', null)).toBeNull();
  expect(readFileSync(file, 'utf8')).toBe('edited locally');
  unlinkSync(file);
  expect(getChaoxingFiles('1:2')?.items[0]?.local?.status).toBe('missing');
});
it('preserves the remote folder hierarchy when importing into a linked course', async () => {
  await seedFile();
  const course = localCourse();
  bindChaoxingCourse('1:2', course.id);
  const root = getChaoxingFiles('1:2')!;
  db.prepare('UPDATE jlu_platform_cache SET data=? WHERE key=?').run(
    JSON.stringify({
      ...root,
      items: [
        {
          id: 'folder1',
          name: '课件PPT',
          type: 'afolder',
          size: '',
          creator: '',
          date: '',
          downloadable: false,
        },
      ],
    }),
    'cx:files:1:2:',
  );
  const routes = JSON.parse(
    Buffer.from(
      JSON.parse(
        (
          db.prepare("SELECT data FROM jlu_platform_cache WHERE key='cx:routes'").get() as {
            data: string;
          }
        ).data,
      ),
      'base64',
    )
      .toString()
      .slice(7),
  );
  routes['folder:1:2:folder1'] =
    'https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?folder=1';
  db.prepare('UPDATE jlu_platform_cache SET data=? WHERE key=?').run(
    JSON.stringify(Buffer.from('sealed:' + JSON.stringify(routes)).toString('base64')),
    'cx:routes',
  );
  reader.mockResolvedValueOnce([
    {
      ...root.items[0],
      folderUrl: null,
      downloadUrl: 'https://mooc1.chaoxing.com/coursedata/downloadData?dataId=d1',
    },
  ]);
  expect((await syncChaoxingFiles('1:2', 'folder1')).relativePath).toEqual(['课件PPT']);
  downloadRequest();
  const result = await importChaoxingFile('1:2', 'folder1', 'd1');
  expect(result.id).toBe(join(course.path, '课件PPT', '示例.pdf'));
  expect((await importChaoxingFile('1:2', 'folder1', 'd1')).id).toBe(result.id);
  expect(mocks.request).toHaveBeenCalledOnce();
  const snapshot = getChaoxingFiles('1:2', 'folder1')!;
  db.prepare('UPDATE jlu_platform_cache SET data=? WHERE key=?').run(
    JSON.stringify({
      ...snapshot,
      items: snapshot.items.map((file) => ({ ...file, date: '11-02' })),
    }),
    'cx:files:1:2:folder1',
  );
  expect(getChaoxingFiles('1:2', 'folder1')?.items[0]?.local?.status).toBe('remote-changed');
  downloadRequest();
  const updated = await importChaoxingFile('1:2', 'folder1', 'd1');
  expect(updated.id).not.toBe(result.id);
  expect(readFileSync(updated.id, 'utf8')).toBe('%PDF-fixture');
  expect(readFileSync(result.id, 'utf8')).toBe('%PDF-fixture');
});
it('refuses linking files outside the bound course, including symlink targets', async () => {
  await seedFile();
  const course = localCourse();
  bindChaoxingCourse('1:2', course.id);
  const outside = join(directory, 'outside.pdf');
  writeFileSync(outside, 'private');
  expect(() => linkChaoxingFile('1:2', '', 'd1', outside)).toThrow('课程目录');
  if (process.platform !== 'win32') {
    const linked = join(course.path, 'linked.pdf');
    symlinkSync(outside, linked);
    expect(() => linkChaoxingFile('1:2', '', 'd1', linked)).toThrow('课程目录');
  }
});
