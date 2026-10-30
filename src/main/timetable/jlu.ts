import { z } from 'zod';
import { CampusAuthError, campusRequest, getCampusSession } from '../campus';

export const JLU_TIMETABLE_URL = 'https://iedu.jlu.edu.cn/jwapp/sys/wdkb/*default/index.do';
const origin = 'https://iedu.jlu.edu.cn';
const root = '/jwapp/sys/wdkb/modules/';
const text = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => String(value ?? '').trim());
const integer = z.coerce.number().int().positive();
const weekMask = text.pipe(z.string().regex(/^[01]{1,64}$/));
const lessonSchema = z
  .object({
    KBID: text,
    JXBID: text,
    KCH: text,
    KCM: text.pipe(z.string().min(1)),
    SKJS: text,
    JASMC: text,
    JXBMC: text,
    XXXQ: text,
    XXXQDM: text,
    XXXQDM_DISPLAY: text,
    XXXQMC: text,
    XF: text,
    SKXQ: integer.max(7),
    KSJC: integer.max(30),
    JSJC: integer.max(30),
    SKZC: weekMask,
  })
  .refine((row) => row.JSJC >= row.KSJC);
const periodSchema = z.object({
  DM: integer.max(30),
  KSSJ: text,
  JSSJ: text,
  SFSY: text,
  XXXQ: text,
});
const changeSchema = z.object({
  KBID: text.pipe(z.string().min(1)),
  SKZC: weekMask,
  XSKZC: text,
  XSKXQ: text,
  XKSJC: text,
  XJSJC: text,
  XJASMC: text,
  JASMC: text,
  XSKJS: text,
  YSKJS: text,
});

export function parseEmapRows(payload: unknown, key: string): unknown[] {
  const result = z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      datas: z.record(z.string(), z.unknown()),
    })
    .safeParse(payload);
  if (
    !result.success ||
    (result.data.code !== undefined && !['0', '200'].includes(String(result.data.code)))
  )
    throw new Error(`吉大教务响应结构无法识别（${key}），本地课表未更新`);
  const block = z
    .object({
      rows: z.array(z.unknown()),
      // 吉大未分页查询以 -1 表示未统计总数，rows 仍是有效数据。
      totalSize: z.coerce.number().int().min(-1).optional(),
      pageSize: z.coerce.number().int().nonnegative().optional(),
    })
    .safeParse(result.data.datas[key]);
  if (!block.success) throw new Error(`吉大教务响应缺少有效课表数据（${key}），本地课表未更新`);
  if (block.data.totalSize !== undefined && block.data.totalSize > block.data.rows.length)
    throw new Error('吉大教务返回的数据不完整，本地课表未更新');
  if (
    (block.data.totalSize === undefined || block.data.totalSize === -1) &&
    block.data.pageSize &&
    block.data.rows.length >= block.data.pageSize
  )
    throw new Error('吉大教务返回了未统计总数的分页数据，本地课表未更新');
  return block.data.rows;
}

async function post(
  path: string,
  key: string,
  values: Record<string, string> = {},
): Promise<unknown[]> {
  const body = await campusRequest(await getCampusSession(), `${origin}${root}${path}`, {
    service: '吉大教务',
    loginError: '教务登录已失效，请重新登录',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      Origin: origin,
      Referer: JLU_TIMETABLE_URL,
    },
    body: new URLSearchParams(values).toString(),
  });
  if (/loginForm|tpass\/login|统一身份认证/i.test(body))
    throw new CampusAuthError('教务登录已失效，请重新登录');
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('吉大教务没有返回课表数据，请检查校园网或学校 VPN 后重试');
  }
  return parseEmapRows(payload, key);
}

export async function currentJluSemester(): Promise<string> {
  const rows = await post('jshkcb/dqxnxq.do', 'dqxnxq');
  const parsed = z.object({ DM: z.string().regex(/^\d{4}-\d{4}-[123]$/) }).safeParse(rows[0]);
  if (!parsed.success) throw new Error('教务当前学期格式无法识别，本地课表未更新');
  return parsed.data.DM;
}

export async function probeJluTimetable(): Promise<void> {
  const semester = await currentJluSemester();
  await post('xskcb/cxxszhxqkb.do', 'cxxszhxqkb', { XNXQDM: semester });
}

export function jluWeekNumbers(value: string): number[] {
  if (!/^[01]{1,64}$/.test(value)) throw new Error('教务课表的教学周格式无法识别');
  return Array.from(value).flatMap((bit, index) => (bit === '1' ? [index + 1] : []));
}

