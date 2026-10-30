import { BrowserWindow } from 'electron';
import { CampusAuthError, CAMPUS_PARTITION, getCampusSession } from '../campus';
import { isJluLoginUrl, isJluTimetableUrl, JLU_TIMETABLE_URL, probeJluTimetable } from './jlu';

/** 只走学校正常 SSO；确认页面要求人工认证时才报告 auth。 */
export async function restoreJluTimetableSession(): Promise<void> {
  await getCampusSession();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: CAMPUS_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let checking = false;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearInterval(interval);
      if (!window.isDestroyed()) window.destroy();
      if (error) reject(error);
      else resolve();
    };
    const check = async () => {
      if (finished || checking) return;
      checking = true;
      try {
        const url = window.webContents.getURL();
        if (isJluLoginUrl(url)) {
          const needsInput: boolean = await window.webContents.executeJavaScript(
            `Boolean(document.querySelector('form#loginForm, input[type="password"], input[name="WxCode"]'))`,
          );
          if (needsInput && window.webContents.getURL() === url)
            finish(new CampusAuthError('学校统一认证需要你完成登录或验证'));
        } else if (isJluTimetableUrl(url)) {
          await probeJluTimetable();
          finish();
        }
      } catch (error) {
        // 入口页可在脚本初始化时建立业务会话；只给明确的未认证结果有限等待。
        if (!(error instanceof CampusAuthError)) finish(error);
      } finally {
        checking = false;
      }
    };
    const timeout = setTimeout(
      () => finish(new Error('学校统一认证恢复超时，请稍后重试；本地课表未更新')),
      20000,
    );
    const interval = setInterval(() => void check(), 1000);
    window.webContents.on('did-finish-load', () => void check());
    window.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3)
        finish(new Error('无法连接学校统一认证，请检查网络或校园网/VPN'));
    });
    window.on('closed', () => finish(new Error('学校统一认证恢复已中断，请稍后重试')));
    void window.loadURL(JLU_TIMETABLE_URL).catch((error: unknown) => {
      if (!(error instanceof Error && error.message.includes('ERR_ABORTED')))
        finish(new Error('无法连接学校统一认证，请检查网络或校园网/VPN'));
    });
  });
}
