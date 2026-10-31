import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));
import { startWebHost } from '../host';
it('returns only opaque references for course notes and rejects forged note references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-note-host-'));
  await mkdir(join(directory, 'web'));
  await writeFile(join(directory, 'web/index.html'), 'fixture');
  const run = vi.fn(async (source: string) => {
    if (source.startsWith('window.dela.jluPlatforms.studyWorkspace'))
      return { noteId: '/private/fixture-note.md' };
    if (source.startsWith('window.dela.workspace.read'))
      return { title: '学习笔记', text: '# 原笔记', revision: 'a'.repeat(64) };
    if (source.startsWith('window.dela.workspace.saveNote')) return {};
    throw new Error('Unexpected source');
  });
  const window = {
    isDestroyed: () => false,
    webContents: { executeJavaScript: run },
  } as unknown as BrowserWindow;
  const service = await startWebHost(window, directory);
  const post = (body: unknown, cookie?: string) =>
    fetch(service.origin + '/api/invoke', {
      method: 'POST',
      headers: {
        origin: service.origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const token = new URLSearchParams(new URL(service.url).hash.slice(1)).get('connect');
    const paired = await fetch(service.origin + '/api/connect', {
      method: 'POST',
      headers: { origin: service.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const cookie = paired.headers.get('set-cookie')!.split(';')[0]!;
    const response = await post({ method: 'learning.note', args: ['course', 'recording'] }, cookie);
    const raw = await response.text();
    expect(raw).not.toContain('/private/');
    const { data } = JSON.parse(raw) as { data: { id: string; revision: string } };
    expect(data.id).toMatch(/^[a-f0-9]{48}$/);
    expect(
      (
        await post(
          { method: 'learning.saveNote', args: [data.id, '# 新笔记', data.revision] },
          cookie,
        )
      ).status,
    ).toBe(200);
    const calls = run.mock.calls.length;
    expect(
      (
        await post(
          { method: 'learning.saveNote', args: ['b'.repeat(48), 'overwrite', data.revision] },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(run.mock.calls).toHaveLength(calls);
  } finally {
    service.server.closeAllConnections();
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
