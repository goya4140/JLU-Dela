import { app, BrowserWindow, dialog } from 'electron';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Socket } from 'node:net';
import type { QqMessage } from '../src/shared/qq';

const root = resolve('.');
const appRoot = process.argv[2] ? resolve(process.argv[2]) : root;
const require = createRequire(join(root, 'package.json'));
(app as typeof app & { setAppPath(path: string): void }).setAppPath(appRoot);
const profile = mkdtempSync(join(tmpdir(), 'dela-qq-smoke-'));
for (const name of ['userData', 'documents', 'home'] as const) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const shared = join(profile, 'Library/Containers/com.tencent.qq/Data/Documents/Dela-QQ');
const bridge = join(shared, 'framework-4.18.42');
mkdirSync(bridge, { recursive: true });
writeFileSync(join(bridge, 'napcat.cjs'), Buffer.alloc(0));
writeFileSync(
  join(shared, 'bootstrap.json'),
  JSON.stringify({
    originalMain: './application.asar/app_launcher/index.js',
    bridge,
    workdir: join(shared, 'data'),
  }),
);
const executable = join(profile, 'Applications/QQ.app');
const packagePath = join(executable, 'Contents/Resources/app/package.json');
mkdirSync(dirname(packagePath), { recursive: true });
writeFileSync(
  packagePath,
  JSON.stringify({
    version: 'fixture',
    main: relative(dirname(packagePath), join(shared, 'loader.cjs')),
  }),
);
const fs = require('node:fs') as typeof import('node:fs');
const originalExists = fs.existsSync;
fs.existsSync = (path) => (path === '/Applications/QQ.app' ? false : originalExists(path));
let loggedIn = false;
let failSend = false;
let offlineHint = '';
const png = readFileSync(join(root, 'assets/JLU-Dela-white.png'));
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
let liveSocket: Socket | undefined;
const requests: { action: string; body: Record<string, unknown> }[] = [];
const servers: Server[] = [];
const messages: object[] = [
  {
    message_id: '1',
    group_id: '100',
    user_id: '9',
    time: 1793671200,
    sender: { card: '示例老师' },
    message: [
      { type: 'text', data: { text: '请在周五提交课程报告，附件是模板。' } },
      { type: 'file', data: { file_id: 'file-1', name: '报告模板.pdf' } },
      { type: 'image', data: { file: 'image-png', summary: '示例截图' } },
      { type: 'image', data: { file: 'image-gif', summary: '示例表情' } },
    ],
  },
];
const childProcess = require('node:child_process') as typeof import('node:child_process');
const originalExecFile = childProcess.execFile;
childProcess.execFile = ((command: string, args: string[], ...tail: unknown[]) => {
  if (command !== '/usr/bin/open' || args[1] !== executable)
    return Reflect.apply(originalExecFile, childProcess, [command, args, ...tail]);
  if (servers.length) {
    (tail.at(-1) as (error: null, stdout: string, stderr: string) => void)(null, '', '');
    return Object.assign(new EventEmitter(), { exitCode: null, pid: undefined }) as ChildProcess;
  }
  const config = JSON.parse(readFileSync(join(shared, 'data/config/onebot11.json'), 'utf8'));
  const web = JSON.parse(readFileSync(join(shared, 'data/config/webui.json'), 'utf8'));
  for (const port of [config.network.httpServers[0].port, web.port]) {
    const server = createServer(async (request, response) => {
      const path = request.url!;
      if (path === '/image.png' || path === '/image.gif') {
        response.end(path.endsWith('.png') ? png : gif);
        return;
      }
      if (path === '/file.pdf') {
        response.end('synthetic qq file');
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body || '{}');
      let data: unknown;
      if (path === '/api/auth/login') {
        assert.equal(input.hash, createHash('sha256').update(`${web.token}.napcat`).digest('hex'));
        data = { Credential: 'fixture-credential' };
      } else if (path === '/api/QQLogin/CheckLoginStatus')
        data = {
          isLogin: loggedIn,
          qrcodeurl: 'https://qq.com/synthetic-login',
          loginError: offlineHint,
          loginPhase: offlineHint ? 'reconnecting' : 'qrcode',
        };
      else if (path === '/api/QQLogin/RefreshQRcode') data = {};
      else {
        assert.equal(request.headers.authorization, `Bearer ${web.token}`);
        requests.push({ action: path, body: input });
        if (path === '/get_login_info') data = { user_id: '7', nickname: '示例用户' };
        else if (path === '/get_group_list')
          data = [
            { group_id: '100', group_name: '计算机网络 · 示例课程群' },
            { group_id: '200', group_name: '未接入群' },
          ];
        else if (path === '/get_image')
          data = {
            url: `http://127.0.0.1:${port}/image.${input.file === 'image-png' ? 'png' : 'gif'}`,
          };
        else if (path === '/get_group_msg_history') data = { messages };
        else if (path === '/send_group_msg') {
          if (failSend) {
            response.writeHead(503);
            response.end();
            return;
          }
          data = { message_id: '2' };
        } else if (path === '/get_group_file_url')
          data = { url: `http://127.0.0.1:${port}/file.pdf` };
        else throw new Error(`Unexpected action ${path}`);
      }
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify(
          path.startsWith('/api/') ? { code: 0, data } : { status: 'ok', retcode: 0, data },
        ),
      );
    });
    server.listen(port, '127.0.0.1');
    servers.push(server);
  }
  const socketServer = createServer();
  socketServer.on('upgrade', (request, socket) => {
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    liveSocket = socket as Socket;
  });
  socketServer.listen(config.network.websocketServers[0].port, '127.0.0.1');
  servers.push(socketServer);
  (tail.at(-1) as (error: null, stdout: string, stderr: string) => void)(null, '', '');
  return Object.assign(new EventEmitter(), { exitCode: null, pid: undefined }) as ChildProcess;
}) as typeof childProcess.execFile;
const savedFile = join(profile, '报告模板.pdf');
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedFile });
const timeout = setTimeout(() => {
  console.error('QQ smoke timed out');
  app.exit(1);
}, 90000);
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once(
    'did-finish-load',
    () =>
      void run(window).then(
        () => {
          clearTimeout(timeout);
          for (const server of servers) server.close();
          app.exit(0);
        },
        (error) => {
          console.error(error);
          app.exit(1);
        },
      ),
  );
});
require(join(appRoot, 'out/main/index.cjs'));

