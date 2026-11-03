import { app, BrowserWindow, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');
const require = createRequire(join(root, 'package.json'));
(app as typeof app & { setAppPath(path: string): void }).setAppPath(root);
const profile = mkdtempSync(join(tmpdir(), 'dela-wechat-smoke-'));
for (const name of ['userData', 'home', 'documents'] as const) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const timeout = setTimeout(() => {
  console.error('WeChat smoke timed out');
  app.exit(1);
}, 55000);
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once(
    'did-finish-load',
    () =>
      void run(window).then(
        () => {
          clearTimeout(timeout);
          app.exit(0);
        },
        (error) => {
          console.error(error);
          app.exit(1);
        },
      ),
  );
});
require(join(root, 'out/main/index.cjs'));

async function run(window: BrowserWindow) {
  const js = (source: string) =>
    window.webContents.executeJavaScript(source).catch((error) => {
      console.error('Failed smoke expression:', source);
      throw error;
    });
  async function wait(source: string) {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    console.error(await js('document.body.innerText.slice(-1600)'));
    throw new Error(`Timed out: ${source}`);
  }
  async function click(label: string) {
    const lookup = `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)})`;
    await wait(`!!(${lookup}) && !(${lookup}).disabled`);
    await js(`${lookup}.click()`);
  }

  await wait('!!window.dela?.wechat && !!document.querySelector("#main-nav")');
  let phase: 'permission' | 'online' = 'permission';
  const chats = [
    { id: 'session_item_课程群', name: '课程群', preview: '课程群\n作业周五提交' },
    { id: 'session_item_项目群', name: '项目群', preview: '项目群\n讨论' },
  ];
  let currentId = chats[0]!.id;
  let messages = [
    { id: 'message-1', text: '作业周五提交' },
    { id: 'message-2', text: '[图片]' },
  ];
  const sent: unknown[] = [];
  let settingsOpened = 0;
  let snapshotRequests = 0;
  const snapshot = (ids: string[] = []) => ({
    phase,
    capturedAt: '2026-11-03T08:00:00Z',
    chats: phase === 'online' ? chats : [],
    current:
      phase === 'online' && ids.includes(currentId)
        ? {
            id: currentId,
            name: chats.find((chat) => chat.id === currentId)!.name,
            canSend: true,
            messages,
          }
        : null,
  });
  const handlers: Record<string, (_event: unknown, input: never) => unknown> = {
    'get-support': () => ({ available: true, reason: '' }),
    authorize: () => snapshot(),
    snapshot: (_event, ids: string[]) => {
      snapshotRequests++;
      return snapshot(ids);
    },
    select: (_event, id: string) => {
      currentId = id;
    },
    send: (_event, input: { chatId: string; text: string }) => {
      assert.equal(input.chatId, currentId);
      sent.push(input);
      messages = [...messages, { id: 'message-sent', text: input.text }];
    },
    'open-settings': () => {
      settingsOpened++;
      phase = 'online';
    },
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler(`wechat-chat:${name}`);
    ipcMain.handle(`wechat-chat:${name}`, (event, input: unknown) =>
      handler(event, input as never),
    );
  }
  await click('微信聊天');
  await wait('!!document.querySelector("section[aria-label=微信聊天]")');
  assert.equal(await js('document.querySelectorAll("[role=tab]").length'), 0);
  assert.equal(snapshotRequests, 0, 'opening the view must not access WeChat before connecting');
  await click('连接微信');
  await wait('document.body.textContent.includes("等待辅助功能授权")');
  await click('打开辅助功能设置');
  assert.equal(settingsOpened, 1);
  await wait('document.body.textContent.includes("已连接原微信")');
  await js(`document.querySelector('input[aria-label="接入 课程群"]').click()`);
  await click('完成并进入聊天');
  await wait(
    'document.querySelector("[aria-label=微信消息记录]")?.textContent.includes("作业周五提交")',
  );
  await js(`(()=>{
    const input=document.querySelector('textarea[aria-label="微信消息内容"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'合成测试回复');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await click('发送');
  await wait(
    'document.querySelector("[aria-label=微信消息记录]")?.textContent.includes("合成测试回复")',
  );
  assert.deepEqual(sent, [{ chatId: chats[0]!.id, text: '合成测试回复' }]);
  await click('设为待办');
  await click('保存待办');
  await wait('document.body.textContent.includes("已创建个人待办")');
  const todos = await js('window.dela.todo.getState()');
  assert.equal(todos.items.length, 1);
  assert.match(todos.items[0].notes, /微信会话：课程群/);
  mkdirSync('.build', { recursive: true });
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      `WeChat overflow at ${width}`,
    );
    writeFileSync(`.build/wechat-${width}.png`, (await window.webContents.capturePage()).toPNG());
  }
  await click('AI 总结');
  await wait(
    '!!document.querySelector("textarea[aria-label=发送给助手], [aria-label=发送给助手]")',
  );
  await wait('document.body.textContent.includes("不代表完整聊天记录")');
  const requestsOnLeaving = snapshotRequests;
  await new Promise((resolve) => setTimeout(resolve, 2300));
  assert.equal(snapshotRequests, requestsOnLeaving, 'leaving the page must stop native reads');
  console.log(
    'WeChat chat smoke passed: standalone QQ-style view, permission setup, chat selection, synthetic send, real local todo, AI draft, navigation cleanup, four viewport sizes. No real WeChat messages were sent.',
  );
}
