import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { startWebServer, webArguments } from '../server';
let root: string, service: Awaited<ReturnType<typeof startWebServer>>;
const invoke = vi.fn(async (): Promise<unknown> => ({ semester: 'test', lastSyncedAt: null }));
const mediaFetch = vi.fn(
  async (_url: string, _range: string | undefined, _signal: AbortSignal) =>
    new Response('fixture', {
      status: 206,
      headers: { 'content-type': 'video/webm', 'content-range': 'bytes 0-6/7' },
    }),
);
beforeEach(async () => {
  invoke.mockClear();
  mediaFetch.mockClear();
  root = await mkdtemp(join(tmpdir(), 'dela-web-test-'));
  await mkdir(join(root, 'web'));
  await writeFile(join(root, 'web/index.html'), '<h1>Web fixture</h1>');
  service = await startWebServer({ directory: root, invoke, mediaFetch });
});
afterEach(async () => {
  service.server.closeAllConnections();
  await new Promise<void>((resolve) => service.server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});
async function post(path: string, body: unknown, cookie?: string, origin = service.origin) {
  return fetch(service.origin + path, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
async function connect() {
  const token = new URLSearchParams(new URL(service.url).hash.slice(1)).get('connect');
  const response = await post('/api/connect', { token });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}
it('validates personal todo mutations without accepting source or local paths', async () => {
  const cookie = await connect();
  const calls = invoke.mock.calls.length;
  for (const input of [
    { title: '' },
    { title: 'test', source: 'canvas' },
    { title: 'test', path: '/private/file' },
  ]) {
    expect((await post('/api/invoke', { method: 'todo.save', args: [input] }, cookie)).status).toBe(
      400,
    );
  }
  expect(invoke.mock.calls).toHaveLength(calls);
  expect(
    (
      await post(
        '/api/invoke',
        { method: 'todo.save', args: [{ title: '网页待办', completed: false }] },
        cookie,
      )
    ).status,
  ).toBe(200);
});
it('serves the web UI but requires pairing for personal data', async () => {
  expect(await (await fetch(service.origin)).text()).toContain('Web fixture');
  expect((await post('/api/invoke', { method: 'schedule.state', args: [] })).status).toBe(401);
  const cookie = await connect();
  expect((await post('/api/invoke', { method: 'schedule.state', args: [] }, cookie)).status).toBe(
    200,
  );
  expect(invoke).toHaveBeenCalledWith('schedule.state', []);
});
it('rejects foreign origins, unknown methods and arbitrary local file calls', async () => {
  const cookie = await connect();
  expect(
    (
      await post(
        '/api/invoke',
        { method: 'schedule.state', args: [] },
        cookie,
        'https://untrusted.example',
      )
    ).status,
  ).toBe(403);
  for (const method of [
    'workspace.read',
    'knowledge.files',
    'terminal.create',
    'llm.save',
    '__proto__',
  ])
    expect((await post('/api/invoke', { method, args: ['/private/file'] }, cookie)).status).toBe(
      403,
    );
  expect(invoke).not.toHaveBeenCalled();
});
it('preserves optional argument defaults and refuses injected chat attachments', () => {
  expect(webArguments('chaoxing.files', ['course'])).toEqual(['course']);
  expect(webArguments('chaoxing.syncFiles', ['course', ''])).toEqual(['course', '']);
  expect(webArguments('schedule.sync', [])).toEqual([]);
  expect(webArguments('chat.create', [])).toEqual([null, 'chat']);
  expect(() => webArguments('chat.create', ['project'])).toThrow();
  expect(() =>
    webArguments('chat.ask', ['bad-id', 'question', { attachments: ['/file'] }]),
  ).toThrow();
});
it('rejects invalid pairing and does not return the connection token with RPC errors', async () => {
  expect((await post('/api/connect', { token: 'a'.repeat(64) })).status).toBe(401);
  const cookie = await connect();
  const response = await post('/api/invoke', { method: 'notices.list', args: ['bad', -1] }, cookie);
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain(new URL(service.url).hash.slice(1));
});

it('proxies only issued school media through an authenticated opaque URL and forwards ranges', async () => {
  const cookie = await connect();
  invoke.mockResolvedValueOnce({
    ok: true,
    data: {
      streams: [{ name: '教师', playbackUrl: 'dela-resource://jlu-video/fixture' }],
      subtitles: [],
      subtitleError: null,
    },
  });
  const response = await post(
    '/api/invoke',
    { method: 'learning.media', args: ['course', 'recording'] },
    cookie,
  );
  const value = (await response.json()) as {
    data: { data: { streams: { playbackUrl: string }[] } };
  };
  const path = value.data.data.streams[0]!.playbackUrl;
  expect(path).toMatch(/^\/api\/media\/[a-f0-9]+$/);
  expect((await fetch(service.origin + path)).status).toBe(401);
  const media = await fetch(service.origin + path, { headers: { cookie, range: 'bytes=0-6' } });
  expect(media.status).toBe(206);
  expect(await media.text()).toBe('fixture');
  expect(mediaFetch.mock.calls[0]?.slice(0, 2)).toEqual([
    'dela-resource://jlu-video/fixture',
    'bytes=0-6',
  ]);
});
it('refuses a local-file resource even when returned as a playback URL', async () => {
  const cookie = await connect();
  invoke.mockResolvedValueOnce({
    ok: true,
    data: { streams: [{ name: 'invalid', playbackUrl: 'dela-resource://workspace/private' }] },
  });
  expect(
    (await post('/api/invoke', { method: 'learning.media', args: ['course', 'recording'] }, cookie))
      .status,
  ).toBe(400);
});
