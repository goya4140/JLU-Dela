import type { ChaoxingApi } from '../shared/chaoxing';
import { invoke } from './lib';
export const chaoxing = {
  calendar: () => invoke('cx:calendar:get'),
  syncCalendar: () => invoke('cx:calendar:sync'),
  courses: () => invoke('cx:courses:get'),
  syncCourses: () => invoke('cx:courses:sync'),
  files: (courseId: string, folderId?: string) => invoke('cx:files:get', courseId, folderId),
  syncFiles: (courseId: string, folderId?: string) => invoke('cx:files:sync', courseId, folderId),
  works: (courseId: string) => invoke('cx:works:get', courseId),
  syncWorks: (courseId: string) => invoke('cx:works:sync', courseId),
  importFile: (courseId: string, folderId: string, fileId: string) =>
    invoke('cx:file:import', courseId, folderId, fileId),
} satisfies ChaoxingApi;
