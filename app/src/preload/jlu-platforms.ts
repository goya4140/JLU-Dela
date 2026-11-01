import type { JluPlatformsApi } from '../shared/jlu-platforms';
import { invoke } from './lib';
export const jluPlatforms = {
  getNotices: (channel: string, page: number) => invoke('jlu:notices:get', channel, page),
  syncNotices: (channel: string, page: number) => invoke('jlu:notices:sync', channel, page),
  getNotice: (id: string, channel: string) => invoke('jlu:notice:get', id, channel),
  readNotice: (id: string, channel: string) => invoke('jlu:notice:read', id, channel),
  getLearning: () => invoke('jlu:learning:get'),
  syncLearning: (termId?: string) => invoke('jlu:learning:sync', termId),
  getRecordings: (id: string) => invoke('jlu:recordings:get', id),
  syncRecordings: (id: string) => invoke('jlu:recordings:sync', id),
  studyMedia: (courseId: string, recordingId: string) =>
    invoke('jlu:study:media', courseId, recordingId),
  studyWorkspace: (courseId: string, recordingId: string) =>
    invoke('jlu:study:workspace', courseId, recordingId),
  studyMaterials: (courseId: string, recordingId: string) =>
    invoke('jlu:study:materials', courseId, recordingId),
  importStudyMaterials: (courseId: string, recordingId: string) =>
    invoke('jlu:study:materials:import', courseId, recordingId),
  removeStudyMaterial: (courseId: string, recordingId: string, entryId: string) =>
    invoke('jlu:study:materials:remove', courseId, recordingId, entryId),
  openLearning: (target?: 'recordings') => invoke('jlu:learning:open', target),
  openNotice: (id: string, channel: string) => invoke('jlu:notice:open', id, channel),
  openAttachment: (id: string, channel: string, index: number) =>
    invoke('jlu:attachment:open', id, channel, index),
} satisfies JluPlatformsApi;
