import { dialog, ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { checkWorkspaceSender } from '../ipc';
import {
  attachKnowledge,
  knowledgeState,
  knowledgeFolders,
  knowledgeEntries,
  enrollCourse,
  removeCourse,
  detachKnowledge,
  knowledgeFiles,
  searchKnowledge,
  indexKnowledgePdf,
  knowledgeSession,
  knowledgeNote,
} from './api';
export function registerKnowledgeIpc() {
  ipcMain.handle('knowledge:attach', async (event) => {
    checkWorkspaceSender(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: '连接知识库文件夹',
      properties: ['openDirectory'] as ['openDirectory'],
    };
    const result = await (parent
      ? dialog.showOpenDialog(parent, options)
      : dialog.showOpenDialog(options));
    return result.canceled ? null : attachKnowledge(result.filePaths[0]!);
  });
  ipcMain.handle('knowledge:state', (event) => {
    checkWorkspaceSender(event);
    return knowledgeState();
  });
  // 单参数方法：课程与知识库的移除只接受一个 id。
  const oneArg: Record<string, (id: string) => unknown> = {
    detach: detachKnowledge,
    remove: removeCourse,
  };
  for (const [name, method] of Object.entries(oneArg))
    ipcMain.handle('knowledge:' + name, (event, id: unknown) => {
      checkWorkspaceSender(event);
      return method(z.string().uuid().parse(id));
    });
  const methods: Record<string, (id: string, value: string) => unknown> = {
    folders: knowledgeFolders,
    entries: knowledgeEntries,
    enroll: enrollCourse,
    files: knowledgeFiles,
    search: searchKnowledge,
    session: knowledgeSession,
    note: knowledgeNote,
  };
  for (const [name, method] of Object.entries(methods))
    ipcMain.handle('knowledge:' + name, (event, ...args: unknown[]) => {
      checkWorkspaceSender(event);
      const first = z.string().uuid().parse(args[0]);
      const second = z
        .string()
        .max(name === 'note' ? 200000 : name === 'search' ? 200 : 32767)
        .parse(args[1] ?? '');
      return method(first, second);
    });
  ipcMain.handle('knowledge:index-pdf', (event, courseId, path, revision, pages) => {
    checkWorkspaceSender(event);
    return indexKnowledgePdf(
      z.string().uuid().parse(courseId),
      z.string().max(32767).parse(path),
      z.string().max(100).parse(revision),
      pages,
    );
  });
}
