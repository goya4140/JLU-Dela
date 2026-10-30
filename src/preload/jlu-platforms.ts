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
  openLearning: () => invoke('jlu:learning:open'),
  openNotice: (id: string, channel: string) => invoke('jlu:notice:open', id, channel),
  openAttachment: (id: string, channel: string, index: number) =>
    invoke('jlu:attachment:open', id, channel, index),
} satisfies JluPlatformsApi;
