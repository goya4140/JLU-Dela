import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: {} }));
import { mergeDatabaseMessages } from '../database';

const row = {
  id: 'shard-0:1',
  text: '通知',
  sender: '同学',
  sentAt: '2026-11-03T10:00:00+08:00',
  kind: 'text',
};
const batch = { phase: 'ready' as const, account: 'a', chatId: '1@chatroom', messages: [row] };
describe('微信群数据库同步缓存', () => {
  it('重复刷新不会重复消息，保留新消息和内容修订', () => {
    const first = mergeDatabaseMessages(null, batch, 'first');
    const second = mergeDatabaseMessages(
      first,
      {
        ...batch,
        messages: [
          { ...row, text: '已修订' },
          { ...row, id: 'shard-1:1', text: '另一分片' },
        ],
      },
      'second',
    );
    expect(second.messages).toHaveLength(2);
    expect(second.messages.find((message) => message.id === row.id)?.text).toBe('已修订');
    expect(second.lastSyncAt).toBe('second');
  });
  it('切换账号或群身份后不混入旧缓存', () => {
    const previous = mergeDatabaseMessages(null, batch, 'first');
    expect(
      mergeDatabaseMessages(previous, { ...batch, account: 'b', messages: [] }, 'second').messages,
    ).toEqual([]);
    expect(
      mergeDatabaseMessages(previous, { ...batch, chatId: '2@chatroom', messages: [] }, 'second')
        .messages,
    ).toEqual([]);
  });
});
