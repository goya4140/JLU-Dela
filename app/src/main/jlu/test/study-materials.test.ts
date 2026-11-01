import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let db: Database.Database, root: string;
const workspaceRoot = () => (root = realpathSync.native(mkdtempSync(join(tmpdir(), 'study-mat-'))));
let folderSeq = 0;
vi.mock('../../database', () => ({ getDatabase: () => db }));
vi.mock('../api', () => ({
  getRecordings: () => ({
    courseId: 'c1',
    items: [{ id: 'r1', name: '第一讲', date: '2026-10-30', time: '', room: '', status: '' }],
    syncedAt: '2026-10-30T00:00:00.000Z',
  }),
}));
// 工作区以内存条目树代替：只验证课件登记与复制行为，不依赖真实条目表。
const entries: { id: string; parentId: string | null; kind: string; name: string }[] = [];
vi.mock('../../workspace/api', () => ({
  getWorkspaceState: () => ({ entries }),
  createWorkspaceEntry: (input: { parentId: string | null; kind: string; name: string }) => {
    const entry = { id: `e${++folderSeq}`, ...input };
    entries.push(entry);
    return entry;
  },
  importWorkspaceFiles: (parentId: string | null, paths: string[]) =>
    paths.map((path) => {
      const entry = {
        id: `f${++folderSeq}`,
        parentId,
        kind: 'file',
        name: path.split(/[\\/]/).pop()!,
      };
      entries.push(entry);
      return entry;
    }),
}));
import { importStudyMaterials, removeStudyMaterial, studyMaterials } from '../study-materials';
beforeEach(() => {
  workspaceRoot();
  entries.length = 0;
  db = new Database(':memory:');
  db.exec('CREATE TABLE jlu_platform_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL)');
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
it('registers imported slides in a per-recording workspace folder and keeps duplicates', () => {
  const slides = join(root, '第 3 讲 传输层.pptx');
  writeFileSync(slides, 'pptx');

  expect(studyMaterials('c1', 'r1')).toEqual([]);
  const first = importStudyMaterials('c1', 'r1', [slides]);
  expect(first).toHaveLength(1);
  expect(first[0]?.name).toBe('第 3 讲 传输层.pptx');
  expect(entries.some((entry) => entry.name === '课堂课件')).toBe(true);
  expect(entries.some((entry) => entry.name.startsWith('第一讲-r1'))).toBe(true);
  expect(readFileSync(slides, 'utf8')).toBe('pptx');

  const second = importStudyMaterials('c1', 'r1', [slides]);
  expect(second).toHaveLength(2);
  // 另一场录像各自一份登记，互不影响。
  expect(studyMaterials('c1', 'r2')).toEqual([]);
});

it('rejects unsupported or missing files before touching the workspace', () => {
  const text = join(root, '讲义.txt');
  writeFileSync(text, 'text');
  expect(() => importStudyMaterials('c1', 'r1', [text])).toThrow('只支持');
  expect(() => importStudyMaterials('c1', 'r1', [join(root, '不存在.pptx')])).toThrow(
    '课件文件已不存在',
  );
  expect(entries).toEqual([]);
  expect(studyMaterials('c1', 'r1')).toEqual([]);
});

it('removes only the registration so the workspace copy stays readable', () => {
  const slides = join(root, '课件.pdf');
  writeFileSync(slides, 'pdf');
  const [material] = importStudyMaterials('c1', 'r1', [slides]);
  expect(removeStudyMaterial('c1', 'r1', material!.entryId)).toEqual([]);
  expect(studyMaterials('c1', 'r1')).toEqual([]);
  expect(entries.some((entry) => entry.id === material!.entryId)).toBe(true);
});

it('treats a corrupted cache row as empty instead of failing the study view', () => {
  db.prepare('INSERT INTO jlu_platform_cache(key,data) VALUES (?,?)').run(
    'study-materials:c1:r1',
    '{not-json',
  );
  expect(studyMaterials('c1', 'r1')).toEqual([]);
});
