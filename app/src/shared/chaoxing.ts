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
export interface ChaoxingLocalCourse {
  knowledgeCourseId: string;
  name: string;
  path: string;
}
export interface ChaoxingLocalFile {
  path: string;
  origin: 'linked' | 'downloaded';
  status: 'ready' | 'missing' | 'local-changed' | 'remote-changed';
}
export interface ChaoxingFile {
  id: string;
  name: string;
  type: string;
  size: string;
  creator: string;
  date: string;
  downloadable: boolean;
  local?: ChaoxingLocalFile;
}
export interface ChaoxingFolder {
  courseId: string;
  folderId: string;
  relativePath?: string[];
  localCourse?: ChaoxingLocalCourse;
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
  bindCourse(
    courseId: string,
    knowledgeCourseId: string | null,
  ): Promise<ChaoxingLocalCourse | null>;
  linkFile(courseId: string, folderId: string, fileId: string): Promise<{ id: string } | null>;
  openFilesPage(courseId: string, folderId?: string): Promise<void>;
  importFile(courseId: string, folderId: string, fileId: string): Promise<{ id: string }>;
}
