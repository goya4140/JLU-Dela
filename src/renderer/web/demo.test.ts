import { beforeEach, expect, it, vi } from 'vitest';
import type { TodoState } from '../../shared/todo';

beforeEach(() => vi.resetModules());

it('preserves a demo task when completing and editing it, and resets on a new page session', async () => {
  const { demoCall } = await import('./demo');
  const saved = (await demoCall('todo.save', [
    { title: '复习协议', notes: '整理分层', calendar: true },
  ])) as TodoState;
  const id = saved.items[0]!.id;
  await demoCall('todo.save', [{ id, title: '复习协议', completed: true }]);
  const edited = (await demoCall('todo.save', [{ id, title: '复习网络协议' }])) as TodoState;
  expect(edited.items).toEqual([
    expect.objectContaining({
      id,
      title: '复习网络协议',
      notes: '整理分层',
      calendar: true,
      status: 'completed',
    }),
  ]);
  vi.resetModules();
  const fresh = await import('./demo');
  expect(await fresh.demoCall('todo.state', [])).toMatchObject({ items: [] });
});

it('keeps note edits after a stale save and never calls an AI service', async () => {
  const { demoCall } = await import('./demo');
  const note = (await demoCall('learning.note', [])) as {
    id: string;
    text: string;
    revision: string;
  };
  expect(note.text).toContain('\n\n');
  await demoCall('learning.saveNote', [note.id, '# 我的示例笔记', note.revision]);
  await expect(demoCall('learning.saveNote', [note.id, '旧版本', note.revision])).rejects.toThrow(
    '笔记已变化',
  );
  expect(await demoCall('learning.note', [])).toMatchObject({ text: '# 我的示例笔记' });
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    await expect(demoCall('chat.ask', ['示例问题'])).rejects.toThrow('不调用 AI 服务');
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
