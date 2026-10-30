export interface JluNotice {
  id: string;
  channel: string;
  title: string;
  department: string;
  published: string;
  pinned: boolean;
  url: string;
}
export interface JluNoticePage {
  channel: string;
  page: number;
  totalPages: number | null;
  items: JluNotice[];
  syncedAt: string;
}
export interface JluNoticeDetail {
  id: string;
  channel: string;
  title: string;
  metadata: string;
  text: string;
  attachments: { name: string; url: string; elementId?: string }[];
  url: string;
  syncedAt: string;
}
export interface JluTerm {
  id: string;
  year: string;
  num: string;
  name: string;
  selected: boolean;
}
export interface JluCourse {
  id: string;
  name: string;
  courseName: string;
  teacher: string;
  status: string;
}
export interface JluLearning {
  terms: JluTerm[];
  termId: string | null;
  courses: JluCourse[];
  syncedAt: string;
}
export interface JluRecording {
  id: string;
  name: string;
  date: string;
  time: string;
  room: string;
  status: string;
}
export interface JluRecordings {
  courseId: string;
  items: JluRecording[];
  syncedAt: string;
}
export type JluPlatformResult<T> =
  { ok: true; data: T } | { ok: false; error: string; reason?: 'auth' };
export interface JluPlatformsApi {
  getNotices(channel: string, page: number): Promise<JluNoticePage | null>;
  syncNotices(channel: string, page: number): Promise<JluPlatformResult<JluNoticePage>>;
  getNotice(id: string, channel: string): Promise<JluNoticeDetail | null>;
  readNotice(id: string, channel: string): Promise<JluPlatformResult<JluNoticeDetail>>;
  getLearning(): Promise<JluLearning | null>;
  syncLearning(termId?: string): Promise<JluPlatformResult<JluLearning>>;
  getRecordings(courseId: string): Promise<JluRecordings | null>;
  syncRecordings(courseId: string): Promise<JluPlatformResult<JluRecordings>>;
  openLearning(target?: 'recordings'): Promise<void>;
  openNotice(id: string, channel: string): Promise<void>;
  openAttachment(id: string, channel: string, index: number): Promise<void>;
}
