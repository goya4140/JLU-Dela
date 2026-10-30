import type { TimetableLesson } from './api';

export type ScheduledLesson = TimetableLesson & { startMinute: number; endMinute: number };

export function hasLessonTime(lesson: TimetableLesson): lesson is ScheduledLesson {
  return (
    lesson.startMinute !== null &&
    lesson.endMinute !== null &&
    Number.isInteger(lesson.startMinute) &&
    Number.isInteger(lesson.endMinute) &&
    lesson.startMinute >= 0 &&
    lesson.endMinute <= 1440 &&
    lesson.endMinute > lesson.startMinute
  );
}

export function lessonOccurrences(
  lessons: readonly TimetableLesson[],
  semesterStart: string | null,
  startAt: string,
  endAt: string,
) {
  const warnings: string[] = [];
  const items: {
    source: 'course';
    lessonId: number;
    title: string;
    startAt: string;
    endAt: string;
    location: string | null;
  }[] = [];
  if (!semesterStart) return { items, warnings: ['缺少学期开始日期，无法将课程转换为实际日期'] };
  const date = new Date(`${semesterStart}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== semesterStart)
    return { items, warnings: ['学期开始日期无效'] };
  const day = 86400000;
  const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * day - 8 * 3600000;
  const rangeStart = Date.parse(startAt),
    rangeEnd = Date.parse(endAt);
  for (const lesson of lessons) {
    const start = lesson.startMinute;
    const end = lesson.endMinute;
    if (
      !lesson.weekNumbers.length ||
      !hasLessonTime(lesson) ||
      start === null ||
      end === null ||
      lesson.weekday < 1 ||
      lesson.weekday > 7
    ) {
      warnings.push(`${lesson.courseName}：缺少有效周次或节次时间，未计入时间安排`);
      continue;
    }
    for (const week of lesson.weekNumbers) {
      const base = monday + ((week - 1) * 7 + lesson.weekday - 1) * day;
      const begin = base + start * 60000,
        finish = base + end * 60000;
      if (finish > rangeStart && begin < rangeEnd)
        items.push({
          source: 'course',
          lessonId: lesson.id,
          title: lesson.courseName,
          startAt: new Date(begin).toISOString(),
          endAt: new Date(finish).toISOString(),
          location: lesson.classroom,
        });
    }
  }
  return { items, warnings };
}
