import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let database: Database.Database;
vi.mock('../../database', () => ({ getDatabase: () => database }));
vi.mock('../../campus', () => ({
  CampusAuthError: class CampusAuthError extends Error {},
  flushCampusSession: vi.fn(async () => {}),
  openCampusLoginWindow: vi.fn(),
}));
vi.mock('../jlu', () => ({
  fetchJluTimetable: vi.fn(),
  probeJluTimetable: vi.fn(),
  JLU_TIMETABLE_URL: 'https://iedu.jlu.edu.cn/jwapp/sys/wdkb/*default/index.do',
}));
import { CampusAuthError, flushCampusSession } from '../../campus';
import { fetchJluTimetable } from '../jlu';
import { getTimetableState, listLessons, querySchedule, syncTimetable } from '../api';

const lesson = {
  sourceId: 'test:1',
  courseCode: 'TEST',
  courseName: '示例课程',
  className: null,
  teacher: '教师甲',
  campus: null,
  classroom: '示例教室',
  weekday: 1,
  startPeriod: 1,
  endPeriod: 2,
  startMinute: 550,
  endMinute: 650,
  periodsText: '1–2节',
  weeksText: '1、3周',
  weekNumbers: [1, 3],
  credits: null,
  note: null,
};
const snapshot = () => ({
  semester: '2026-2027-1',
  semesterStart: '2026-09-14',
  totalWeeks: 20,
  warnings: [] as string[],
  lessons: [{ ...lesson }],
});
const fetchTimetable = vi.mocked(fetchJluTimetable);
beforeEach(() => {
  vi.clearAllMocks();
  database = new Database(':memory:');
  database.exec(`
    CREATE TABLE workspace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE timetable_sync (semester TEXT PRIMARY KEY, last_synced_at TEXT NOT NULL, semester_start TEXT);
    CREATE TABLE timetable_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT, semester TEXT NOT NULL, source_id TEXT NOT NULL,
      course_code TEXT NOT NULL, course_name TEXT NOT NULL, class_name TEXT, teacher TEXT,
      campus TEXT, classroom TEXT, weekday INTEGER NOT NULL, start_period INTEGER NOT NULL,
      end_period INTEGER NOT NULL, periods_text TEXT NOT NULL, weeks_text TEXT NOT NULL,
      week_numbers TEXT NOT NULL, credits REAL, note TEXT
    );
    CREATE TABLE calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, start_at TEXT, end_at TEXT, location TEXT, color TEXT);
  `);
  fetchTimetable.mockResolvedValue(snapshot());
});
afterEach(() => database.close());

it('stores the timetable and clock times together and uses them for Agent dates', async () => {
  expect(await syncTimetable()).toEqual({ ok: true });
  expect(fetchTimetable).toHaveBeenCalledWith(undefined);
  expect(getTimetableState()).toMatchObject({
    semester: '2026-2027-1',
    semesterStart: '2026-09-14',
    totalWeeks: 20,
  });
  expect(listLessons('2026-2027-1')[0]).toMatchObject({
    courseName: '示例课程',
    startMinute: 550,
    endMinute: 650,
  });
  const result = querySchedule({ startAt: '2026-09-13T16:00:00Z', endAt: '2026-09-14T16:00:00Z' });
  expect(result.items[0]).toMatchObject({
    startAt: '2026-09-14T01:10:00.000Z',
    endAt: '2026-09-14T02:50:00.000Z',
  });
  expect(result.coverage.complete).toBe(true);
});

it('does not replace the official current semester when syncing historical data', async () => {
  await syncTimetable();
  fetchTimetable.mockResolvedValueOnce({ ...snapshot(), semester: '2025-2026-2' });
  expect(await syncTimetable('2025-2026-2')).toEqual({ ok: true });
  expect(getTimetableState().semester).toBe('2026-2027-1');
  expect(listLessons('2025-2026-2')).toHaveLength(1);
});

it('keeps cached rows and synchronization time when authentication or transport fails', async () => {
  await syncTimetable();
  const before = getTimetableState();
  const lessons = listLessons('2026-2027-1');
  fetchTimetable.mockRejectedValueOnce(new CampusAuthError('教务登录已失效'));
  expect(await syncTimetable()).toMatchObject({ ok: false, reason: 'auth' });
  expect(getTimetableState()).toEqual(before);
  expect(listLessons('2026-2027-1')).toEqual(lessons);
  fetchTimetable.mockRejectedValueOnce(new Error('课表字段不完整'));
  expect(await syncTimetable()).toMatchObject({ ok: false });
  expect(listLessons('2026-2027-1')).toEqual(lessons);
});

it('does not replace the cache if session persistence fails', async () => {
  await syncTimetable();
  const before = getTimetableState();
  vi.mocked(flushCampusSession).mockRejectedValueOnce(new Error('会话保存失败'));
  fetchTimetable.mockResolvedValueOnce({ ...snapshot(), lessons: [] });
  expect(await syncTimetable()).toMatchObject({ ok: false, error: '会话保存失败' });
  expect(getTimetableState()).toEqual(before);
  expect(listLessons('2026-2027-1')).toHaveLength(1);
});

it('rolls back deletion, inserts and metadata if any row fails to save', async () => {
  await syncTimetable();
  const before = getTimetableState();
  database.exec(
    `CREATE TRIGGER reject_lesson BEFORE INSERT ON timetable_lessons WHEN NEW.course_name = 'reject' BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
  );
  fetchTimetable.mockResolvedValueOnce({
    ...snapshot(),
    lessons: [
      { ...lesson, startMinute: 600 },
      { ...lesson, sourceId: 'test:2', courseName: 'reject' },
    ],
  });
  expect(await syncTimetable()).toMatchObject({ ok: false });
  expect(getTimetableState()).toEqual(before);
  expect(listLessons('2026-2027-1')).toMatchObject([{ courseName: '示例课程', startMinute: 550 }]);
});

it('stores a valid empty response and exposes missing adjustment coverage', async () => {
  await syncTimetable();
  fetchTimetable.mockResolvedValueOnce({
    ...snapshot(),
    lessons: [],
    warnings: ['调停课信息未获取'],
  });
  expect(await syncTimetable()).toEqual({ ok: true });
  expect(listLessons('2026-2027-1')).toEqual([]);
  expect(getTimetableState().lastSyncedAt).not.toBeNull();
  const result = querySchedule({ startAt: '2026-09-13T16:00:00Z', endAt: '2026-09-14T16:00:00Z' });
  expect(result.coverage).toMatchObject({ complete: false, warnings: ['调停课信息未获取'] });
});
