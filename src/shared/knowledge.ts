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
export interface KnowledgeApi {
  state(): Promise<KnowledgeState>;
  attach(): Promise<KnowledgeRoot | null>;
  folders(rootId: string, path: string): Promise<string[]>;
  enroll(rootId: string, path: string): Promise<KnowledgeCourse>;
  files(courseId: string): Promise<KnowledgeFile[]>;
  search(courseId: string, query: string): Promise<KnowledgeHit[]>;
  indexPdf(courseId: string, path: string, revision: string, pages: string[]): Promise<void>;
  session(courseId: string): Promise<string>;
  note(courseId: string, text: string): Promise<string>;
}