function minute(value: string): number {
  const matched = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value) ?? /^(\d{1,2})(\d{2})$/.exec(value);
  if (!matched || Number(matched[1]) > 23 || Number(matched[2]) > 59)
    throw new Error('教务节次时间无法识别，本地课表未更新');
  return Number(matched[1]) * 60 + Number(matched[2]);
}

function teacher(value: string): string | null {
  return (
    value
      .split(/[,，]/)
      .map((part) => part.split('/')[0]!.trim())
      .filter(Boolean)
      .join('、') || null
  );
}

export interface JluLesson {
  sourceId: string;
  courseCode: string;
  courseName: string;
  className: string | null;
  teacher: string | null;
  campus: string | null;
  classroom: string | null;
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  periodsText: string;
  weeksText: string;
  weekNumbers: number[];
  credits: number | null;
  note: string | null;
  startMinute: number;
  endMinute: number;
}

function periodTimes(
  periods: { period: number; campus: string; start: number; end: number }[],
  campus: string,
  startPeriod: number,
  endPeriod: number,
) {
  const matched = periods.filter((period) => period.campus === campus);
  const candidates = matched.length ? matched : periods;
  const starts = new Set(
    candidates.filter((row) => row.period === startPeriod).map((row) => row.start),
  );
  const ends = new Set(candidates.filter((row) => row.period === endPeriod).map((row) => row.end));
  if (starts.size !== 1 || ends.size !== 1)
    throw new Error('课程的校区节次时间不明确，本地课表未更新');
  const startMinute = [...starts][0]!;
  const endMinute = [...ends][0]!;
  if (endMinute <= startMinute) throw new Error('课程的上课时间无效，本地课表未更新');
  return { startMinute, endMinute };
}

