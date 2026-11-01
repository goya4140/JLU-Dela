export interface KnowledgeRoot {
  id: string;
  name: string;
  path: string;
}
export interface KnowledgeCourse {
  id: string;
  rootId: string;
  name: string;
  relativePath: string;
}
export interface KnowledgeState {
  roots: KnowledgeRoot[];
  courses: KnowledgeCourse[];
}
export type KnowledgeDirectoryEntry = { name: string; path: string } & (
  { kind: 'folder' | 'link' } | { kind: 'file'; bytes: number; revision: string }
);
export interface KnowledgeFile {
  path: string;
  name: string;
  bytes: number;
  revision: string;
  indexed: boolean;
}
export interface KnowledgeHit {
  path: string;
  title: string;
  excerpt: string;
  page?: number;
  line?: number;
}
export interface KnowledgeApi {
  state(): Promise<KnowledgeState>;
  attach(): Promise<KnowledgeRoot | null>;
  /** 断开连接：只删本机登记与索引，磁盘文件保留；返回同时取消的课程数。 */
  detach(rootId: string): Promise<number>;
  browse(rootId: string, path: string): Promise<KnowledgeDirectoryEntry[]>;
  folders(rootId: string, path: string): Promise<string[]>;
  enroll(rootId: string, path: string): Promise<KnowledgeCourse>;
  /** 取消课程：只删本机登记与索引，课程文件保留。 */
  remove(courseId: string): Promise<void>;
  files(courseId: string): Promise<KnowledgeFile[]>;
  search(courseId: string, query: string): Promise<KnowledgeHit[]>;
  indexPdf(courseId: string, path: string, revision: string, pages: string[]): Promise<void>;
  session(courseId: string): Promise<string>;
  note(courseId: string, text: string): Promise<string>;
}
