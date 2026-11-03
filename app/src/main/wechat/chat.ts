import { app, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { checkWorkspaceSender } from '../ipc';
import type { WechatSnapshot } from '../../shared/wechat';

export const wechatAccessStatus = {
  available: false,
  reason:
    '实机验证期间，原微信出现账号安全重新登录提示。原因尚未查明，自动读取与操作已停用，请先在原微信中处理登录。',
};

const id = z.string().min(1).max(1024);
const nativeSnapshot = z.object({
  phase: z.enum(['permission', 'closed', 'unavailable', 'online']),
  chats: z.array(z.object({ id, name: z.string(), preview: z.string() })),
  current: z
    .object({
      id,
      name: z.string(),
      canSend: z.boolean(),
      messages: z.array(z.object({ nativeId: z.string(), text: z.string() })),
    })
    .nullable(),
});

async function native(command: string, input: object = {}): Promise<unknown> {
  if (!wechatAccessStatus.available) throw new Error(wechatAccessStatus.reason);
  if (process.platform !== 'darwin') throw new Error('微信原窗口接入目前仅支持 macOS。');
  const executable = join(
    app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'),
    'out/main/native/wechat-accessibility',
  );
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      executable,
      [command],
      { timeout: 10000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(new Error('微信辅助功能组件未能运行，请重新构建预览版后重试。'));
        else resolve(stdout);
      },
    );
    child.stdin?.end(JSON.stringify(input));
  });
  const value: unknown = JSON.parse(output);
  const failure = z.object({ error: z.string() }).safeParse(value);
  if (failure.success) throw new Error(failure.data.error);
  return value;
}

export function decodeWechatSnapshot(
  value: unknown,
  capturedAt = new Date().toISOString(),
): WechatSnapshot {
  const snapshot = nativeSnapshot.parse(value);
  const occurrences = new Map<string, number>();
  return {
    ...snapshot,
    capturedAt,
    current: snapshot.current
      ? {
          ...snapshot.current,
          messages: snapshot.current.messages.map((message) => {
            const key = `${snapshot.current!.id}\n${message.nativeId}\n${message.text}`;
            const occurrence = (occurrences.get(key) ?? 0) + 1;
            occurrences.set(key, occurrence);
            return {
              id: createHash('sha256').update(`${key}\n${occurrence}`).digest('hex'),
              text: message.text,
            };
          }),
        }
      : null,
  };
}

export function registerWechatChatIpc(): void {
  const handlers: Record<string, (input: unknown) => unknown> = {
    'get-support': () => wechatAccessStatus,
    snapshot: async (input) =>
      decodeWechatSnapshot(
        await native('snapshot', { chatIds: z.array(id).max(100).parse(input) }),
      ),
    authorize: async () => decodeWechatSnapshot(await native('authorize')),
    select: async (input) => {
      await native('select', { chatId: id.parse(input) });
    },
    send: async (input) => {
      const value = z
        .object({ chatId: id, text: z.string().trim().min(1).max(4500) })
        .strict()
        .parse(input);
      const result = await native('send', value);
      z.object({ ok: z.literal(true) }).parse(result);
    },
    'open-settings': () =>
      shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      ),
  };
  for (const [name, handler] of Object.entries(handlers))
    ipcMain.handle(`wechat-chat:${name}`, (event, input: unknown) => {
      checkWorkspaceSender(event);
      return handler(input);
    });
}
