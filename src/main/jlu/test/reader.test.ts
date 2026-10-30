import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  url: '',
  needsInput: false,
  window: undefined as unknown,
  load: vi.fn<() => Promise<void>>(),
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    destroyed = false;
    show = vi.fn();
    focus = vi.fn();
    webContents = Object.assign(new EventEmitter(), {
      getURL: () => mock.url,
      isLoadingMainFrame: () => false,
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn(async (script: string) =>
        script.startsWith('Boolean') ? mock.needsInput : { ready: true, data: { items: [] } },
      ),
    });
    constructor(readonly options: unknown) {
      super();
      mock.window = this;
    }
    static fromWebContents() {
      return {};
    }
    async loadURL() {
      await mock.load();
      this.webContents.emit('did-finish-load');
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  return { BrowserWindow: Window };
});
vi.mock('../../campus', () => ({
  CampusAuthError: class extends Error {},
  CAMPUS_PARTITION: 'persist:jlu-campus',
  getCampusSession: vi.fn(async () => ({})),
  flushCampusSession: vi.fn(async () => {}),
}));
import { CampusAuthError } from '../../campus';
import { readSchoolPage } from '../reader';
import type { WebContents } from 'electron';
const options = {
  url: 'https://oa.jlu.edu.cn/list',
  title: '学校通知',
  accepts: (url: URL) => url.origin === 'https://oa.jlu.edu.cn',
  script: 'collect()',
};
const window = () =>
  mock.window as {
    destroyed: boolean;
    options: unknown;
    show: ReturnType<typeof vi.fn>;
    webContents: {
      emit: (event: string, ...args: unknown[]) => void;
      executeJavaScript: ReturnType<typeof vi.fn>;
    };
  };
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.url = options.url;
  mock.needsInput = false;
  mock.load.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
it('waits for a replacement frame during the school authentication chain', async () => {
  mock.load.mockImplementationOnce(async () => {
    window().webContents.executeJavaScript.mockRejectedValueOnce(
      new Error('Render frame was disposed'),
    );
  });
  const result = readSchoolPage(options);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toEqual({ items: [] });
  expect(window().show).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('reports a forbidden school page as a service failure without showing login', async () => {
  mock.load.mockImplementationOnce(async () => {
    window().webContents.emit('did-navigate', {}, options.url, 403);
  });
  const error = await readSchoolPage(options).catch((error: unknown) => error);
  expect(error).not.toBeInstanceOf(CampusAuthError);
  expect((error as Error).message).toContain('403');
  expect(window().show).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('reads through an isolated persistent school session and closes its hidden window', async () => {
  await expect(readSchoolPage(options)).resolves.toEqual({ items: [] });
  expect(window()).toMatchObject({
    destroyed: true,
    options: {
      show: false,
      webPreferences: {
        partition: 'persist:jlu-campus',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
  });
  expect(window().show).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('shows a login window only when CAS requires input, then resumes reading after the user finishes', async () => {
  mock.url = 'https://cas.jlu.edu.cn/tpass/login';
  mock.needsInput = true;
  const result = readSchoolPage({ ...options, sender: {} as WebContents });
  await vi.advanceTimersByTimeAsync(0);
  expect(window().show).toHaveBeenCalledOnce();
  mock.url = options.url;
  window().webContents.emit('did-finish-load');
  await expect(result).resolves.toEqual({ items: [] });
  expect(vi.getTimerCount()).toBe(0);
});
it('reports confirmed manual authentication without a sender, but not network failures', async () => {
  mock.url = 'https://cas.jlu.edu.cn/tpass/login';
  mock.needsInput = true;
  await expect(readSchoolPage(options)).rejects.toBeInstanceOf(CampusAuthError);
  mock.load.mockRejectedValueOnce(new Error('ERR_CONNECTION_FAILED'));
  await expect(readSchoolPage(options)).rejects.not.toBeInstanceOf(CampusAuthError);
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds unknown redirects without pretending they require a password', async () => {
  mock.url = 'https://oa.jlu.edu.cn.evil.example/';
  const result = readSchoolPage(options).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(25000);
  expect(await result).not.toBeInstanceOf(CampusAuthError);
  expect(window().destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