async function run(window: BrowserWindow) {
  const js = (source: string) =>
    window.webContents.executeJavaScript(source).catch((error) => {
      console.error(`Failed UI expression: ${source}`);
      throw error;
    });
  async function wait(source: string) {
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    console.error(await js('document.body.innerText.slice(-1800)'));
    throw new Error(`Timed out: ${source}`);
  }
  const click = async (label: string) => {
    const lookup = `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)})`;
    await wait(`!!(${lookup})`);
    await js(`${lookup}.click()`);
  };
  await wait('!!window.dela?.qq && !!document.querySelector("#main-nav")');
  await click('QQ 群聊');
  await click('连接 QQ');
  await wait(
    '!!document.querySelector("svg[role=img]") || document.body.textContent.includes("用手机 QQ 扫码")',
  );
  assert.equal((await js('window.dela.qq.getState()')).phase, 'login');
  loggedIn = true;
  await wait('document.body.textContent.includes("示例用户")');
  await js(`document.querySelector('input[aria-label="接入 计算机网络 · 示例课程群"]').click()`);
  await wait('!document.querySelector(\'textarea[aria-label="QQ 消息内容"]\')');
  await click('完成并进入聊天');
  await wait('document.body.textContent.includes("请在周五提交课程报告")');
  await wait(
    'Array.from(document.querySelectorAll("img")).filter(img=>img.naturalWidth>0).length===2',
  );
  await js(`document.querySelector('[aria-label="查看示例截图"]').click()`);
  await wait(`!!document.querySelector('[role="dialog"] img')`);
  await js(`document.querySelector('[aria-label="关闭图片"]').click()`);
  loggedIn = false;
  offlineHint = '[SelfOffline] synthetic offline event';
  await wait('(async()=> (await window.dela.qq.getState()).phase==="reconnecting")()');
  assert.equal(await js(`!!document.querySelector('textarea[aria-label="QQ 消息内容"]')`), true);
  assert.equal(await js('document.body.textContent.includes("请在周五提交课程报告")'), true);
  assert.equal(await js('!!document.querySelector("svg[role=img]")'), false);
  loggedIn = true;
  offlineHint = '';
  await wait('(async()=> (await window.dela.qq.getState()).phase==="online")()');
  await click('首页');
  await click('QQ 群聊');
  await wait('document.body.textContent.includes("请在周五提交课程报告")');
  assert.equal(await js('!!document.querySelector(\'input[aria-label="接入 未接入群"]\')'), false);
  await click('管理群聊');
  await wait('!!document.querySelector(\'input[aria-label="接入 未接入群"]\')');
  await click('完成并进入聊天');
  await wait('(async()=> (await window.dela.qq.messages("100")).length===1)()');
  assert.equal(
    (await js('window.dela.qq.getState()')).groups.find(
      (group: { id: string }) => group.id === '200',
    ).selected,
    false,
  );
  const message = (await js('window.dela.qq.messages("100")')) as QqMessage[];
  assert.equal(message[0]!.files[0]!.id, 'file-1');
  while (!liveSocket) await new Promise((resolve) => setTimeout(resolve, 20));
  const bytes = Buffer.from(
    JSON.stringify({
      ...messages[0],
      post_type: 'message',
      message_type: 'group',
      message_id: 'live-1',
      message: [{ type: 'text', data: { text: '这是一条实时消息' } }],
    }),
  );
  const frame = Buffer.alloc(4 + bytes.length);
  frame[0] = 0x81;
  frame[1] = 126;
  frame.writeUInt16BE(bytes.length, 2);
  bytes.copy(frame, 4);
  liveSocket.write(frame);
  await wait('document.body.textContent.includes("这是一条实时消息")');
  await js(`document.querySelector('[aria-label="回复消息 1"]').click()`);
  await js(
    `(()=>{const input=document.querySelector('textarea[aria-label="QQ 消息内容"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'老师好，已收到。');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  failSend = true;
  await click('发送');
  await wait('document.body.textContent.includes("发送结果未确认")');
  assert.equal(await js('document.querySelector("textarea").value'), '老师好，已收到。');
  failSend = false;
  await click('发送');
  await wait('document.body.textContent.includes("示例用户（我）")');
  assert.deepEqual(
    requests.filter((request) => request.action === '/send_group_msg').at(-1)!.body.message,
    [
      { type: 'reply', data: { id: '1' } },
      { type: 'text', data: { text: '老师好，已收到。' } },
    ],
  );
  await js('window.dela.qq.download("100","1","file-1")');
  assert.equal(readFileSync(savedFile, 'utf8'), 'synthetic qq file');
  mkdirSync('.build', { recursive: true });
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      `QQ overflow at ${width}`,
    );
    writeFileSync(`.build/qq-${width}.png`, (await window.webContents.capturePage()).toPNG());
  }
  await js(`document.querySelector('[aria-label="在工作台打开群聊"]').click()`);
  await wait('document.querySelector("[role=tab]")?.textContent.includes("计算机网络")');
  await wait('document.body.textContent.includes("这是一条实时消息")');
  await js(`document.querySelector('[aria-label="将消息 1 设为待办"]').click()`);
  await click('保存待办');
  await wait('document.body.textContent.includes("QQ 群：计算机网络")');
  const todos = (await js('window.dela.todo.getState()')).items;
  assert.equal(todos.length, 1);
  assert.ok(todos[0].notes.includes('示例老师'));
  await js(
    'window.dela.qq.createTodo({groupId:"100",messageId:"1",title:"另一个标题",dueAt:null})',
  );
  assert.equal((await js('window.dela.todo.getState()')).items.length, 1);
  await click('QQ 群聊');
  await wait('!!document.querySelector(\'[aria-label="打开群聊 计算机网络 · 示例课程群"]\')');
  await js(`document.querySelector('[aria-label="打开群聊 计算机网络 · 示例课程群"]').click()`);
  await wait('document.body.textContent.includes("这是一条实时消息")');
  await click('AI 总结');
  await wait(
    '!!document.querySelector("[data-chat-editor]") || document.body.textContent.includes("已准备总结草稿")',
  );
  assert.ok(
    await js(
      'JSON.stringify(localStorage.getItem("dela.session.drafts")).includes("只总结，不发送 QQ 消息")',
    ),
  );
  await js('window.dela.qq.stop()');
  assert.equal((await js('window.dela.qq.getState()')).phase, 'stopped');
  await js('window.dela.qq.start()');
  await wait('(async()=> (await window.dela.qq.getState()).phase==="online")()');
  assert.equal((await js('window.dela.qq.getState()')).groups[0].selected, true);
  assert.equal(servers.length, 3, 'reconnect reuses the original QQ bridge');
  await js('window.dela.qq.stop()');
  console.log(
    'QQ smoke passed: login, selected groups, live messages, replies, failed-send draft, files, workbench, todos, AI draft and four viewport sizes.',
  );
}
