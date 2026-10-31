import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname } from 'node:path';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { JluPlatformResult, JluStudyMedia } from '../../shared/jlu-platforms';
import { webMethods, type WebMethod } from '../../shared/web';

const bodySchema = z.object({ method: z.string(), args: z.array(z.unknown()).max(4) }).strict();
const ids = z.string().min(1).max(200);
export function webArguments(method: WebMethod, args: unknown[]): unknown[] {
  if (method === 'todo.read' || method === 'todo.remove') return z.tuple([ids]).parse(args);
  if (method === 'todo.save')
    return z
      .tuple([
        z
          .object({
            id: ids.optional(),
            title: z.string().trim().min(1).max(200),
            notes: z.string().max(20000).optional(),
            dueAt: z.string().datetime({ offset: true }).nullable().optional(),
            completed: z.boolean().optional(),
            calendar: z.boolean().optional(),
            color: z
              .enum(['rose', 'peach', 'sand', 'sage', 'teal', 'blue', 'lilac', 'slate'])
              .optional(),
          })
          .strict(),
      ])
      .parse(args);
  if (method === 'learning.saveNote')
    return z
      .tuple([z.string().regex(/^[a-f0-9]{48}$/), z.string().max(200000), z.string().length(64)])
      .parse(args);
  if (method === 'learning.media' || method === 'learning.note')
    return z.tuple([ids, ids]).parse(args);
  if (method === 'chat.model') return z.tuple([z.string().uuid(), ids, ids]).parse(args);
  if (method === 'chat.list') {
    z.tuple([]).parse(args);
    return [null];
  }
  if (method === 'chat.create') {
    z.tuple([]).parse(args);
    return [null, 'chat'];
  }
  if (method === 'chat.ask') {
    const [id, text] = z
      .tuple([z.string().uuid(), z.string().trim().min(1).max(60000)])
      .parse(args);
    return [id, { text, attachments: [], context: [], comments: [] }];
  }
  if (method === 'chat.open' || method === 'chat.cancel')
    return z.tuple([z.string().uuid()]).parse(args);
  if (
    method === 'schedule.state' ||
    method === 'schedule.lessons' ||
    method === 'schedule.sync' ||
    method === 'learning.sync'
  )
    return args.length ? z.tuple([ids]).parse(args) : [];
  if (['chaoxing.files', 'chaoxing.syncFiles'].includes(method))
    return args.length === 1
      ? z.tuple([ids]).parse(args)
      : z.tuple([ids, z.string().max(200)]).parse(args);
  if (
    [
      'chaoxing.works',
      'chaoxing.syncWorks',
      'learning.recordings',
      'learning.syncRecordings',
    ].includes(method)
  )
    return z.tuple([ids]).parse(args);
  if (['notices.list', 'notices.sync'].includes(method))
    return z.tuple([z.string().regex(/^\d+$/), z.number().int().min(1).max(10000)]).parse(args);
  if (method === 'notices.read' || method === 'notices.cached')
    return z.tuple([z.string().regex(/^\d+$/), z.string().regex(/^\d+$/)]).parse(args);
  return z.tuple([]).parse(args);
}
async function jsonBody(request: IncomingMessage) {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 256 * 1024) throw new Error('请求内容过长');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export async function startWebServer(options: {
  directory: string;
  invoke: (method: WebMethod, args: unknown[]) => Promise<unknown>;
  port?: number;
  mediaFetch?: (url: string, range: string | undefined, signal: AbortSignal) => Promise<Response>;
}) {
  const root = await realpath(options.directory);
  const pairing = randomBytes(32).toString('hex'),
    session = randomBytes(32).toString('hex');
  let origin = '';
  const media = new Map<string, string>();
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      if (!response.headersSent)
        reply(response, 400, {
          error:
            error instanceof z.ZodError
              ? '请求参数无效'
              : error instanceof SyntaxError
                ? '请求不是有效 JSON'
                : error instanceof Error
                  ? error.message
                  : '请求失败',
        });
      else response.destroy();
    });
  });
  const reply = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(JSON.stringify(value));
  };
  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.headers.host !== new URL(origin).host) {
      reply(response, 403, { error: '不允许的主机' });
      return;
    }
    if (request.headers.origin && request.headers.origin !== origin) {
      reply(response, 403, { error: '不允许的来源' });
      return;
    }
    const url = new URL(request.url ?? '/', origin);
    if (url.pathname.startsWith('/api/media/')) {
      if (
        !['GET', 'HEAD'].includes(request.method ?? '') ||
        !request.headers.cookie?.split(';').some((value) => value.trim() === `dela_web=${session}`)
      ) {
        reply(response, 401, { error: '媒体连接未授权' });
        return;
      }
      const target = media.get(url.pathname.slice('/api/media/'.length));
      if (!target || !options.mediaFetch) {
        reply(response, 404, { error: '媒体入口已过期，请重新打开课程录像' });
        return;
      }
      const range = request.headers.range;
      if (range && !/^bytes=\d*-\d*$/.test(range)) {
        reply(response, 416, { error: '无效的媒体范围' });
        return;
      }
      const controller = new AbortController();
      response.once('close', () => controller.abort());
      const result = await options.mediaFetch(target, range, controller.signal);
      const headers: Record<string, string> = { 'cache-control': 'no-store' };
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = result.headers.get(name);
        if (value) headers[name] = value;
      }
      response.writeHead(result.status, headers);
      if (request.method === 'HEAD' || !result.body) {
        await result.body?.cancel();
        response.end();
        return;
      }
      await pipeline(Readable.fromWeb(result.body as never), response);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (
        request.method !== 'POST' ||
        request.headers.origin !== origin ||
        !request.headers['content-type']?.startsWith('application/json')
      ) {
        reply(response, 403, { error: '不允许的请求' });
        return;
      }
      if (url.pathname === '/api/connect') {
        const body = z
          .object({ token: z.string().length(64) })
          .strict()
          .parse(await jsonBody(request));
        if (!timingSafeEqual(Buffer.from(body.token), Buffer.from(pairing))) {
          reply(response, 401, { error: '连接链接无效，请从本机服务重新打开' });
          return;
        }
        response.setHeader('set-cookie', `dela_web=${session}; HttpOnly; SameSite=Strict; Path=/`);
        reply(response, 200, { ok: true });
        return;
      }
      if (
        !request.headers.cookie?.split(';').some((value) => value.trim() === `dela_web=${session}`)
      ) {
        reply(response, 401, { error: '请使用本机服务提供的连接链接打开网页' });
        return;
      }
      if (url.pathname !== '/api/invoke') {
        reply(response, 404, { error: '接口不存在' });
        return;
      }
      const body = bodySchema.parse(await jsonBody(request));
      if (!Object.hasOwn(webMethods, body.method)) {
        reply(response, 403, { error: '此能力未向网页开放' });
        return;
      }
      const method = body.method as WebMethod;
      const data = await options.invoke(method, webArguments(method, body.args));
      if (method === 'learning.media') {
        const result = data as JluPlatformResult<JluStudyMedia>;
        if (result.ok)
          result.data.streams = result.data.streams.map((stream) => {
            const address = new URL(stream.playbackUrl);
            if (address.protocol !== 'dela-resource:' || address.hostname !== 'jlu-video')
              throw new Error('无法识别学校媒体入口');
            const id = randomBytes(24).toString('hex');
            media.set(id, stream.playbackUrl);
            return { ...stream, playbackUrl: '/api/media/' + id };
          });
      }
      reply(response, 200, { data });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(response, 405, { error: '不支持的请求方法' });
      return;
    }
    let path: string;
    try {
      path = await realpath(
        resolve(
          root,
          url.pathname === '/' ? 'web/index.html' : '.' + decodeURIComponent(url.pathname),
        ),
      );
    } catch {
      reply(response, 404, { error: '页面不存在' });
      return;
    }
    const suffix = relative(root, path);
    if (
      isAbsolute(suffix) ||
      suffix === '..' ||
      suffix.startsWith('..' + sep) ||
      !(await stat(path)).isFile()
    ) {
      reply(response, 404, { error: '页面不存在' });
      return;
    }
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.woff2': 'font/woff2',
    };
    response.writeHead(200, {
      'content-type': types[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : await readFile(path));
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('网页服务启动失败');
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin, url: origin + '/#connect=' + pairing };
}
