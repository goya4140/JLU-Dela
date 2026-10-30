import type { WebContents } from 'electron';
import { z } from 'zod';
import {
  calendarEventColors,
  type CalendarEvent,
  type TimetableLesson,
  type TimetableResult,
  type TimetableState,
} from '../../shared/api';
import { getDatabase } from '../database';
import { lessonOccurrences } from '../../shared/schedule';
import { CampusAuthError, flushCampusSession, openCampusLoginWindow } from '../campus';
import { readSetting, writeSetting } from '../settings/prefs';
import { fetchJluTimetable, JLU_TIMETABLE_URL, probeJluTimetable } from './jlu';

const semesterSchema = z.string().regex(/^\d{4}-\d{4}-[123]$/);
const dateTimeSchema = z.string().datetime();
const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
    location: z.string().trim().max(120).optional(),
    color: z.enum(calendarEventColors).optional(),
  })
  .refine(
    (event) => new Date(event.endAt).getTime() > new Date(event.startAt).getTime(),
    '结束时间必须晚于开始时间',
  );
const metadataSchema = z.object({
  times: z.record(
    z.string(),
    z.object({
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
    }),
  ),
  warnings: z.array(z.string()),
  totalWeeks: z.number().int().positive().nullable(),
});

function metadata(semester: string): z.infer<typeof metadataSchema> {
  try {
    return metadataSchema.parse(JSON.parse(readSetting(`jlu-timetable:${semester}`) ?? ''));
  } catch {
    return { times: {}, warnings: [], totalWeeks: null };
  }
}

type LessonRow = {
  id: number;
  semester: string;
  source_id: string;
  course_code: string;
  course_name: string;
  class_name: string | null;
  teacher: string | null;
  campus: string | null;
  classroom: string | null;
  weekday: number;
  start_period: number;
  end_period: number;
  periods_text: string;
  weeks_text: string;
  week_numbers: string;
  credits: number | null;
  note: string | null;
};

type CalendarEventRow = {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  color: string | null;
};

function mapEvent(row: CalendarEventRow): CalendarEvent {
  const stored = row.color;
  return {
    id: row.id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location,
    // 旧缓存或异常值回退为无色，渲染时按中性色处理。
    color:
      stored && (calendarEventColors as readonly string[]).includes(stored)
        ? (stored as CalendarEvent['color'])
        : null,
  };
}

export function currentSemester(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}-1`;
  if (month <= 2) return `${year - 1}-${year}-1`;
  return `${year - 1}-${year}-2`;
}

export function resolveSemester(requested: unknown): string {
  return requested === undefined
    ? semesterSchema.catch(currentSemester()).parse(readSetting('jlu-current-semester'))
    : semesterSchema.parse(requested);
}

function syncRow(
  semester: string,
): { last_synced_at: string; semester_start: string | null } | undefined {
  return getDatabase()
    .prepare('SELECT last_synced_at, semester_start FROM timetable_sync WHERE semester = ?')
    .get(semester) as { last_synced_at: string; semester_start: string | null } | undefined;
}

function mapRow(row: LessonRow, times: z.infer<typeof metadataSchema>['times']): TimetableLesson {
  let weekNumbers: number[] = [];
  try {
    const parsed: unknown = JSON.parse(row.week_numbers);
    if (Array.isArray(parsed))
      weekNumbers = parsed.filter((week): week is number => Number.isInteger(week));
  } catch {
    // Keep the cached lesson visible even if a future schema changes the stored value.
  }
  return {
    id: row.id,
    semester: row.semester,
    courseCode: row.course_code,
    courseName: row.course_name,
    className: row.class_name,
    teacher: row.teacher,
    campus: row.campus,
    classroom: row.classroom,
    weekday: row.weekday,
    startPeriod: row.start_period,
    endPeriod: row.end_period,
    startMinute: times[row.source_id]?.startMinute ?? null,
    endMinute: times[row.source_id]?.endMinute ?? null,
    periodsText: row.periods_text,
    weeksText: row.weeks_text,
    weekNumbers,
    credits: row.credits,
    note: row.note,
  };
}

export function openLoginWindow(sender: WebContents): Promise<TimetableResult> {
  return openCampusLoginWindow({
    sender,
    title: '登录吉林大学教务系统',
    url: JLU_TIMETABLE_URL,
    reached: (url) => {
      const reached = new URL(url);
      return (
        reached.origin === 'https://iedu.jlu.edu.cn' &&
        reached.pathname.startsWith('/jwapp/sys/wdkb/')
      );
    },
    retryProbe: (error) =>
      error instanceof CampusAuthError || (error instanceof Error && error.cause === 'transient'),
    probe: async () => {
      await probeJluTimetable();
      await flushCampusSession();
    },
  });
}

export async function syncTimetable(requested?: unknown): Promise<TimetableResult> {
  try {
    const data = await fetchJluTimetable(
      requested === undefined ? undefined : resolveSemester(requested),
    );
    await flushCampusSession();
    const db = getDatabase();
    const insert = db.prepare(
      `INSERT INTO timetable_lessons
       (semester, source_id, course_code, course_name, class_name, teacher, campus, classroom,
        weekday, start_period, end_period, periods_text, weeks_text, week_numbers, credits, note)
       VALUES (@semester, @sourceId, @courseCode, @courseName, @className, @teacher, @campus,
        @classroom, @weekday, @startPeriod, @endPeriod, @periodsText, @weeksText, @weekNumbers,
        @credits, @note)`,
    );
    const syncedAt = new Date().toISOString();
    db.transaction(() => {
      db.prepare('DELETE FROM timetable_lessons WHERE semester = ?').run(data.semester);
      for (const lesson of data.lessons)
        insert.run({
          ...lesson,
          semester: data.semester,
          weekNumbers: JSON.stringify(lesson.weekNumbers),
        });
      db.prepare(
        `INSERT INTO timetable_sync (semester, last_synced_at, semester_start) VALUES (?, ?, ?)
         ON CONFLICT(semester) DO UPDATE SET last_synced_at = excluded.last_synced_at,
         semester_start = excluded.semester_start`,
      ).run(data.semester, syncedAt, data.semesterStart);
      writeSetting(
        `jlu-timetable:${data.semester}`,
        JSON.stringify({
          times: Object.fromEntries(
            data.lessons.map((lesson) => [
              lesson.sourceId,
              { startMinute: lesson.startMinute, endMinute: lesson.endMinute },
            ]),
          ),
          warnings: data.warnings,
          totalWeeks: data.totalWeeks,
        }),
      );
      if (requested === undefined) writeSetting('jlu-current-semester', data.semester);
    })();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof CampusAuthError ? { reason: 'auth' as const } : {}),
    };
  }
}

export function listLessons(semester: string): TimetableLesson[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM timetable_lessons WHERE semester = ?
       ORDER BY weekday, start_period, course_name`,
    )
    .all(semester) as LessonRow[];
  const { times } = metadata(semester);
  return rows.map((row) => mapRow(row, times));
}