export function normalizeJluTimetable(input: {
  courses: unknown[];
  periods: unknown[];
  calendar: unknown[];
  changes: unknown[];
  unscheduled: unknown[];
}) {
  const courses = z.array(lessonSchema).safeParse(input.courses);
  const periods = z.array(periodSchema).safeParse(input.periods);
  const calendar = z.array(z.object({ XQKSRQ: text, ZZC: text })).safeParse(input.calendar);
  const changes = z.array(changeSchema).safeParse(input.changes);
  if (!courses.success || !periods.success || !calendar.success || !changes.success)
    throw new Error('吉大课表字段与预期不一致，本地课表未更新');
  const start = calendar.data[0]?.XQKSRQ.slice(0, 10) ?? '';
  const date = new Date(`${start}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== start
  )
    throw new Error('吉大教务校历缺少有效的开学日期，本地课表未更新');
  const availablePeriods = periods.data
    .filter((row) => !['0', '否', 'false'].includes(row.SFSY))
    .map((row) => ({
      period: row.DM,
      campus: row.XXXQ,
      start: minute(row.KSSJ),
      end: minute(row.JSSJ),
    }));
  if (!availablePeriods.length || availablePeriods.some((row) => row.end <= row.start))
    throw new Error('吉大教务没有有效节次时间，本地课表未更新');
  const warnings: string[] = [];
  if (input.unscheduled.length)
    warnings.push(`教务另有 ${input.unscheduled.length} 条未排定时间的课程，未计入日历`);
  const lessons = courses.data.map((row, index) => {
    const campus = row.XXXQDM || row.XXXQ;
    const { startMinute, endMinute } = periodTimes(availablePeriods, campus, row.KSJC, row.JSJC);
    const credits = row.XF ? Number(row.XF) : null;
    return {
      kbId: row.KBID,
      campusCode: campus,
      sourceId: `${row.KBID || row.JXBID || row.KCH || row.KCM}:${index}`,
      courseCode: row.KCH,
      courseName: row.KCM,
      className: row.JXBMC || null,
      teacher: teacher(row.SKJS),
      campus: row.XXXQDM_DISPLAY || row.XXXQMC || null,
      classroom: row.JASMC || null,
      weekday: row.SKXQ,
      startPeriod: row.KSJC,
      endPeriod: row.JSJC,
      periodsText: `${row.KSJC}–${row.JSJC}节`,
      weeksText: '',
      weekNumbers: jluWeekNumbers(row.SKZC),
      credits: Number.isFinite(credits) ? credits : null,
      note: null as string | null,
      startMinute,
      endMinute,
    };
  });
  for (const [index, change] of [...changes.data].reverse().entries()) {
    const affected = lessons.filter((lesson) => lesson.kbId === change.KBID);
    if (!affected.length) {
      warnings.push('有调停课记录未匹配到原课程，请对照教务原课表核查');
      continue;
    }
    const movedWeeks = jluWeekNumbers(change.SKZC);
    const hasNewTime = [change.XSKZC, change.XSKXQ, change.XKSJC, change.XJSJC].some(Boolean);
    const first = affected[0]!;
    if (hasNewTime) {
      const newTime = z
        .object({ weekday: integer.max(7), start: integer.max(30), end: integer.max(30) })
        .safeParse({
          weekday: change.XSKXQ,
          start: change.XKSJC,
          end: change.XJSJC,
        });
      if (!newTime.success || newTime.data.end < newTime.data.start || !change.XSKZC)
        throw new Error('调课记录缺少新时间，本地课表未更新');
      const { startMinute, endMinute } = periodTimes(
        availablePeriods,
        first.campusCode,
        newTime.data.start,
        newTime.data.end,
      );
      const weekNumbers = jluWeekNumbers(change.XSKZC);
      const classroom = change.XJASMC || change.JASMC || first.classroom;
      const nextTeacher = teacher(change.XSKJS) || teacher(change.YSKJS) || first.teacher;
      for (const lesson of affected)
        lesson.weekNumbers = lesson.weekNumbers.filter((week) => !movedWeeks.includes(week));
      const existing = lessons.find(
        (lesson) =>
          lesson.kbId === change.KBID &&
          lesson.weekday === newTime.data.weekday &&
          lesson.startPeriod === newTime.data.start &&
          lesson.endPeriod === newTime.data.end &&
          lesson.classroom === classroom &&
          lesson.teacher === nextTeacher,
      );
      if (existing)
        existing.weekNumbers = [...new Set([...existing.weekNumbers, ...weekNumbers])].sort(
          (a, b) => a - b,
        );
      else
        lessons.push({
          ...first,
          sourceId: `${first.sourceId}:change:${index}`,
          weekday: newTime.data.weekday,
          startPeriod: newTime.data.start,
          endPeriod: newTime.data.end,
          periodsText: `${newTime.data.start}–${newTime.data.end}节`,
          weekNumbers,
          classroom,
          teacher: nextTeacher,
          note: '教务调课',
          startMinute,
          endMinute,
        });
    } else {
      for (const lesson of affected)
        lesson.weekNumbers = lesson.weekNumbers.filter((week) => !movedWeeks.includes(week));
    }
  }
  const normalized: JluLesson[] = lessons
    .filter((lesson) => lesson.weekNumbers.length)
    .map(({ kbId: _kbId, campusCode: _campusCode, ...lesson }) => ({
      ...lesson,
      weeksText: `${lesson.weekNumbers.join('、')}周`,
    }));
  const totalWeeks = Number(calendar.data[0]?.ZZC);
  return {
    lessons: normalized,
    semesterStart: start,
    totalWeeks: Number.isInteger(totalWeeks) && totalWeeks > 0 ? totalWeeks : null,
    warnings: [...new Set(warnings)],
  };
}

export async function fetchJluTimetable(semester?: string) {
  const selected = semester ?? (await currentJluSemester());
  const [courses, periods, calendar] = await Promise.all([
    post('xskcb/cxxszhxqkb.do', 'cxxszhxqkb', { XNXQDM: selected }),
    post('jshkcb/jc.do', 'jc'),
    post('xskcb/cxxljc.do', 'cxxljc', { XN: selected.slice(0, 9), XQ: selected.split('-')[2]! }),
  ]);
  const warnings: string[] = [];
  const [changes = [], unscheduled = []] = await Promise.all(
    [
      post('xskcb/xsdkkc.do', 'xsdkkc', { XNXQDM: selected, '*order': '-SQSJ' }),
      post('xskcb/xswpkc.do', 'xswpkc', { XNXQDM: selected }),
    ].map(async (request, index) => {
      try {
        return await request;
      } catch (error) {
        if (error instanceof CampusAuthError) throw error;
        warnings.push(
          index === 0
            ? '调停课信息未获取，请对照教务原课表核查临时调整'
            : '未排定时间的课程信息未获取',
        );
        return [];
      }
    }),
  );
  const normalized = normalizeJluTimetable({ courses, periods, calendar, changes, unscheduled });
  return { ...normalized, semester: selected, warnings: [...normalized.warnings, ...warnings] };
}
