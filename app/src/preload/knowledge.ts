import { invoke } from './lib';
import type { KnowledgeApi } from '../shared/knowledge';
export const knowledge = {
  state: () => invoke('knowledge:state'),
  attach: () => invoke('knowledge:attach'),
  browse: (rootId, path) => invoke('knowledge:browse', rootId, path),
  folders: (rootId, path) => invoke('knowledge:folders', rootId, path),
  enroll: (rootId, path) => invoke('knowledge:enroll', rootId, path),
  files: (courseId) => invoke('knowledge:files', courseId),
  search: (courseId, query) => invoke('knowledge:search', courseId, query),
  indexPdf: (courseId, path, revision, pages) =>
    invoke('knowledge:index-pdf', courseId, path, revision, pages),
  session: (courseId) => invoke('knowledge:session', courseId),
  note: (courseId, text) => invoke('knowledge:note', courseId, text),
} satisfies KnowledgeApi;
