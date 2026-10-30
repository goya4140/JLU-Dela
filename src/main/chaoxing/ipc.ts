import { ipcMain } from 'electron';
import { checkWorkspaceSender } from '../ipc';
import {
  chaoxingResult,
  getChaoxingCourses,
  syncChaoxingCourses,
  getChaoxingFiles,
  syncChaoxingFiles,
  getChaoxingWorks,
  syncChaoxingWorks,
  importChaoxingFile,
} from './api';
export function registerChaoxingIpc() {
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
  ipcMain.handle('cx:file:import', (event, courseId: string, folderId: string, fileId: string) => {
    checkWorkspaceSender(event);
    return importChaoxingFile(courseId, folderId, fileId);
  });
}
