import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  kernel: '24.6.0',
  handlers: new Map<string, (event: unknown) => unknown>(),
  check: vi.fn(),
  exec: vi.fn((...args: unknown[]) => (args.at(-1) as (error: null) => void)(null)),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (event: unknown) => unknown) =>
      mocks.handlers.set(name, handler),
  },
}));
vi.mock('node:os', () => ({ release: () => mocks.kernel }));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
vi.mock('../../ipc', () => ({ checkWorkspaceSender: mocks.check }));
import type { BrowserWindow, WebContents } from 'electron';
import {
  canCaptureWechatWindow,
  configureWechatMirror,
  getWechatMirrorSupport,
  registerWechatMirrorIpc,
} from '../mirror';

let window: BrowserWindow;
let contents: WebContents;
let session: { setDisplayMediaRequestHandler: ReturnType<typeof vi.fn> };
let nextId = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.kernel = '24.6.0';
  mocks.handlers.clear();
  session = { setDisplayMediaRequestHandler: vi.fn() };
  contents = Object.assign(new EventEmitter(), {
    id: ++nextId,
    session,
    send: vi.fn(),
    isDestroyed: () => false,
  }) as unknown as WebContents;
  window = Object.assign(new EventEmitter(), { webContents: contents }) as unknown as BrowserWindow;
  registerWechatMirrorIpc();
});
afterEach(() => {
  contents.emit('destroyed');
});
const invoke = (name: string) => mocks.handlers.get(`wechat:${name}`)!({ sender: contents });

describe.skipIf(process.platform !== 'darwin')('微信原窗口镜像', () => {
  it('只在显式准备后允许当前主窗口捕获，停止后立刻撤回', () => {
    expect(canCaptureWechatWindow(contents)).toBe(false);
    invoke('prepare');
    expect(mocks.check).toHaveBeenCalledWith({ sender: contents });
    expect(canCaptureWechatWindow(contents)).toBe(true);
    expect(canCaptureWechatWindow(null)).toBe(false);
    expect(canCaptureWechatWindow({ id: contents.id + 1 } as WebContents)).toBe(false);
    invoke('stop');
    expect(canCaptureWechatWindow(contents)).toBe(false);
  });
  it('使用系统选择器，不自动选择桌面或窗口；系统选择器不可用时拒绝回退', () => {
    configureWechatMirror(window);
    const [fallback, options] = session.setDisplayMediaRequestHandler.mock.calls[0]!;
    expect(options).toEqual({ useSystemPicker: true });
    const callback = vi.fn();
    fallback({}, callback);
    expect(callback).toHaveBeenCalledWith(null);
  });
  it('隐藏或重载工作台会停止镜像，子框架导航不影响主窗口', () => {
    configureWechatMirror(window);
    invoke('prepare');
    contents.emit('did-start-navigation', {}, '', false, false);
    expect(canCaptureWechatWindow(contents)).toBe(true);
    window.emit('hide');
    expect(contents.send).toHaveBeenCalledWith('wechat:stop');
    expect(canCaptureWechatWindow(contents)).toBe(false);
    invoke('prepare');
    contents.emit('did-start-navigation', {}, '', false, true);
    expect(canCaptureWechatWindow(contents)).toBe(false);
  });
  it('旧系统不给出可用的镜像入口；不可信调用不能获得捕获权限', () => {
    mocks.kernel = '23.6.0';
    expect(getWechatMirrorSupport().supported).toBe(false);
    expect(() => invoke('prepare')).toThrow('macOS 15');
    configureWechatMirror(window);
    expect(session.setDisplayMediaRequestHandler).not.toHaveBeenCalled();
    mocks.kernel = '24.6.0';
    mocks.check.mockImplementationOnce(() => {
      throw new Error('不允许的调用来源');
    });
    expect(() => invoke('prepare')).toThrow('不允许');
    expect(canCaptureWechatWindow(contents)).toBe(false);
  });
  it('仅通过系统启动现有微信，不注入代码或创建第二个登录客户端', async () => {
    await invoke('open-native');
    expect(mocks.exec.mock.calls[0]!.slice(0, 2)).toEqual([
      '/usr/bin/open',
      ['-b', 'com.tencent.xinWeChat'],
    ]);
    expect([...mocks.handlers.keys()].sort()).toEqual([
      'wechat:get-support',
      'wechat:open-native',
      'wechat:prepare',
      'wechat:stop',
    ]);
  });
});
