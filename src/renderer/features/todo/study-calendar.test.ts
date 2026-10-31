import { describe, expect, it } from 'vitest';
import type { TimetableLesson, TimetableState, TodoItem } from '../../../shared/api';
import type { ChaoxingCalendar } from '../../../shared/chaoxing-calendar';
import { studyEntries } from './study-calendar';

const start = new Date('2026-10-26T00:00:00+08:00'),
  end = new Date('2026-11-02T00:00:00+08:00');
const lesson: TimetableLesson = {
  id: 1,
  semester: '2026',
  courseCode: 'CS1',
  courseName: '实验课',
  className: null,
  teacher: null,
  campus: null,
  classroom: '实验室',
  weekday: 1,
  startPeriod: 1,
  endPeriod: 2,
  startMinute: 480,
  endMinute: 575,
  periodsText: '1-2节',
  weeksText: '1,3周',
  weekNumbers: [1, 3],
  credits: null,
  note: null,
};
const state: TimetableState = {
  semester: '2026',
  semesterStart: '2026-10-12',
  lastSyncedAt: null,
  totalWeeks: 16,
};
const work = {
  id: '1',
  title: '报告',
  status: '未交',
  timing: '剩余2天',
  courseId: 'a',
  courseName: '实验课',
  syncedAt: '2026-10-31T00:00:00Z',
  deadline: null,
};
const assignments: ChaoxingCalendar = {
  coursesSyncedAt: null,
  courses: [],
  works: [work, work, { ...work, courseId: 'b', deadline: { date: '2026-10-27', time: null } }],
};

describe('unified calendar projection', () => {
  it('uses Shanghai dates and actual teaching weeks; repeated assignments are keyed per course', () => {
    const { entries } = studyEntries([], { state, lessons: [lesson] }, assignments, start, end);
    const course = entries.find((entry) => entry.kind === 'course');
    expect(course).toMatchObject({ date: '2026-10-26', time: '08:00', endTime: '09:35' });
    expect(entries.filter((entry) => entry.kind === 'assignment')).toHaveLength(2);
    expect(entries.find((entry) => entry.id === 'assignment:a:1')?.date).toBeNull();
    expect(entries.find((entry) => entry.id === 'assignment:b:1')?.time).toBeNull();
    expect(
      studyEntries(
        [],
        { state, lessons: [lesson] },
        null,
        new Date('2026-10-19T00:00:00+08:00'),
        start,
      ).entries,
    ).toEqual([]);
  });
  it('reports missing semester dates and preserves undated personal items', () => {
    const todo: TodoItem = {
      id: 't',
      source: 'personal',
      title: '读书',
      notes: '',
      dueAt: null,
      status: 'pending',
      readAt: null,
      createdAt: '',
    };
    const result = studyEntries(
      [todo],
      { state: { ...state, semesterStart: null }, lessons: [lesson] },
      null,
      start,
      end,
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ kind: 'personal', date: null });
  });
});