export const scheduleQuerySchema = z
  .object({
    semester: semesterSchema.optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.endAt) > Date.parse(value.startAt) &&
      Date.parse(value.endAt) - Date.parse(value.startAt) <= 366 * 86400000,
    '查询范围必须为正数且不超过一年',
  );

export function querySchedule(input: unknown) {
  const args = scheduleQuerySchema.parse(input);
  const semester = resolveSemester(args.semester);
  const row = syncRow(semester);
  const courses = lessonOccurrences(
    listLessons(semester),
    row?.semester_start ?? null,
    args.startAt,
    args.endAt,
  );
  const events = listCalendarEvents(args.startAt, args.endAt).map((event) => ({
    ...event,
    source: 'event' as const,
  }));
  const warnings = [...courses.warnings, ...metadata(semester).warnings];
  if (!row?.last_synced_at) warnings.push('该学期课表尚未同步');
  return {
    semester,
    timezone: 'Asia/Shanghai',
    items: [...courses.items, ...events].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    coverage: {
      courseSyncedAt: row?.last_synced_at || null,
      complete: warnings.length === 0,
      warnings,
    },
  };
}

export function listCalendarEvents(startValue: unknown, endValue: unknown) {
  const startAt = dateTimeSchema.parse(startValue);
  const endAt = dateTimeSchema.parse(endValue);
  return (
    getDatabase()
      .prepare(
        `SELECT id, title, start_at, end_at, location, color FROM calendar_events
         WHERE end_at > ? AND start_at < ? ORDER BY start_at`,
      )
      .all(startAt, endAt) as CalendarEventRow[]
  ).map(mapEvent);
}

export function createCalendarEvent(input: unknown) {
  const event = calendarEventSchema.parse(input);
  const result = getDatabase()
    .prepare(
      `INSERT INTO calendar_events (title, start_at, end_at, location, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.title,
      event.startAt,
      event.endAt,
      event.location || null,
      event.color || null,
      new Date().toISOString(),
    );
  return mapEvent({
    id: Number(result.lastInsertRowid),
    title: event.title,
    start_at: event.startAt,
    end_at: event.endAt,
    location: event.location || null,
    color: event.color || null,
  });
}

export function deleteCalendarEvent(id: unknown) {
  // 只删自建事件；课程在 timetable_lessons 表，不经此入口。
  const eventId = z.number().int().positive().parse(id);
  getDatabase().prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);
}

/** calendar_events 表只读视图；不存在返回 null。 */
export function getCalendarEvent(idInput: unknown): CalendarEvent | null {
  const id = z.number().int().positive().parse(idInput);
  const row = getDatabase()
    .prepare(
      'SELECT id, title, start_at, end_at, location, color FROM calendar_events WHERE id = ?',
    )
    .get(id) as CalendarEventRow | undefined;
  return row ? mapEvent(row) : null;
}

export function getTimetableState(requested?: unknown): TimetableState {
  const semester = resolveSemester(requested);
  const row = syncRow(semester);
  return {
    semester,
    lastSyncedAt: row?.last_synced_at || null,
    semesterStart: row?.semester_start ?? null,
    warnings: metadata(semester).warnings,
    totalWeeks: metadata(semester).totalWeeks,
  };
}

export function setSemesterStart(requested: unknown, value: unknown) {
  const semester = semesterSchema.parse(requested);
  // 手动补设学期日期时可能还没有同步记录，先落到空串以满足 NOT NULL。
  getDatabase()
    .prepare(
      `INSERT INTO timetable_sync (semester, last_synced_at, semester_start) VALUES (?, '', ?)
       ON CONFLICT(semester) DO UPDATE SET semester_start = excluded.semester_start`,
    )
    .run(
      semester,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(value),
    );
}
