import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => state.root, getAppPath: () => state.root },
  net: { fetch: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(async () => '') },
}));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    existsSync: (path: string) => (path === '/Applications/QQ.app' ? false : fs.existsSync(path)),
  };
});
vi.mock('node:child_process', () => ({
  execFile: vi.fn((command: string, args: string[], ...rest: unknown[]) => {
    if (command === '/bin/cp') cpSync(args[1]!, args[2]!, { recursive: true });
    (rest.at(-1) as (error: null, stdout: string, stderr: string) => void)(null, '', '');
  }),
}));
vi.mock('node:module', async (original) => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...(await original<typeof import('node:module')>()), createRequire: () => () => fs };
});
import { execFile } from 'node:child_process';
import { net } from 'electron';
import { launchQqRuntime, prepareQqRuntime, qqRuntimeVersion, verifyQqRuntime } from '../runtime';

beforeEach(() => {
  vi.clearAllMocks();
  state.root = mkdtempSync(join(tmpdir(), 'dela-qq-runtime-test-'));
});
afterEach(() => rmSync(state.root, { recursive: true, force: true }));

describe.skipIf(process.platform !== 'darwin')('QQ 共享会话', () => {
  it('仅准备可回退的安装包，管理员安装之前不修改原 QQ，也不启动第二个客户端', async () => {
    const source = join(state.root, 'Applications/QQ.app');
    const resources = join(source, 'Contents/Resources/app');
    mkdirSync(resources, { recursive: true });
    mkdirSync(join(source, 'Contents/Frameworks/QQ Helper.app'), { recursive: true });
    const original = JSON.stringify({ version: 'fixture-1', main: './application.asar/entry.js' });
    writeFileSync(join(resources, 'package.json'), original);
    mkdirSync(join(state.root, 'out/main'), { recursive: true });
    writeFileSync(join(state.root, 'out/main/qq-shared-loader.cjs'), 'fixture loader');
    const shared = join(state.root, 'Library/Containers/com.tencent.qq/Data/Documents/Dela-QQ');
    mkdirSync(join(shared, `framework-${qqRuntimeVersion}`), { recursive: true });
    writeFileSync(join(shared, `framework-${qqRuntimeVersion}/napcat.cjs`), 'fixture framework');
    const prepared = await prepareQqRuntime(new AbortController().signal, () => {});
    expect(prepared.installed).toBe(false);
    expect(prepared.executable).toBe(source);
    expect(readFileSync(join(resources, 'package.json'), 'utf8')).toBe(original);
    expect(JSON.parse(readFileSync(join(shared, 'bootstrap.json'), 'utf8'))).toEqual({
      originalMain: './application.asar/entry.js',
      bridge: join(shared, `framework-${qqRuntimeVersion}`),
      workdir: prepared.connection.workdir,
    });
    const staged = join(state.root, 'qq/shared/QQ.app');
    const install = readFileSync(join(state.root, 'qq/shared/install.command'), 'utf8');
    expect(install).toContain('/usr/bin/pgrep -x QQ');
    expect(install).toContain('/usr/bin/cmp -s');
    expect(install).toContain('sudo /bin/sh -c');
    expect(install).toContain('original-');
    expect(existsSync(join(state.root, 'qq/shared/restore.command'))).toBe(true);
    expect(vi.mocked(execFile).mock.calls.map((call) => call[1])).toEqual([
      ['-cR', source, staged],
      ['--force', '--sign', '-', join(staged, 'Contents/Frameworks/QQ Helper.app')],
      ['--force', '--sign', '-', staged],
    ]);
    expect(net.fetch).not.toHaveBeenCalled();
    await expect(launchQqRuntime(prepared)).rejects.toThrow('请先安装');

    cpSync(join(staged, 'Contents/Resources/app/package.json'), join(resources, 'package.json'));
    const reconnected = await prepareQqRuntime(new AbortController().signal, () => {});
    expect(reconnected.installed).toBe(true);
    expect(reconnected.connection).toEqual(prepared.connection);
    const config = JSON.parse(
      readFileSync(join(prepared.connection.workdir, 'config/onebot11.json'), 'utf8'),
    );
    expect(config.network.httpServers[0]).toMatchObject({
      host: '127.0.0.1',
      token: prepared.connection.token,
      enableCors: false,
    });
    expect(
      new Set([
        prepared.connection.apiPort,
        prepared.connection.wsPort,
        prepared.connection.webPort,
      ]).size,
    ).toBe(3);
    expect(await launchQqRuntime(reconnected)).toEqual(prepared.connection);
    expect(vi.mocked(execFile).mock.calls.at(-1)![1]).toEqual(['-a', source]);

    writeFileSync(join(state.root, 'out/main/qq-shared-loader.cjs'), 'fixed loader');
    await prepareQqRuntime(new AbortController().signal, () => {});
    expect(readFileSync(join(shared, 'loader.cjs'), 'utf8')).toBe('fixed loader');
    const bootstrap = readFileSync(join(shared, 'bootstrap.json'), 'utf8');
    writeFileSync(
      join(resources, 'package.json'),
      JSON.stringify({ version: 'fixture-1', main: '../../another-profile/loader.cjs' }),
    );
    vi.clearAllMocks();
    await expect(prepareQqRuntime(new AbortController().signal, () => {})).rejects.toThrow(
      '请先恢复腾讯原版 QQ',
    );
    expect(readFileSync(join(shared, 'bootstrap.json'), 'utf8')).toBe(bootstrap);
    expect(execFile).not.toHaveBeenCalled();
  });
});

it('拒绝被替换或损坏的运行组件', () => {
  expect(() => verifyQqRuntime(new TextEncoder().encode('corrupt archive'))).toThrow('校验失败');
});
