import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import { release } from 'node:os';
import { promisify } from 'node:util';
import type { WechatMirrorSupport } from '../../shared/wechat';
import { checkWorkspaceSender } from '../ipc';

const prepared = new Set<number>();
const exec = promisify(execFile);

export function getWechatMirrorSupport(): WechatMirrorSupport {
  const supported = process.platform === 'darwin' && Number.parseInt(release(), 10) >= 24;
  return {
    supported,
    reason: supported ? '' : '窗口镜像实验需要 macOS 15 或以上版本。',
  };
}

export function canCaptureWechatWindow(contents: WebContents | null): boolean {
  return contents !== null && prepared.has(contents.id);
}

export function configureWechatMirror(window: BrowserWindow): void {
  const contents = window.webContents;
  const stop = () => {
    prepared.delete(contents.id);
    if (!contents.isDestroyed()) contents.send('wechat:stop');
  };
  window.on('hide', stop);
  contents.once('destroyed', () => prepared.delete(contents.id));
  contents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) stop();
  });
  if (getWechatMirrorSupport().supported)
    contents.session.setDisplayMediaRequestHandler((_request, callback) => callback(null), {
      useSystemPicker: true,
    });
}

export function registerWechatMirrorIpc(): void {
  const handlers: Record<string, (contents: WebContents) => unknown> = {
    'get-support': () => getWechatMirrorSupport(),
    prepare: (contents) => {
      const support = getWechatMirrorSupport();
      if (!support.supported) throw new Error(support.reason);
      prepared.add(contents.id);
    },
    stop: (contents) => {
      prepared.delete(contents.id);
    },
    'open-native': () => exec('/usr/bin/open', ['-b', 'com.tencent.xinWeChat']).then(() => {}),
  };
  for (const [name, handler] of Object.entries(handlers))
    ipcMain.handle(`wechat:${name}`, (event) => {
      checkWorkspaceSender(event);
      return handler(event.sender);
    });
}
