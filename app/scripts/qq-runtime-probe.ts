import { app } from 'electron';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const exec = promisify(execFile);

async function probe() {
  const shared = join(
    app.getPath('home'),
    'Library/Containers/com.tencent.qq/Data/Documents/Dela-QQ',
  );
  const config = z
    .object({
      host: z.literal('127.0.0.1'),
      port: z.number().int().min(1).max(65535),
      token: z.string(),
    })
    .parse(JSON.parse(await readFile(join(shared, 'data/config/webui.json'), 'utf8')));
  const base = `http://127.0.0.1:${config.port}`;
  const native = (await exec('/usr/bin/pgrep', ['-x', 'QQ'])).stdout.trim();
  if (!native || native.includes('\n')) throw new Error('请保持一个原生 QQ 进程运行后再验证');
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hash: createHash('sha256').update(`${config.token}.napcat`).digest('hex'),
    }),
    signal: AbortSignal.timeout(5000),
  });
  const auth = z
    .object({ code: z.literal(0), data: z.object({ Credential: z.string().min(1) }) })
    .parse(await response.json());
  for (let sample = 0; sample < 10; sample++) {
    const status = await fetch(`${base}/api/QQLogin/CheckLoginStatus`, {
      method: 'POST',
      headers: { authorization: `Bearer ${auth.data.Credential}` },
      signal: AbortSignal.timeout(5000),
    });
    z.object({
      code: z.literal(0),
      data: z.object({ isLogin: z.literal(true), isOffline: z.literal(false).optional() }),
    }).parse(await status.json());
    if ((await exec('/usr/bin/pgrep', ['-x', 'QQ'])).stdout.trim() !== native)
      throw new Error('原生 QQ 进程已退出或发生变化');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log(
    'QQ shared-session probe passed: one existing native process and authenticated bridge remained online for 30 seconds.',
  );
}
void app
  .whenReady()
  .then(probe)
  .then(
    () => app.exit(0),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      app.exit(1);
    },
  );
