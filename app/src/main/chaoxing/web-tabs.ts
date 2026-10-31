import { BrowserWindow, WebContentsView, dialog, ipcMain, shell } from 'electron';
import { attachContextMenu, checkWorkspaceSender } from '../ipc';
import { cachedWorkEntry, resolveWorkEntry, saveWorkTiming } from './api';
import { chaoxingSession, isChaoxingLoginUrl } from './session';
import {
  workTargetOf,
  webTabBoundsSchema,
  webTabCommandSchema,
  webTabIdSchema,
  type WebTabBounds,
  type WebTabState,
} from '../../shared/web-tabs';
import { chaoxingDetailTimingScript } from '../../shared/chaoxing-collectors';

function schoolUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'chaoxing.com' || url.hostname.endsWith('.chaoxing.com'))
    );
  } catch {
    return false;
  }
}
type Page = {
  owner: BrowserWindow;
  view: WebContentsView;
  state: WebTabState;
  needsRecovery: boolean;
  externalUrl?: string;
  closing?: Promise<boolean>;
  closed?: (value: boolean) => void;
};
const pages = new Map<string, Page>();
const pending = new Map<string, Promise<Page>>();
const owners = new WeakSet<BrowserWindow>();
const positions = new Map<string, WebTabBounds | null>();
const keyOf = (owner: BrowserWindow, tabId: string) => `${owner.id}:${tabId}`;
function emit(page: Page) {
  if (!page.owner.isDestroyed()) page.owner.webContents.send('web-tabs:state', page.state);
  return page.state;
}
function place(page: Page) {
  const bounds = positions.get(keyOf(page.owner, page.state.tabId));
  const visible = !!bounds && bounds.width > 0 && bounds.height > 0;
  if (bounds && visible) {
    const zoom = page.owner.webContents.getZoomFactor();
    const size = page.owner.getContentBounds();
    const { width, height } = size;
    const x = Math.min(width, Math.round(bounds.x * zoom));
    const y = Math.min(height, Math.round(bounds.y * zoom));
    page.view.setBounds({
      x,
      y,
      width: Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom))),
      height: Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom))),
    });
  }
  page.view.setVisible(visible);
}
async function timing(page: Page) {
  const target = workTargetOf(page.state.tabId)!;
  for (const frame of page.view.webContents.mainFrame.framesInSubtree) {
    if (!schoolUrl(frame.url)) continue;
    const url = new URL(frame.url);
    if ((url.searchParams.get('workId') ?? url.searchParams.get('workid')) !== target.workId)
      continue;
    const value: unknown = await frame.executeJavaScript(chaoxingDetailTimingScript);
    if (
      typeof value === 'string' &&
      value.length <= 1800 &&
      saveWorkTiming(target.courseId, target.workId, value)
    ) {
      page.state.error = null;
      page.state.timing = value;
      emit(page);
      return true;
    }
  }
  return false;
}
async function recover(page: Page, force: boolean) {
  const target = workTargetOf(page.state.tabId)!;
  page.state.error = null;
  page.state.loading = true;
  emit(page);
  let entry = cachedWorkEntry(target.courseId, target.workId);
  try {
    entry = await resolveWorkEntry(target.courseId, target.workId, force);
  } catch {
    page.state.error =
      '暂时未能更新作业入口。可在下方原网页登录或进入课程作业，再点“恢复作业入口”。网络错误不会清除登录。';
  }
  if (page.view.webContents.isDestroyed()) return;
  page.state.title = entry.title;
  try {
    await page.view.webContents.loadURL(entry.url);
  } catch {
    page.state.loading = false;
    emit(page);
  }
}
async function createPage(owner: BrowserWindow, tabId: string): Promise<Page> {
  const target = workTargetOf(tabId)!;
  const entry = cachedWorkEntry(target.courseId, target.workId);
  const view = new WebContentsView({
    webPreferences: {
      session: await chaoxingSession.get(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const page: Page = {
    owner,
    view,
    state: {
      tabId,
      title: entry.title,
      origin: '',
      loading: true,
      back: false,
      forward: false,
      error: null,
      timing: null,
    },
    needsRecovery: false,
  };
  const key = keyOf(owner, tabId);
  if (owner.isDestroyed()) {
    view.webContents.close();
    throw new Error('工作台窗口已关闭');
  }
  pages.set(key, page);
  owner.contentView.addChildView(view);
  place(page);
  const contents = view.webContents;
  attachContextMenu(contents);
  contents.setWindowOpenHandler(({ url }) => {
    if (schoolUrl(url)) void contents.loadURL(url).catch(() => {});
    else {
      try {
        const target = new URL(url);
        if (['https:', 'http:'].includes(target.protocol) && !target.username && !target.password)
          page.externalUrl = target.href;
      } catch {}
      page.state.error = '此链接不属于学习通，请使用“浏览器打开”继续查看。';
      emit(page);
    }
    return { action: 'deny' };
  });
  const guard = (event: Electron.Event, url: string) => {
    if (schoolUrl(url)) return;
    event.preventDefault();
    try {
      const target = new URL(url);
      if (['https:', 'http:'].includes(target.protocol) && !target.username && !target.password)
        page.externalUrl = target.href;
    } catch {}
    page.state.error = '此页面不属于学习通，已暂停跳转。可在浏览器中继续。';
    emit(page);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', (event, url, _inPlace, mainFrame) => {
    if (mainFrame) guard(event, url);
  });
  const update = () => {
    if (contents.isDestroyed()) return;
    const url = contents.getURL();
    page.state.origin = schoolUrl(url) ? new URL(url).hostname : '';
    page.state.loading = contents.isLoading();
    page.state.back = contents.navigationHistory.canGoBack();
    page.state.forward = contents.navigationHistory.canGoForward();
    if (isChaoxingLoginUrl(url)) page.needsRecovery = true;
    emit(page);
  };
  contents.on('did-start-loading', update);
  contents.on('did-navigate', () => {
    page.externalUrl = undefined;
    update();
  });
  contents.on('did-stop-loading', () => {
    update();
    if (
      page.needsRecovery &&
      schoolUrl(contents.getURL()) &&
      !isChaoxingLoginUrl(contents.getURL())
    ) {
      page.needsRecovery = false;
      void recover(page, true).catch(() => {
        page.state.error = '作业入口已变化，请返回学习通刷新课程作业列表。';
        emit(page);
      });
    } else void timing(page).catch(() => {});
  });
  contents.on('did-fail-load', (_event, code, _description, _url, main) => {
    if (!main || code === -3) return;
    page.state.error = `网页加载失败（${code}）。请检查网络后重试；若已登录，可点“恢复作业入口”。`;
    emit(page);
  });
  contents.on('render-process-gone', () => {
    page.state.error = '网页进程已退出，请重新加载。';
    emit(page);
  });
  contents.on('focus', () => {
    if (!owner.isDestroyed()) owner.webContents.send('web-tabs:focus', tabId);
  });
  contents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.meta || input.control) &&
      input.key.toLowerCase() === 'w'
    ) {
      event.preventDefault();
      owner.webContents.send('web-tabs:close-shortcut', tabId);
    }
  });
  contents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(owner, {
      type: 'warning',
      buttons: ['继续编辑', '离开页面'],
      defaultId: 0,
      cancelId: 0,
      title: '网页中可能有未提交的内容',
      message: '学习通提示当前页面尚未保存。确定离开吗？',
    });
    if (choice === 1) event.preventDefault();
    else {
      page.closed?.(false);
      page.closed = undefined;
      page.closing = undefined;
    }
  });
  contents.once('destroyed', () => {
    pages.delete(key);
    positions.delete(key);
    page.closed?.(true);
    if (!owner.isDestroyed()) owner.contentView.removeChildView(view);
  });
  if (!owners.has(owner)) {
    owners.add(owner);
    owner.once('closed', () => {
      for (const candidate of pages.values())
        if (candidate.owner === owner && !candidate.view.webContents.isDestroyed())
          candidate.view.webContents.close();
    });
    owner.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame)
        for (const candidate of pages.values())
          if (candidate.owner === owner) {
            positions.set(keyOf(owner, candidate.state.tabId), null);
            place(candidate);
          }
    });
  }
  void recover(page, false).catch(() => {
    page.state.error = '作业入口已变化，请返回学习通刷新课程作业列表。';
    emit(page);
  });
  return page;
}
async function getPage(owner: BrowserWindow, tabId: string) {
  const key = keyOf(owner, tabId);
  const existing = pages.get(key);
  if (existing) return existing;
  let creating = pending.get(key);
  if (!creating) {
    creating = createPage(owner, tabId).finally(() => pending.delete(key));
    pending.set(key, creating);
  }
  return creating;
}
function close(page: Page): Promise<boolean> {
  if (page.closing) return page.closing;
  page.closing = new Promise<boolean>((resolve) => {
    page.closed = resolve;
  });
  const result = page.closing;
  page.view.webContents.close({ waitForBeforeUnload: true });
  return result;
}
export function hasWebTabs() {
  return pages.size > 0 || pending.size > 0;
}
export async function closeAllWebTabs(): Promise<boolean> {
  await Promise.allSettled(pending.values());
  for (const page of pages.values()) if (!(await close(page))) return false;
  return true;
}
export function registerWebTabsIpc() {
  function ownerOf(event: Electron.IpcMainInvokeEvent, tabId: string) {
    checkWorkspaceSender(event);
    webTabIdSchema.parse(tabId);
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('工作台窗口已关闭');
    return owner;
  }
  ipcMain.handle('web-tabs:place', async (event, tabId: string, bounds: unknown) => {
    const owner = ownerOf(event, tabId);
    positions.set(keyOf(owner, tabId), webTabBoundsSchema.parse(bounds));
    const page = await getPage(owner, tabId);
    place(page);
    return emit(page);
  });
  ipcMain.handle('web-tabs:hide', (event, tabId: string) => {
    const owner = ownerOf(event, tabId);
    const key = keyOf(owner, tabId);
    positions.set(key, null);
    const page = pages.get(key);
    if (page) place(page);
  });
  ipcMain.handle('web-tabs:close', async (event, tabId: string) => {
    const owner = ownerOf(event, tabId);
    const key = keyOf(owner, tabId);
    const page = pages.get(key) ?? (await pending.get(key));
    return page ? close(page) : true;
  });
  ipcMain.handle('web-tabs:selection', async (event, tabId: string) => {
    const owner = ownerOf(event, tabId);
    const page = pages.get(keyOf(owner, tabId));
    if (!page) return '';
    for (const frame of page.view.webContents.mainFrame.framesInSubtree) {
      if (!schoolUrl(frame.url)) continue;
      const value: unknown = await frame.executeJavaScript(
        'window.getSelection()?.toString().slice(0, 12000) ?? ""',
      );
      if (typeof value === 'string' && value.trim()) return value.slice(0, 12000);
    }
    return '';
  });
  ipcMain.handle('web-tabs:command', async (event, tabId: string, raw: unknown) => {
    const owner = ownerOf(event, tabId);
    const command = webTabCommandSchema.parse(raw);
    const page = await getPage(owner, tabId);
    const contents = page.view.webContents;
    if (command === 'back' && contents.navigationHistory.canGoBack())
      contents.navigationHistory.goBack();
    if (command === 'forward' && contents.navigationHistory.canGoForward())
      contents.navigationHistory.goForward();
    if (command === 'reload') {
      page.state.error = null;
      contents.reload();
    }
    if (command === 'recover') await recover(page, true);
    if (command === 'external') {
      const url = page.externalUrl ?? contents.getURL();
      if (page.externalUrl || schoolUrl(url)) await shell.openExternal(url);
    }
    if (command === 'timing') {
      const read = await timing(page);
      if (!read) {
        page.state.error =
          '当前页面尚未读到明确截止日期。请进入这份作业的详情后再试，或直接查看原网页时间。';
      }
    }
    return emit(page);
  });
}
