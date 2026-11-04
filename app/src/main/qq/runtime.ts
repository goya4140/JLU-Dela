import { app, dialog, net, shell } from 'electron';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import extract from 'extract-zip';
import { z } from 'zod';
import runtimeLicenses from './runtime-licenses.txt?raw';

export const qqRuntimeVersion = '4.18.42';
export const qqRuntimeSha256 = '118d66bb4849b7fcec05a4cafc9e33ed44f9236d56661f7097aba2ab3081df2e';
const exec = promisify(execFile);
const nativeFs = createRequire(join(app.getAppPath(), 'package.json'))(
  'original-fs',
) as typeof import('node:fs');
const connectionSchema = z.object({
  apiPort: z.number().int().min(1).max(65535),
  wsPort: z.number().int().min(1).max(65535),
  webPort: z.number().int().min(1).max(65535),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  workdir: z.string(),
});
export interface PreparedQqRuntime {
  executable: string;
  sourceVersion: string;
  installed: boolean;
  connection: z.infer<typeof connectionSchema>;
}
export type ManagedQqRuntime = z.infer<typeof connectionSchema>;

function runtimeRoot(): string {
  return join(app.getPath('userData'), 'qq/shared');
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function verifyQqRuntime(bytes: Uint8Array): void {
  if (createHash('sha256').update(bytes).digest('hex') !== qqRuntimeSha256)
    throw new Error('QQ 组件校验失败，请重试下载');
}

export async function prepareQqRuntime(
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<PreparedQqRuntime> {
  if (process.platform !== 'darwin')
    throw new Error('同账号共享会话目前仅适配 macOS；Windows 版本尚未完成验证');
  const root = runtimeRoot();
  const candidates = ['/Applications/QQ.app', join(app.getPath('home'), 'Applications/QQ.app')];
  let source = candidates.find((candidate) => existsSync(candidate));
  if (!source) {
    const choice = await dialog.showOpenDialog({
      title: '选择本机 QQ',
      message: '请选择你平时使用的 QQ。Dela 将为它准备共享会话组件。',
      properties: ['openFile'],
    });
    source = choice.filePaths[0];
    if (!source || choice.canceled) throw new Error('请先选择本机 QQ');
  }
  const packagePath = join(source, 'Contents/Resources/app/package.json');
  const original = await readFile(packagePath, 'utf8');
  const info = z
    .object({ version: z.string(), main: z.string() })
    .passthrough()
    .parse(JSON.parse(original));
  const shared = join(
    app.getPath('home'),
    'Library/Containers/com.tencent.qq/Data/Documents/Dela-QQ',
  );
  const loader = join(shared, 'loader.cjs');
  const main = relative(dirname(packagePath), loader);
  const installed = info.main === main;
  const bootstrap = join(shared, 'bootstrap.json');
  const originalMain = installed
    ? z.object({ originalMain: z.string() }).parse(JSON.parse(await readFile(bootstrap, 'utf8')))
        .originalMain
    : info.main;
  const archive = join(dirname(packagePath), 'application.asar');
  if (!resolve(dirname(packagePath), originalMain).startsWith(`${archive}${sep}`))
    throw new Error('QQ 启动入口已被其他共享组件修改，请先恢复腾讯原版 QQ，再准备安装');
  const bridge = join(shared, `framework-${qqRuntimeVersion}`);
  const workdir = join(shared, 'data');
  const connectionPath = join(root, 'connection.json');
  signal.throwIfAborted();
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(shared, { recursive: true, mode: 0o700 });
  let connection: z.infer<typeof connectionSchema>;
  if (existsSync(connectionPath)) {
    connection = connectionSchema.parse(JSON.parse(await readFile(connectionPath, 'utf8')));
  } else {
    const ports: number[] = [];
    const reservations = [];
    try {
      for (let index = 0; index < 3; index++) {
        const server = createServer();
        reservations.push(server);
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('无法分配 QQ 连接端口');
        ports.push(address.port);
      }
    } finally {
      await Promise.all(
        reservations.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    }
    const [apiPort, wsPort, webPort] = ports as [number, number, number];
    connection = { apiPort, wsPort, webPort, token: randomBytes(32).toString('hex'), workdir };
    await mkdir(join(workdir, 'config'), { recursive: true, mode: 0o700 });
    await writeFile(
      join(workdir, 'config/webui.json'),
      JSON.stringify({ host: '127.0.0.1', port: webPort, token: connection.token, loginRate: 30 }),
      { mode: 0o600 },
    );
    await writeFile(
      join(workdir, 'config/onebot11.json'),
      JSON.stringify({
        network: {
          httpServers: [
            {
              name: 'dela-http',
              enable: true,
              host: '127.0.0.1',
              port: apiPort,
              token: connection.token,
              enableCors: false,
            },
          ],
          websocketServers: [
            {
              name: 'dela-ws',
              enable: true,
              host: '127.0.0.1',
              port: wsPort,
              token: connection.token,
              reportSelfMessage: true,
              messagePostFormat: 'array',
            },
          ],
          httpClients: [],
          websocketClients: [],
        },
        musicSignUrl: '',
        enableLocalFile2Url: false,
        parseMultMsg: false,
      }),
      { mode: 0o600 },
    );
    await writeFile(connectionPath, JSON.stringify(connection), { mode: 0o600 });
  }
  if (!existsSync(join(bridge, 'napcat.cjs'))) {
    progress('正在下载 QQ 共享组件（约 35 MB）…');
    const response = await net.fetch(
      `https://github.com/NapNeko/NapCatQQ/releases/download/v${qqRuntimeVersion}/NapCat.Framework.zip`,
      { signal },
    );
    if (!response.ok) throw new Error(`QQ 组件下载失败（${response.status}），请检查网络后重试`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    verifyQqRuntime(bytes);
    const archive = join(root, 'framework.zip');
    const staging = join(shared, 'framework-extract');
    await writeFile(archive, bytes);
    await rm(staging, { recursive: true, force: true });
    try {
      await extract(archive, { dir: staging });
      signal.throwIfAborted();
      await rm(bridge, { recursive: true, force: true });
      await rename(staging, bridge);
      await writeFile(join(bridge, 'DELA-LICENSES.txt'), runtimeLicenses);
    } finally {
      await rm(archive, { force: true });
      await rm(staging, { recursive: true, force: true });
    }
  }
  const nextLoader = join(shared, `loader-${randomBytes(4).toString('hex')}.cjs`);
  await copyFile(join(app.getAppPath(), 'out/main/qq-shared-loader.cjs'), nextLoader);
  await rename(nextLoader, loader);
  if (!installed) {
    progress('正在准备共享会话安装包…');
    const staged = join(root, 'QQ.app');
    await nativeFs.promises.rm(staged, { recursive: true, force: true });
    await exec('/bin/cp', ['-cR', source, staged], { signal });
    await writeFile(bootstrap, JSON.stringify({ originalMain, bridge, workdir }), { mode: 0o600 });
    await writeFile(join(root, 'original-package.json'), original);
    await writeFile(
      join(staged, 'Contents/Resources/app/package.json'),
      JSON.stringify({ ...info, main }),
    );
    for (const name of await readdir(join(staged, 'Contents/Frameworks'))) {
      if (name.startsWith('QQ Helper') && name.endsWith('.app'))
        await exec(
          '/usr/bin/codesign',
          ['--force', '--sign', '-', join(staged, 'Contents/Frameworks', name)],
          { signal },
        );
    }
    await exec('/usr/bin/codesign', ['--force', '--sign', '-', staged], { signal });
    const backup = join(
      root,
      `original-${createHash('sha256').update(original).digest('hex').slice(0, 12)}-${randomBytes(4).toString('hex')}.app`,
    );
    const install = `/bin/mv ${quote(source)} ${quote(backup)}\nif ! /bin/mv ${quote(staged)} ${quote(source)}; then\n/bin/mv ${quote(backup)} ${quote(source)}\nexit 1\nfi`;
    const restore = `/bin/mv ${quote(source)} ${quote(staged)}\nif ! /bin/mv ${quote(backup)} ${quote(source)}; then\n/bin/mv ${quote(staged)} ${quote(source)}\nexit 1\nfi`;
    const header =
      '#!/bin/zsh\nset -eu\nif /usr/bin/pgrep -x QQ >/dev/null; then\necho "请先完全退出 QQ，然后重新运行。"\nread -k 1\nexit 1\nfi\n';
    await writeFile(
      join(root, 'install.command'),
      `${header}echo '将为现有 QQ 安装 Dela 共享会话组件，并保留完整原版备份。需要本机管理员密码。'\n/usr/bin/cmp -s ${quote(packagePath)} ${quote(join(root, 'original-package.json'))} || { echo 'QQ 已更新，请回到 Dela 重新准备'; exit 1; }\n/usr/bin/codesign --verify --deep --strict ${quote(staged)}\n[ ! -e ${quote(backup)} ]\nsudo /bin/sh -c ${quote(install)}\necho '安装完成。回到 Dela 点击连接 QQ。'\nread -k 1\n`,
      { mode: 0o700 },
    );
    await writeFile(
      join(root, 'restore.command'),
      `${header}[ -d ${quote(backup)} ]\n[ ! -e ${quote(staged)} ]\nsudo /bin/sh -c ${quote(restore)}\necho '已恢复原版 QQ。'\nread -k 1\n`,
      { mode: 0o700 },
    );
  }
  return { executable: source, sourceVersion: info.version, installed, connection };
}

export async function openQqInstaller(): Promise<void> {
  const error = await shell.openPath(join(runtimeRoot(), 'install.command'));
  if (error) throw new Error(`无法打开 QQ 安装器：${error}`);
}

export async function launchQqRuntime(prepared: PreparedQqRuntime): Promise<ManagedQqRuntime> {
  if (!prepared.installed) throw new Error('请先安装 QQ 共享会话组件');
  await exec('/usr/bin/open', ['-a', prepared.executable]);
  return prepared.connection;
}
