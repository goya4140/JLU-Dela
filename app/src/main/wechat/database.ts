import { app } from 'electron';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { WechatDatabaseState } from '../../shared/wechat';

const message = z.object({
  id: z.string(),
  text: z.string(),
  sender: z.string(),
  sentAt: z.string(),
  kind: z.string(),
});
const result = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('ready'),
    account: z.string(),
    chatId: z.string().endsWith('@chatroom'),
    messages: z.array(message).max(200),
  }),
  z.object({ phase: z.enum(['needs-access', 'group-not-found', 'ambiguous', 'error']) }),
]);
const cacheSchema = z.object({
  account: z.string(),
  chatId: z.string(),
  lastSyncAt: z.string(),
  messages: z.array(message).max(500),
});
type Cache = z.infer<typeof cacheSchema>;

export function mergeDatabaseMessages(
  previous: Cache | null,
  incoming: Extract<z.infer<typeof result>, { phase: 'ready' }>,
  lastSyncAt: string,
): Cache {
  const messages = new Map<string, z.infer<typeof message>>();
  if (previous?.account === incoming.account && previous.chatId === incoming.chatId)
    for (const row of previous.messages) messages.set(row.id, row);
  for (const row of incoming.messages) messages.set(row.id, row);
  return {
    account: incoming.account,
    chatId: incoming.chatId,
    lastSyncAt,
    messages: [...messages.values()]
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id))
      .slice(-500),
  };
}

let pending: Promise<WechatDatabaseState> | null = null;
export function syncWechatDatabase(): Promise<WechatDatabaseState> {
  if (pending) return pending;
  pending = readDatabase().finally(() => {
    pending = null;
  });
  return pending;
}

async function readDatabase(): Promise<WechatDatabaseState> {
  const runtime = join(app.getAppPath(), '.build/wechat-reader');
  const directory = join(app.getPath('userData'), 'wechat-database');
  const filename = join(directory, 'jlu-dela.json');
  let cache: Cache | null = null;
  try {
    cache = cacheSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('微信群消息缓存无法读取，未覆盖原缓存。');
  }
  const previous = {
    chatId: cache?.chatId ?? null,
    lastSyncAt: cache?.lastSyncAt ?? null,
    messages: cache?.messages ?? [],
  };
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        join(runtime, 'venv/bin/python'),
        [
          join(
            app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'),
            'out/main/native/wechat-database.py',
          ),
          '--reader',
          join(runtime, 'rion_wechat_reader.py'),
          '--config',
          join(homedir(), '.config/rion-wechat-reader/config.json'),
        ],
        { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      );
    });
    const value = result.parse(JSON.parse(output));
    if (value.phase !== 'ready') return { ...previous, phase: value.phase };
    const next = mergeDatabaseMessages(cache, value, new Date().toISOString());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(`${filename}.tmp`, JSON.stringify(next), { mode: 0o600 });
    await rename(`${filename}.tmp`, filename);
    return {
      phase: 'ready',
      chatId: next.chatId,
      lastSyncAt: next.lastSyncAt,
      messages: next.messages,
    };
  } catch (error) {
    return {
      ...previous,
      phase: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing-runtime' : 'error',
    };
  }
}
