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

/** 浏览已连接文件夹时的目录内容：子文件夹与文件都列出，文件带相对路径与体积。 */
export interface KnowledgeEntries {
  folders: string[];
  files: { name: string; path: string; bytes: number }[];
}

export interface KnowledgeApi {
  state(): Promise<KnowledgeState>;
  attach(): Promise<KnowledgeRoot | null>;
  detach(rootId: string): Promise<number>;
  folders(rootId: string, path: string): Promise<string[]>;
  entries(rootId: string, path: string): Promise<KnowledgeEntries>;
  enroll(rootId: string, path: string): Promise<KnowledgeCourse>;
  remove(courseId: string): Promise<void>;
  files(courseId: string): Promise<KnowledgeFile[]>;
  search(courseId: string, query: string): Promise<KnowledgeHit[]>;
  indexPdf(courseId: string, path: string, revision: string, pages: string[]): Promise<void>;
  session(courseId: string): Promise<string>;
  note(courseId: string, text: string): Promise<string>;
}
