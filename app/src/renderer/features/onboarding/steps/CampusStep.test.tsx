// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { DelaApi } from '../../../../shared/api';
import { CampusStep } from './CampusStep';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));

it('configures mail after cancelled academic authentication inside the campus step and returns with a connected state without navigating away', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let connected = false;
  let finish!: (result: { ok: true }) => void;
  const configure = vi.fn(
    () =>
      new Promise<{ ok: true }>((resolve) => {
        finish = resolve;
      }),
  );
  const syncNow = vi.fn(async () => {});
  window.dela = {
    timetable: {
      getState: async () => ({ lastSyncedAt: '2026-10-30T14:35:35.000Z' }),
      connect: vi.fn(async () => ({ ok: false, error: '未完成登录' })),
      syncNow: vi.fn(),
    },
    jluPlatforms: { getNotices: async () => null, getLearning: async () => null },
    chaoxing: { courses: async () => null },
    mail: {
      getState: async () => ({
        account: connected ? { address: 'student@mails.jlu.edu.cn', lastSyncedAt: null } : null,
      }),
      configure,
      syncNow,
    },
  } as unknown as DelaApi;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onDone = vi.fn(),
    onBusy = vi.fn();
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)!;
  try {
    await act(async () => root.render(<CampusStep onDone={onDone} onBusyChange={onBusy} />));
    expect(host.textContent).not.toContain('依次连接吉大平台');
    await act(async () => button('打开教务认证').click());
    expect(host.querySelector('[data-platform="academic"]')?.textContent).toContain(
      '已有课表可查看',
    );
    expect(window.dela!.timetable.syncNow).not.toHaveBeenCalled();
    await act(async () => button('打开邮箱').click());
    expect(host.textContent).toContain('连接吉大邮箱');
    expect(host.querySelector('input[placeholder="name@mails.jlu.edu.cn"]')).not.toBeNull();
    await act(async () => {
      for (const [selector, value] of [
        ['input[type=email]', 'student@mails.jlu.edu.cn'],
        ['input[type=password]', 'fixture-password'],
      ]) {
        const input = host.querySelector<HTMLInputElement>(selector!)!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(configure).toHaveBeenCalledWith({
      address: 'student@mails.jlu.edu.cn',
      password: 'fixture-password',
    });
    expect(button('返回校园连接').disabled).toBe(true);
    expect(onBusy).toHaveBeenLastCalledWith(true);
    connected = true;
    await act(async () => finish({ ok: true }));
    expect(onBusy).toHaveBeenLastCalledWith(false);
    expect(syncNow).toHaveBeenCalledOnce();
    await act(async () => button('已连接，返回校园连接').click());
    expect(host.querySelector('[data-platform="mail"]')?.textContent).toContain('已连接');
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => button('下一步').click());
    expect(onDone).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    delete window.dela;
    vi.unstubAllGlobals();
  }
});
