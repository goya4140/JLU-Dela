// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DelaApi } from '../../../shared/api';
import type { TimetableState } from '../../../shared/timetable';
import { AcademicConnection } from './AcademicConnection';

const snapshot: TimetableState = {
  semester: '2026-2027-1',
  lastSyncedAt: '2026-10-30T14:35:35.000Z',
  semesterStart: '2026-09-14',
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let api: DelaApi['timetable'];
const onSuccess = vi.fn();
const onBusyChange = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api = {
    getState: vi.fn(async () => snapshot),
    connect: vi.fn(async () => ({ ok: true })),
    syncNow: vi.fn(async () => ({ ok: true })),
  } as unknown as DelaApi['timetable'];
  window.dela = { timetable: api } as DelaApi;
  onSuccess.mockClear();
  onBusyChange.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete window.dela;
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(<AcademicConnection onSuccess={onSuccess} onBusyChange={onBusyChange} />),
  );
const click = (text: string) =>
  act(async () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === text)!.click(),
  );
const status = () => host.querySelector('[aria-label="本次教务操作"]')!.textContent;

it('reads cached timetable availability without claiming a valid login or contacting the school', async () => {
  await render();
  expect(host.textContent).toContain('已有课表可查看');
  expect(host.textContent).toContain('上次课表更新');
  expect(status()).toContain('尚未检查本次连接');
  expect(api.connect).not.toHaveBeenCalled();
  expect(api.syncNow).not.toHaveBeenCalled();
});

it('keeps a cached timetable visible after 403 and never opens authentication automatically', async () => {
  vi.mocked(api.syncNow).mockResolvedValue({ ok: false, error: '吉大教务拒绝访问（403）' });
  await render();
  await click('同步课表');
  expect(host.textContent).toContain('已有课表可查看');
  expect(host.textContent).toContain('上次课表更新');
  expect(host.textContent).toContain('访问被拒绝（403）');
  expect(status()).toBe('本次教务操作未完成');
  expect(api.connect).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it('distinguishes verified school authentication from a failed subsequent timetable update', async () => {
  vi.mocked(api.syncNow).mockResolvedValueOnce({ ok: false, error: '吉大教务拒绝访问（403）' });
  await render();
  await click('打开教务认证');
  expect(api.connect).toHaveBeenCalledOnce();
  expect(api.syncNow).toHaveBeenCalledOnce();
  expect(status()).toBe('学校认证已通过，但本次课表未更新');
  expect(host.textContent).toContain('已有课表可查看');
  expect(host.textContent).not.toContain('登录失败');
  expect(onSuccess).not.toHaveBeenCalled();
});

it('refreshes cache metadata and clears the previous failure only after a successful update', async () => {
  vi.mocked(api.syncNow).mockResolvedValueOnce({
    ok: false,
    reason: 'auth',
    error: '需要学校验证',
  });
  await render();
  await click('同步课表');
  expect(api.connect).not.toHaveBeenCalled();
  expect(host.textContent).toContain('微信认证');
  vi.mocked(api.getState).mockResolvedValue({
    ...snapshot,
    lastSyncedAt: '2026-10-31T10:00:00.000Z',
  });
  await click('打开教务认证');
  expect(status()).toBe('本次课表已更新');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain(new Date('2026-10-31T10:00:00.000Z').toLocaleString());
  expect(onSuccess).toHaveBeenCalledOnce();
});

it('allows cancellation without syncing and unlocks the other configuration steps', async () => {
  let finish!: (value: { ok: false; error: string }) => void;
  vi.mocked(api.connect).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await click('打开教务认证');
  expect(status()).toContain('正在等待学校认证');
  expect([...host.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(async () => finish({ ok: false, error: '未完成登录' }));
  expect(api.syncNow).not.toHaveBeenCalled();
  expect(host.textContent).toContain('已有课表可查看');
  expect([...host.querySelectorAll('button')].every((button) => !button.disabled)).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it('does not present an unavailable local record as a confirmed empty timetable', async () => {
  vi.mocked(api.getState).mockRejectedValue(new Error('disk read failed'));
  await render();
  expect(host.textContent).toContain('本机课表状态暂时无法读取');
  expect(host.textContent).not.toContain('尚无本机课表');
  expect(api.connect).not.toHaveBeenCalled();
});
