import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  windows: [] as unknown[],
  url: '',
  needsInput: false,
  load: vi.fn<() => Promise<void>>(),
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
      getURL: () => mock.url,
      executeJavaScript: vi.fn(async () => mock.needsInput),
    });
    constructor(readonly options: unknown) {
      super();
      mock.windows.push(this);
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
  CampusAuthError: class CampusAuthError extends Error {},
  CAMPUS_PARTITION: 'persist:jlu-campus',
  getCampusSession: vi.fn(async () => ({})),
}));
vi.mock('../jlu', async (original) => ({
  ...(await original<typeof import('../jlu')>()),
  probeJluTimetable: vi.fn(async () => {}),
}));
import { CampusAuthError } from '../../campus';
import { probeJluTimetable } from '../jlu';
import { restoreJluTimetableSession } from '../auth';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.windows = [];
  mock.url = 'https://iedu.jlu.edu.cn/jwapp/sys/wdkb/*default/index.do';
  mock.needsInput = false;
  mock.load.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it('restores through a hidden school window using the existing persistent session', async () => {
  await expect(restoreJluTimetableSession()).resolves.toBeUndefined();
  expect(mock.windows[0]).toMatchObject({
    options: {
      show: false,
      webPreferences: {
        partition: 'persist:jlu-campus',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
    destroyed: true,
  });
  expect(probeJluTimetable).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('requires human action only after finding an interactive form on the official CAS login page', async () => {
  mock.url = 'https://cas.jlu.edu.cn/tpass/login?service=iedu';
  mock.needsInput = true;
  await expect(restoreJluTimetableSession()).rejects.toBeInstanceOf(CampusAuthError);
  expect(probeJluTimetable).not.toHaveBeenCalled();
  expect(mock.windows[0]).toMatchObject({ destroyed: true });
  expect(vi.getTimerCount()).toBe(0);
});

it('reports network and schema failures without classifying them as human authentication', async () => {
  mock.load.mockRejectedValueOnce(new Error('ERR_CONNECTION_FAILED'));
  await expect(restoreJluTimetableSession()).rejects.not.toBeInstanceOf(CampusAuthError);
  vi.mocked(probeJluTimetable).mockRejectedValueOnce(new Error('课表字段变化'));
  await expect(restoreJluTimetableSession()).rejects.toThrow('课表字段变化');
  expect(vi.getTimerCount()).toBe(0);
});

it('allows the school page to establish its business session after navigation', async () => {
  vi.mocked(probeJluTimetable).mockRejectedValueOnce(new CampusAuthError('尚未认证'));
  const result = restoreJluTimetableSession();
  await vi.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toBeUndefined();
  expect(probeJluTimetable).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('ends an inconclusive restoration at its deadline without asking the user to log in', async () => {
  mock.url = 'https://cas.jlu.edu.cn/tpass/login';
  const result = restoreJluTimetableSession().catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(20000);
  const error = await result;
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(CampusAuthError);
  expect((error as Error).message).toContain('超时');
  expect(mock.windows[0]).toMatchObject({ destroyed: true });
  expect(vi.getTimerCount()).toBe(0);
});
