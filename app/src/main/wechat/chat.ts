import { app, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { checkWorkspaceSender } from '../ipc';
import type { WechatSnapshot } from '../../shared/wechat';

export const wechatAccessStatus = {
  available: process.platform === 'darwin',
  reason: process.platform === 'darwin' ? '' : '微信原窗口接入目前仅支持 macOS。',
};

const id = z.string().min(1).max(1024);
const nativeSnapshot = z.object({
  phase: z.enum(['permission', 'closed', 'unavailable', 'inaccessible', 'online']),
  detail: z.string().default(''),
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
  const executable = join(
    app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'),
    'out/main/native/wechat-accessibility',
  );
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      executable,
      [command],
      { timeout: 10000, maxBuffer: 12 * 1024 * 1024 },
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
  const preparedTransfers = new Map<number, { token: string; chatId: string }>();
  const handlers: Record<string, (input: unknown, senderId: number) => unknown> = {
    'get-support': () => wechatAccessStatus,
    'prepare-manual-reply': async (input, senderId) => {
      if (preparedTransfers.has(senderId)) throw new Error('已有待核对草稿，请先完成或取消。');
      const { chatId, text } = z
        .object({
          chatId: id,
          text: z
            .string()
            .min(1)
            .max(1000)
            .refine((text) => text.trim().length > 0, '请输入消息。')
            .regex(
              /^[^\p{Control}\p{Line_Separator}\p{Paragraph_Separator}]+$/u,
              '兼容发送仅支持单行文字。',
            ),
        })
        .strict()
        .parse(input);
      z.object({ ok: z.literal(true) }).parse(await native('prepare-manual-reply', { text }));
      const token = randomUUID();
      preparedTransfers.set(senderId, { token, chatId });
      return { token };
    },
    'submit-manual-reply': async (input, senderId) => {
      const { token, chatId } = z.object({ token: z.uuid(), chatId: id }).strict().parse(input);
      const prepared = preparedTransfers.get(senderId);
      if (prepared?.token !== token || prepared.chatId !== chatId)
        throw new Error('这份草稿未准备或已提交，请在原微信确认结果。');
      preparedTransfers.delete(senderId);
      z.object({ ok: z.literal(true) }).parse(await native('submit-manual-reply'));
    },
    'cancel-manual-reply': (_input, senderId) => {
      preparedTransfers.delete(senderId);
    },
    'capture-preview': async () =>
      z
        .object({ image: z.string().startsWith('data:image/png;base64,'), info: z.string() })
        .parse(await native('capture-preview')),
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
      return handler(input, event.sender.id);
    });
}
