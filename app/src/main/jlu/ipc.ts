import { BrowserWindow, dialog, ipcMain } from 'electron';
import { z } from 'zod';
import { checkWorkspaceSender } from '../ipc';
import { studyMedia } from './study';
import {
  importStudyMaterials,
  removeStudyMaterial,
  studyMaterialExtensions,
  studyMaterials,
} from './study-materials';
import { studyWorkspace } from './study-workspace';
import { workspaceEntryIdSchema } from '../../shared/workspace';
import {
  getLearning,
  getNotice,
  getNotices,
  getRecordings,
  LEARNING_URL,
  openAttachment,
  openNotice,
  openSchoolUrl,
  platformResult,
  readNotice,
  syncLearning,
  syncNotices,
  syncRecordings,
} from './api';

export function registerJluPlatformsIpc(): void {
  ipcMain.handle('jlu:study:workspace', (event, courseId: string, recordingId: string) => {
    checkWorkspaceSender(event);
    return studyWorkspace(courseId, recordingId);
  });
  ipcMain.handle('jlu:study:materials', (event, courseId: string, recordingId: string) => {
    checkWorkspaceSender(event);
    return studyMaterials(
      z.string().min(1).max(200).parse(courseId),
      z.string().min(1).max(200).parse(recordingId),
    );
  });
  ipcMain.handle('jlu:study:materials:import', async (event, courseId, recordingId) => {
    checkWorkspaceSender(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: '导入课堂课件',
      properties: ['openFile', 'multiSelections'] as ['openFile', 'multiSelections'],
      filters: [{ name: '课件', extensions: studyMaterialExtensions.map((ext) => ext.slice(1)) }],
    };
    const picked = await (parent
      ? dialog.showOpenDialog(parent, options)
      : dialog.showOpenDialog(options));
    if (picked.canceled || !picked.filePaths.length)
      return studyMaterials(
        z.string().min(1).max(200).parse(courseId),
        z.string().min(1).max(200).parse(recordingId),
      );
    return importStudyMaterials(
      z.string().min(1).max(200).parse(courseId),
      z.string().min(1).max(200).parse(recordingId),
      picked.filePaths,
    );
  });
  ipcMain.handle(
    'jlu:study:materials:remove',
    (event, courseId: string, recordingId: string, entryId: string) => {
      checkWorkspaceSender(event);
      return removeStudyMaterial(
        z.string().min(1).max(200).parse(courseId),
        z.string().min(1).max(200).parse(recordingId),
        workspaceEntryIdSchema.parse(entryId),
      );
    },
  );
  ipcMain.handle('jlu:study:media', (event, courseId: string, recordingId: string) => {
    checkWorkspaceSender(event);
    return platformResult(() => studyMedia(courseId, recordingId, event.sender));
  });
  ipcMain.handle('jlu:notices:get', (event, channel: string, page: number) => {
    checkWorkspaceSender(event);
    return getNotices(channel, page);
  });
  ipcMain.handle('jlu:notices:sync', (event, channel: string, page: number) => {
    checkWorkspaceSender(event);
    return platformResult(() => syncNotices(channel, page, event.sender));
  });
  ipcMain.handle('jlu:notice:get', (event, id: string, channel: string) => {
    checkWorkspaceSender(event);
    return getNotice(id, channel);
  });
  ipcMain.handle('jlu:notice:read', (event, id: string, channel: string) => {
    checkWorkspaceSender(event);
    return platformResult(() => readNotice(id, channel, event.sender));
  });
  ipcMain.handle('jlu:notice:open', (event, id: string, channel: string) => {
    checkWorkspaceSender(event);
    return openNotice(event.sender, id, channel);
  });
  ipcMain.handle('jlu:learning:get', (event) => {
    checkWorkspaceSender(event);
    return getLearning();
  });
  ipcMain.handle('jlu:learning:sync', (event, termId?: string) => {
    checkWorkspaceSender(event);
    return platformResult(() => syncLearning(termId, event.sender));
  });
  ipcMain.handle('jlu:recordings:get', (event, id: string) => {
    checkWorkspaceSender(event);
    return getRecordings(id);
  });
  ipcMain.handle('jlu:recordings:sync', (event, id: string) => {
    checkWorkspaceSender(event);
    return platformResult(() => syncRecordings(id, event.sender));
  });
  ipcMain.handle('jlu:learning:open', async (event, target?: 'recordings') => {
    checkWorkspaceSender(event);
    z.literal('recordings').optional().parse(target);
    await openSchoolUrl(
      event.sender,
      target === 'recordings'
        ? 'https://ilearntec.jlu.edu.cn/studycenter-web/recordLiveStudy#/'
        : LEARNING_URL,
      target === 'recordings' ? '学在吉大 · 录播学习' : '学在吉大',
    );
  });
  ipcMain.handle('jlu:attachment:open', (event, id: string, channel: string, index: number) => {
    checkWorkspaceSender(event);
    return openAttachment(event.sender, id, channel, index);
  });
}
