import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../campus', () => ({
  CampusAuthError: class CampusAuthError extends Error {},
  getCampusSession: vi.fn(async () => ({ name: 'isolated-jlu-session' })),
  campusRequest: vi.fn(),
}));
import { CampusAuthError, campusRequest } from '../../campus';
import {
  currentJluSemester,
  fetchJluTimetable,
  jluWeekNumbers,
  normalizeJluTimetable,
  parseEmapRows,
} from '../jlu';

const request = vi.mocked(campusRequest);
const course = {
  KBID: 'test-course',
  JXBID: 'test-class',
  KCH: 'TEST001',
  KCM: '示例课程',
  SKJS: '教师甲/test-id,教师乙/other-id',
  JASMC: '示例教室',
  SKXQ: '1',
  KSJC: '1',
  JSJC: '2',
  SKZC: '1111',
  XF: '2',
};
const periods = [
  { DM: '1', KSSJ: '09:10', JSSJ: '09:55', SFSY: '1' },
  { DM: '2', KSSJ: '10:05', JSSJ: '10:50', SFSY: '1' },
  { DM: '3', KSSJ: '11:00', JSSJ: '11:45', SFSY: '1' },
];
const fixture = () => ({
  courses: [course],
  periods,
  calendar: [{ XQKSRQ: '2026-09-14 00:00:00', ZZC: '20' }],
  changes: [] as unknown[],
  unscheduled: [] as unknown[],
});
const envelope = (key: string, rows: unknown[]) =>
  JSON.stringify({ code: '0', datas: { [key]: { rows, totalSize: rows.length } } });
beforeEach(() => {
  request.mockReset();
});

describe('JLU EMAP normalization', () => {
  it('uses the school week mask, calendar and section times and strips teacher identifiers', () => {
    const input = fixture();
    input.courses[0] = { ...course, SKZC: '10101' };
    const result = normalizeJluTimetable(input);
    expect(result).toMatchObject({ semesterStart: '2026-09-14', totalWeeks: 20, warnings: [] });
    expect(result.lessons[0]).toMatchObject({
      courseName: '示例课程',
      teacher: '教师甲、教师乙',
      weekNumbers: [1, 3, 5],
      startMinute: 550,
      endMinute: 650,
    });
    expect(JSON.stringify(result)).not.toContain('test-id');
    expect(jluWeekNumbers('00001')).toEqual([5]);
    expect(() => jluWeekNumbers('1-5')).toThrow('格式');
  });
  it('applies a reschedule and a cancellation without keeping the original occurrence', () => {
    const input = fixture();
    input.changes = [
      { KBID: 'test-course', SKZC: '0001' },
      {
        KBID: 'test-course',
        SKZC: '0100',
        XSKZC: '0010',
        XSKXQ: '3',
        XKSJC: '3',
        XJSJC: '3',
        XJASMC: '新教室',
      },
    ];
    const result = normalizeJluTimetable(input);
    expect(result.lessons).toHaveLength(2);
    expect(result.lessons[0]?.weekNumbers).toEqual([1, 3]);
    expect(result.lessons[1]).toMatchObject({
      weekday: 3,
      weekNumbers: [3],
      classroom: '新教室',
      startMinute: 660,
      endMinute: 705,
    });
  });
  it('does not duplicate an adjusted occurrence already present in the timetable', () => {
    const input = fixture();
    input.courses.push({ ...course, SKXQ: '3', SKZC: '0010', KSJC: '3', JSJC: '3' });
    input.changes = [
      { KBID: 'test-course', SKZC: '0100', XSKZC: '0010', XSKXQ: '3', XKSJC: '3', XJSJC: '3' },
    ];
    const result = normalizeJluTimetable(input);
    expect(result.lessons).toHaveLength(2);
    expect(new Set(result.lessons.map((lesson) => lesson.sourceId)).size).toBe(2);
  });
  it('rejects an invalid calendar, unknown fields and ambiguous campus times', () => {
    expect(() =>
      normalizeJluTimetable({ ...fixture(), calendar: [{ XQKSRQ: '2026-02-30' }] }),
    ).toThrow('开学日期');
    expect(() => normalizeJluTimetable({ ...fixture(), courses: [{ KCM: '缺少时间' }] })).toThrow(
      '字段',
    );
    expect(() =>
      normalizeJluTimetable({
        ...fixture(),
        periods: [
          ...periods.map((row) => ({ ...row, XXXQ: 'first-campus' })),
          { DM: '1', KSSJ: '08:00', JSSJ: '08:45', SFSY: '1', XXXQ: 'other-campus' },
        ],
      }),
    ).toThrow('校区节次');
    expect(() =>
      normalizeJluTimetable({
        ...fixture(),
        changes: [{ KBID: 'test-course', SKZC: '0100', XSKXQ: '3' }],
      }),
    ).toThrow('新时间');
  });
  it('selects the matching campus and accepts compact clock values', () => {
    const input = fixture();
    const result = normalizeJluTimetable({
      ...input,
      courses: [{ ...course, XXXQDM: 'A' }],
      periods: [
        ...periods.map((row) => ({ ...row, XXXQ: 'A' })),
        { DM: '1', KSSJ: '800', JSSJ: '845', SFSY: '1', XXXQ: 'B' },
      ],
    });
    expect(result.lessons[0]?.startMinute).toBe(550);
  });
  it('warns about unplaced courses and unmatched changes rather than reporting full coverage', () => {
    const input = fixture();
    input.unscheduled = [{ KCM: '未排课示例' }];
    input.changes = [{ KBID: 'other', SKZC: '0100' }];
    expect(normalizeJluTimetable(input).warnings).toHaveLength(2);
  });
  it('distinguishes an empty timetable from a missing or partial response', () => {
    expect(
      parseEmapRows({ code: '0', datas: { cxxszhxqkb: { rows: [], totalSize: 0 } } }, 'cxxszhxqkb'),
    ).toEqual([]);
    expect(() => parseEmapRows({ datas: {} }, 'cxxszhxqkb')).toThrow('缺少');
    expect(() =>
      parseEmapRows({ datas: { cxxszhxqkb: { rows: [], totalSize: 3 } } }, 'cxxszhxqkb'),
    ).toThrow('不完整');
  });
  it('accepts the school unpaginated unknown-total response without treating it as missing data', () => {
    expect(
      parseEmapRows(
        {
          code: '0',
          datas: { cxxszhxqkb: { rows: [course], totalSize: -1, pageSize: 0, pageNumber: 0 } },
        },
        'cxxszhxqkb',
      ),
    ).toEqual([course]);
    expect(parseEmapRows({ datas: { jc: { rows: periods, totalSize: -1 } } }, 'jc')).toEqual(
      periods,
    );
    expect(() => parseEmapRows({ datas: { jc: { rows: periods, totalSize: -2 } } }, 'jc')).toThrow(
      '缺少',
    );
    expect(() => parseEmapRows({ datas: { jc: { totalSize: -1 } } }, 'jc')).toThrow('缺少');
    expect(() =>
      parseEmapRows({ datas: { jc: { rows: periods, totalSize: -1, pageSize: 3 } } }, 'jc'),
    ).toThrow('分页');
  });
});

