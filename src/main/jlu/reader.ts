import { BrowserWindow, type WebContents } from 'electron';
import { CAMPUS_PARTITION, CampusAuthError, flushCampusSession, getCampusSession } from '../campus';
import { isJluLoginUrl } from '../timetable/jlu';

/** 在学校页面的会话环境中读取固定数据；网页没有应用 preload。 */
export async function readSchoolPage(options: {
  url: string;
  title: string;
  accepts: (url: URL) => boolean;
  script: string;
  sender?: WebContents;
}): Promise<unknown> {
  await getCampusSession();
  const window = new BrowserWindow({
    show: false,
    title: options.title,
    parent: options.sender
      ? (BrowserWindow.fromWebContents(options.sender) ?? undefined)
      : undefined,
    webPreferences: {
      partition: CAMPUS_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const data = await new Promise<unknown>((resolve, reject) => {
    let done = false;
    let checking = false;
    let shown = false;
    const finish = (error: Error | null, value?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearInterval(interval);
      if (!window.isDestroyed()) window.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const check = async () => {
      if (done || checking) return;
      checking = true;
      const current = window.webContents.getURL();
      try {
        if (isJluLoginUrl(current)) {
          const needsInput: boolean = await window.webContents.executeJavaScript(
            `Boolean(document.querySelector('form#loginForm, input[type="password"], input[name="WxCode"]'))`,
          );
          if (needsInput && window.webContents.getURL() === current) {
            if (!options.sender) finish(new CampusAuthError('请在应用中完成学校登录或验证'));
            else if (!shown) {
              shown = true;
              clearTimeout(timeout);
              window.show();
              window.focus();
            }
          }
        } else if (
          !window.webContents.isLoadingMainFrame() &&
          current.startsWith('https://') &&
          options.accepts(new URL(current))
        ) {
          const result: { ready: boolean; data?: unknown } =
            await window.webContents.executeJavaScript(options.script);
          if (result.ready) finish(null, result.data);
        }
      } catch (error) {
        if (
          window.isDestroyed() ||
          window.webContents.getURL() !== current ||
          window.webContents.isLoadingMainFrame()
        )
          return;
        if (
          error instanceof Error &&
          /context was destroyed|frame was disposed|frame was detached/i.test(error.message)
        )
          return;
        finish(new Error(`${options.title}读取失败：页面结构或接口响应无法识别，本地缓存未更新`));
      } finally {
        checking = false;
      }
    };
    const timeout = setTimeout(
      () => finish(new Error(`${options.title}连接超时，请检查校园网/VPN后重试`)),
      25000,
    );
    const interval = setInterval(() => void check(), 1000);
    window.webContents.on('did-finish-load', () => void check());
    window.webContents.on('did-navigate', (_event, _url, status) => {
      if (status >= 400)
        finish(new Error(`${options.title}返回 ${status}，请检查服务、权限或校园网/VPN`));
    });
    window.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3)
        finish(new Error(`${options.title}连接失败，请检查网络或校园网/VPN`));
    });
    window.on('closed', () => finish(new Error('已取消学校登录，本地缓存未更新')));
    void window.loadURL(options.url).catch((error: unknown) => {
      if (!(error instanceof Error && error.message.includes('ERR_ABORTED')))
        finish(new Error(`${options.title}连接失败，请检查网络或校园网/VPN`));
    });
  });
  await flushCampusSession();
  return data;
}
