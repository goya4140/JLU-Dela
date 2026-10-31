import type {
  CalendarEventColor,
  TimetableLesson,
  TimetableState,
  TodoItem,
} from '../../../shared/api';
import type { ChaoxingCalendar, ChaoxingCalendarWork } from '../../../shared/chaoxing-calendar';
import { chaoxingWorkCompleted } from '../../../shared/chaoxing-calendar';
import { lessonOccurrences } from '../../../shared/schedule';
import { todoCompleted } from '../../../shared/todo';
import { colorFor } from '../timetable/timetable-format';

export type StudyEntry = {
  id: string;
  source: 'course' | 'assignment' | 'personal';
  title: string;
  date: string | null;
  time: string | null;
  endTime?: string;
  color: CalendarEventColor;
  done: boolean;
} & (
  | { kind: 'course'; lesson: TimetableLesson }
  | { kind: 'assignment'; work: ChaoxingCalendarWork }
  | { kind: 'personal'; todo: TodoItem }
);

const schoolDate = (value: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(value));
const schoolTime = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export function studyEntries(
  todos: readonly TodoItem[],
  academic: { state: TimetableState; lessons: readonly TimetableLesson[] } | null,
  assignments: ChaoxingCalendar | null,
  start: Date,
  end: Date,
) {
  const entries: StudyEntry[] = todos
    .filter((todo) => todo.source === 'personal')
    .map((todo) => ({
      id: `personal:${todo.id}`,
      source: 'personal',
      kind: 'personal',
      title: todo.title,
      date: todo.dueAt ? schoolDate(todo.dueAt) : null,
      time: todo.dueAt ? schoolTime(todo.dueAt) : null,
      color: todo.color ?? 'slate',
      done: todoCompleted(todo.status),
      todo,
    }));
  const works = new Map(
    (assignments?.works ?? []).map((work) => [`${work.courseId}:${work.id}`, work]),
  );
  for (const [id, work] of works)
    entries.push({
      id: `assignment:${id}`,
      source: 'assignment',
      kind: 'assignment',
      title: work.title,
      date: work.deadline?.date ?? null,
      time: work.deadline?.time ?? null,
      color: colorFor(`chaoxing:${work.courseId}`),
      done: chaoxingWorkCompleted(work.status),
      work,
    });
  const lessons =
    academic?.lessons.map((lesson) =>
      lesson.weekNumbers.length || !academic.state.totalWeeks
        ? lesson
        : {
            ...lesson,
            weekNumbers: Array.from({ length: academic.state.totalWeeks }, (_, i) => i + 1),
          },
    ) ?? [];
  const occurrences = lessonOccurrences(
    lessons,
    academic?.state.semesterStart ?? null,
    start.toISOString(),
    end.toISOString(),
  );
  for (const item of occurrences.items) {
    const lesson = lessons.find((lesson) => lesson.id === item.lessonId)!;
    entries.push({
      id: `course:${lesson.id}:${item.startAt}`,
      source: 'course',
      kind: 'course',
      title: lesson.courseName,
      date: schoolDate(item.startAt),
      time: schoolTime(item.startAt),
      endTime: schoolTime(item.endAt),
      color: colorFor(lesson.courseCode || lesson.courseName),
      done: false,
      lesson,
    });
  }
  entries.sort(
    (a, b) =>
      (a.date ?? 'z').localeCompare(b.date ?? 'z') ||
      (a.source === 'assignment' ? 0 : 1) - (b.source === 'assignment' ? 0 : 1) ||
      (a.time ?? '').localeCompare(b.time ?? '') ||
      a.title.localeCompare(b.title),
  );
  return { entries, warnings: academic ? occurrences.warnings : [] };
}
