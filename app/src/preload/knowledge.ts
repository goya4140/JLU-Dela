import { invoke } from './lib';
import type { KnowledgeApi } from '../shared/knowledge';
export const knowledge = {
  state: () => invoke('knowledge:state'),
  attach: () => invoke('knowledge:attach'),
  detach: (rootId) => invoke('knowledge:detach', rootId),
  folders: (rootId, path) => invoke('knowledge:folders', rootId, path),
  entries: (rootId, path) => invoke('knowledge:entries', rootId, path),
  enroll: (rootId, path) => invoke('knowledge:enroll', rootId, path),
  remove: (courseId) => invoke('knowledge:remove', courseId),
  files: (courseId) => invoke('knowledge:files', courseId),
  search: (courseId, query) => invoke('knowledge:search', courseId, query),
  indexPdf: (courseId, path, revision, pages) =>
    invoke('knowledge:index-pdf', courseId, path, revision, pages),
  session: (courseId) => invoke('knowledge:session', courseId),
  note: (courseId, text) => invoke('knowledge:note', courseId, text),
} satisfies KnowledgeApi;
