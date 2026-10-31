import type { LearningPageApi } from '../features/campus/LearningView';
import type { ChaoxingPageApi } from '../features/campus/ChaoxingView';
import type { NoticesPageApi } from '../features/campus/SchoolNoticesView';
import { webCall } from './api';
import type { DelaApi } from '../../shared/api';

export const appearanceApi: Pick<DelaApi['settings'], 'getTheme' | 'getFontSize' | 'getZoom'> = {
  getTheme: () => webCall('appearance.theme'),
  getFontSize: () => webCall('appearance.fontSize'),
  getZoom: () => webCall('appearance.zoom'),
};

export const learningApi: LearningPageApi = {
  getLearning: () => webCall('learning.courses'),
  syncLearning: (term) => webCall('learning.sync', term ? [term] : []),
  getRecordings: (id) => webCall('learning.recordings', [id]),
  syncRecordings: (id) => webCall('learning.syncRecordings', [id]),
};
export const chaoxingApi: ChaoxingPageApi = {
  courses: () => webCall('chaoxing.courses'),
  syncCourses: () => webCall('chaoxing.sync'),
  files: (id, folder) => webCall('chaoxing.files', folder ? [id, folder] : [id]),
  syncFiles: (id, folder) => webCall('chaoxing.syncFiles', folder ? [id, folder] : [id]),
  works: (id) => webCall('chaoxing.works', [id]),
  syncWorks: (id) => webCall('chaoxing.syncWorks', [id]),
};
export const noticesApi: NoticesPageApi = {
  getNotices: (channel, page) => webCall('notices.list', [channel, page]),
  syncNotices: (channel, page) => webCall('notices.sync', [channel, page]),
  getNotice: (id, channel) => webCall('notices.cached', [id, channel]),
  readNotice: (id, channel) => webCall('notices.read', [id, channel]),
};