describe('JLU requests', () => {
  beforeEach(() => {
    request.mockImplementation(async (_session, url) => {
      if (url.endsWith('dqxnxq.do')) return envelope('dqxnxq', [{ DM: '2026-2027-1' }]);
      if (url.endsWith('cxxszhxqkb.do')) return envelope('cxxszhxqkb', [course]);
      if (url.endsWith('/jc.do')) return envelope('jc', periods);
      if (url.endsWith('cxxljc.do')) return envelope('cxxljc', fixture().calendar);
      if (url.endsWith('xsdkkc.do')) return envelope('xsdkkc', []);
      if (url.endsWith('xswpkc.do')) return envelope('xswpkc', []);
      throw new Error('unexpected request');
    });
  });
  it('uses personal EMAP endpoints and the selected school semester without requesting student identifiers', async () => {
    expect(await currentJluSemester()).toBe('2026-2027-1');
    const result = await fetchJluTimetable();
    expect(result.semester).toBe('2026-2027-1');
    for (const [session, url, options] of request.mock.calls) {
      expect(session).toEqual({ name: 'isolated-jlu-session' });
      expect(new URL(url).hostname).toBe('iedu.jlu.edu.cn');
      expect(options.method).toBe('POST');
      expect(options.body).not.toMatch(/XH=|password|SKZC=/);
    }
    const call = request.mock.calls.find(([, url]) => url.endsWith('cxxszhxqkb.do'))!;
    expect(new URLSearchParams(call[2].body).get('XNXQDM')).toBe('2026-2027-1');
  });
  it('recognizes an HTTP 200 CAS login page as an expired session', async () => {
    request.mockResolvedValue('<html><form id="loginForm"></form></html>');
    await expect(fetchJluTimetable()).rejects.toBeInstanceOf(CampusAuthError);
  });
  it('preserves warnings if optional adjustment data is unavailable', async () => {
    const original = request.getMockImplementation()!;
    request.mockImplementation((session, url, options) =>
      url.endsWith('xsdkkc.do')
        ? Promise.reject(new Error('offline'))
        : original(session, url, options),
    );
    expect((await fetchJluTimetable('2026-2027-1')).warnings).toContain(
      '调停课信息未获取，请对照教务原课表核查临时调整',
    );
  });
});
