import { ipcMain, dialog, BrowserWindow } from 'electron';
import { checkWorkspaceSender } from '../ipc';
import {
  chaoxingResult,
  getChaoxingCalendar,
  syncChaoxingCalendar,
  getChaoxingCourses,
  syncChaoxingCourses,
  getChaoxingFiles,
  syncChaoxingFiles,
  getChaoxingWorks,
  syncChaoxingWorks,
  importChaoxingFile,
  bindChaoxingCourse,
  linkChaoxingFile,
  openChaoxingFilesPage,
} from './api';
export function registerChaoxingIpc() {
  ipcMain.handle('cx:calendar:get', (event) => {
    checkWorkspaceSender(event);
    return getChaoxingCalendar();
  });
  ipcMain.handle('cx:calendar:sync', (event) => {
    checkWorkspaceSender(event);
    return syncChaoxingCalendar(event.sender);
  });
  ipcMain.handle('cx:courses:get', (event) => {
    checkWorkspaceSender(event);
    return getChaoxingCourses();
  });
  ipcMain.handle('cx:courses:sync', (event) => {
    checkWorkspaceSender(event);
    return chaoxingResult(() => syncChaoxingCourses(event.sender));
  });
  ipcMain.handle('cx:files:get', (event, courseId: string, folderId?: string) => {
    checkWorkspaceSender(event);
    return getChaoxingFiles(courseId, folderId);
  });
  ipcMain.handle('cx:files:sync', (event, courseId: string, folderId?: string) => {
    checkWorkspaceSender(event);
    return chaoxingResult(() => syncChaoxingFiles(courseId, folderId, event.sender));
  });
  ipcMain.handle('cx:works:get', (event, courseId: string) => {
    checkWorkspaceSender(event);
    return getChaoxingWorks(courseId);
  });
  ipcMain.handle('cx:works:sync', (event, courseId: string) => {
    checkWorkspaceSender(event);
    return chaoxingResult(() => syncChaoxingWorks(courseId, event.sender));
  });
  ipcMain.handle('cx:course:bind', (event, courseId: string, knowledgeCourseId: unknown) => {
    checkWorkspaceSender(event);
    return bindChaoxingCourse(courseId, knowledgeCourseId);
  });
  ipcMain.handle('cx:files:open', (event, courseId: string, folderId = '') => {
    checkWorkspaceSender(event);
    return openChaoxingFilesPage(courseId, folderId, event.sender);
  });
  ipcMain.handle(
    'cx:file:link',
    async (event, courseId: string, folderId: string, fileId: string) => {
      checkWorkspaceSender(event);
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: getChaoxingFiles(courseId, folderId)?.localCourse?.path,
        title: '关联已下载的本地资料',
        properties: ['openFile'] as ['openFile'],
      };
      const selected = await (parent
        ? dialog.showOpenDialog(parent, options)
        : dialog.showOpenDialog(options));
      return selected.canceled
        ? null
        : linkChaoxingFile(courseId, folderId, fileId, selected.filePaths[0]!);
    },
  );
  ipcMain.handle('cx:file:import', (event, courseId: string, folderId: string, fileId: string) => {
    checkWorkspaceSender(event);
    return importChaoxingFile(courseId, folderId, fileId);
  });
}
