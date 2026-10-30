import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
let db: Database.Database, directory: string;
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('electron', () => ({
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
      return { ok: false, error: (error as Error).message };
    }
  },
}));
vi.mock('../session', () => ({
  chaoxingSession: {
    partition: 'persist:chaoxing',
    get: async () => ({ fetch: mocks.fetch }),
    flush: async () => {},
  },
  isChaoxingLoginUrl: () => false,
}));
vi.mock('../../workspace/api', () => ({ getWorkspaceState: () => ({ directory }) }));
vi.mock('../../storage', () => ({ availablePath: (dir: string, name: string) => join(dir, name) }));
import { readSchoolPage } from '../../jlu/reader';
import {
  getChaoxingCourses,
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
it('imports an allowed file inside the workspace and refuses non-school redirect destinations', async () => {
  await seedFile();
  mocks.fetch.mockResolvedValueOnce(
    new Response('%PDF-fixture', { headers: { 'content-type': 'application/pdf' } }),
  );
  const result = await importChaoxingFile('1:2', '', 'd1');
  expect(result.id.startsWith(directory)).toBe(true);
  expect(readFileSync(result.id, 'utf8')).toBe('%PDF-fixture');
  mocks.fetch.mockResolvedValueOnce(
    new Response(null, { status: 302, headers: { location: 'https://example.com/private' } }),
  );
  await expect(importChaoxingFile('1:2', '', 'd1')).rejects.toThrow();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it('does not replace or remove an existing note when file creation is refused', async () => {
  await seedFile();
  const folder = join(directory, '学习通资料', '示例课程');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, '示例.pdf');
  writeFileSync(file, 'original');
  mocks.fetch.mockResolvedValueOnce(
    new Response('new', { headers: { 'content-type': 'application/pdf' } }),
  );
  await expect(importChaoxingFile('1:2', '', 'd1')).rejects.toThrow();
  expect(readFileSync(file, 'utf8')).toBe('original');
});
