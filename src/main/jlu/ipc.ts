import { ipcMain } from 'electron';
import { z } from 'zod';
import { checkWorkspaceSender } from '../ipc';
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
