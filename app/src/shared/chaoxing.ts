import type { ChaoxingCalendar, ChaoxingCalendarSync } from './chaoxing-calendar';
export interface ChaoxingCourse {
  id: string;
  name: string;
  teacher: string;
  ended: boolean;
}
export interface ChaoxingCourses {
  items: ChaoxingCourse[];
  syncedAt: string;
}
export interface ChaoxingFile {
  id: string;
  name: string;
  type: string;
  size: string;
  creator: string;
  date: string;
  downloadable: boolean;
}
export interface ChaoxingFolder {
  courseId: string;
  folderId: string;
  name: string;
  items: ChaoxingFile[];
  syncedAt: string;
}
export interface ChaoxingWork {
  id: string;
  title: string;
  status: string;
  timing: string;
  detailTiming?: string;
  detailSyncedAt?: string;
}
export interface ChaoxingWorks {
  courseId: string;
  items: ChaoxingWork[];
  syncedAt: string;
}
export type ChaoxingResult<T> =
  { ok: true; data: T } | { ok: false; error: string; reason?: 'auth' };
export interface ChaoxingApi {
  calendar(): Promise<ChaoxingCalendar>;
  syncCalendar(): Promise<ChaoxingCalendarSync>;
  courses(): Promise<ChaoxingCourses | null>;
  syncCourses(): Promise<ChaoxingResult<ChaoxingCourses>>;
  files(courseId: string, folderId?: string): Promise<ChaoxingFolder | null>;
  syncFiles(courseId: string, folderId?: string): Promise<ChaoxingResult<ChaoxingFolder>>;
  works(courseId: string): Promise<ChaoxingWorks | null>;
  syncWorks(courseId: string): Promise<ChaoxingResult<ChaoxingWorks>>;
  importFile(courseId: string, folderId: string, fileId: string): Promise<{ id: string }>;
}
