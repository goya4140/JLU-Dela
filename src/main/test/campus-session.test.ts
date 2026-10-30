import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cookie } from 'electron';

const state = vi.hoisted(() => ({
  directory: '',
  cookies: [] as Cookie[],
  changed: undefined as
    undefined | ((event: unknown, cookie: Cookie, cause: string, removed: boolean) => void),
  set: vi.fn(async (_cookie: unknown) => {}),
  flush: vi.fn(async () => {}),
  encrypt: vi.fn((value: string) => Buffer.from(`test-sealed:${value}`)),
}));
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: state.encrypt,
    decryptString: (value: Buffer) => value.toString().slice('test-sealed:'.length),
  },
  session: {
    fromPartition: (partition: string) => {
      expect(partition).toBe('persist:jlu-campus');
      return {
        cookies: {
          get: async () => state.cookies,
          set: state.set,
          flushStore: state.flush,
          on: (_event: string, listener: typeof state.changed) => {
            state.changed = listener;
          },
        },
        flushStorageData: () => {},
      };
    },
  },
}));
vi.mock('../ipc', () => ({ attachContextMenu: vi.fn() }));
const cookie = (domain: string, name = 'fixture'): Cookie => ({
  name,
  value: 'test-only-cookie',
  domain,
  path: '/',
  secure: true,
  httpOnly: true,
  hostOnly: true,
  session: true,
  sameSite: 'lax',
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.directory = mkdtempSync(join(tmpdir(), 'jlu-campus-session-test-'));
  state.cookies = [];
});
afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

it('encrypts JLU CAS session cookies and excludes other schools and lookalike domains', async () => {
  const { getCampusSession, flushCampusSession } = await import('../campus');
  await getCampusSession();
  for (const domain of [
    'cas.jlu.edu.cn',
    'iedu.jlu.edu.cn',
    'jlu.edu.cn.evil.example',
    'i.sjtu.edu.cn',
  ]) {
    state.changed!({}, cookie(domain, domain), 'explicit', false);
  }
  await flushCampusSession();
  const encrypted = readFileSync(join(state.directory, 'campus-session.bin')).toString();
  expect(encrypted.startsWith('test-sealed:')).toBe(true);
  const saved = JSON.parse(encrypted.slice('test-sealed:'.length)) as Cookie[];
  expect(saved.map((item) => item.domain)).toEqual(['cas.jlu.edu.cn', 'iedu.jlu.edu.cn']);
  expect(state.flush).toHaveBeenCalledOnce();
});

it('restores only JLU session cookies, without replacing a current browser cookie', async () => {
  state.cookies = [cookie('iedu.jlu.edu.cn')];
  writeFileSync(
    join(state.directory, 'campus-session.bin'),
    `test-sealed:${JSON.stringify([
      cookie('iedu.jlu.edu.cn'),
      cookie('cas.jlu.edu.cn'),
      cookie('jlu.edu.cn.evil.example'),
    ])}`,
  );
  const { getCampusSession } = await import('../campus');
  await getCampusSession();
  expect(state.set).toHaveBeenCalledOnce();
  expect(state.set).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://cas.jlu.edu.cn/', value: 'test-only-cookie' }),
  );
});

it('reports a session persistence failure rather than claiming the login was saved', async () => {
  const { getCampusSession, flushCampusSession } = await import('../campus');
  await getCampusSession();
  state.encrypt.mockImplementationOnce(() => {
    throw new Error('test unavailable keychain');
  });
  state.changed!({}, cookie('cas.jlu.edu.cn'), 'explicit', false);
  await expect(flushCampusSession()).rejects.toThrow('保存失败');
});
