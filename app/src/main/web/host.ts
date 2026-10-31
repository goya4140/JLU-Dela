import { net, type BrowserWindow } from 'electron';
import { startWebServer } from './server';
import { randomBytes } from 'node:crypto';
import { webMethods } from '../../shared/web';
export async function startWebHost(window: BrowserWindow, directory: string) {
  const notes = new Map<string, string>();
  const noteKeys = new Map<string, string>();
  return startWebServer({
    directory,
    mediaFetch: (url, range, signal) =>
      net.fetch(url, { headers: range ? { Range: range } : {}, signal }),
    invoke: async (method, args) => {
      if (window.isDestroyed()) throw new Error('本机 Dela 服务已关闭');
      if (method === 'learning.note') {
        const workspace = await window.webContents.executeJavaScript(
          `window.dela.jluPlatforms.studyWorkspace(...${JSON.stringify(args)})`,
        );
        const note = await window.webContents.executeJavaScript(
          `window.dela.workspace.read(${JSON.stringify(workspace.noteId)})`,
        );
        let id = noteKeys.get(workspace.noteId);
        if (!id) {
          id = randomBytes(24).toString('hex');
          noteKeys.set(workspace.noteId, id);
          notes.set(id, workspace.noteId);
        }
        return { id, title: note.title, text: note.text, revision: note.revision };
      }
      if (method === 'learning.saveNote') {
        const path = notes.get(args[0] as string);
        if (!path) throw new Error('笔记连接已过期，请重新打开录像');
        await window.webContents.executeJavaScript(
          `window.dela.workspace.saveNote(...${JSON.stringify([path, args[1], args[2]])})`,
        );
        const note = await window.webContents.executeJavaScript(
          `window.dela.workspace.read(${JSON.stringify(path)})`,
        );
        return { id: args[0], title: note.title, text: note.text, revision: note.revision };
      }
      if (['chat.open', 'chat.ask', 'chat.cancel', 'chat.model'].includes(method)) {
        const chat = await window.webContents.executeJavaScript(
          `window.dela.session.open(${JSON.stringify(args[0])})`,
        );
        if (chat.projectId !== null) throw new Error('网页只支持通用会话，请在本机打开项目对话');
      }
      const [namespace, name] = webMethods[method];
      return window.webContents.executeJavaScript(
        `window.dela.${namespace}.${name}(...${JSON.stringify(args)})`,
      );
    },
  });
}

export { startWebServer } from './server';
