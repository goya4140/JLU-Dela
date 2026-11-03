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
  let phase: 'permission' | 'online' | 'inaccessible' = 'permission';
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
  const preparedTexts: string[] = [];
  const preparedChats: string[] = [];
  const submittedTokens: string[] = [];
  const transferToken = '04c5c208-e897-4e29-9134-c22cc10594ec';
  let settingsOpened = 0;
  let snapshotRequests = 0;
  const snapshot = (ids: string[] = []) => ({
    phase,
    detail: phase === 'inaccessible' ? '微信未提供聊天输入框' : '',
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
    'prepare-manual-reply': (_event, input: { chatId: string; text: string }) => {
      preparedTexts.push(input.text);
      preparedChats.push(input.chatId);
      return { token: transferToken };
    },
    'submit-manual-reply': (_event, input: { chatId: string; token: string }) => {
      assert.equal(input.chatId, preparedChats.at(-1));
      submittedTokens.push(input.token);
    },
    'cancel-manual-reply': () => {},
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
  phase = 'inaccessible';
  await wait('!!document.querySelector("[aria-label=微信手动群聊工作台]")');
  const requestsWithoutControls = snapshotRequests;
  await new Promise((resolve) => setTimeout(resolve, 2300));
  assert.equal(
    snapshotRequests,
    requestsWithoutControls,
    'missing controls must stop native polling',
  );
  await js(`(()=>{
    const input=document.querySelector('textarea[aria-label="文件传输助手消息内容"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'合成兼容发送文字');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  assert.equal(
    await js(
      'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.trim()==="填入微信草稿").disabled',
    ),
    true,
  );
  await js(
    `document.querySelector('[aria-label="文件传输助手兼容发送"] input[type=checkbox]').click()`,
  );
  await click('填入微信草稿');
  await wait('document.body.textContent.includes("已提交文字输入操作")');
  assert.deepEqual(preparedTexts, ['合成兼容发送文字']);
  assert.deepEqual(submittedTokens, []);
  assert.equal(
    await js(
      'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.trim()==="确认并发送到文件传输助手").disabled',
    ),
    true,
  );
  await js(
    `document.querySelector('[aria-label="文件传输助手兼容发送"] input[type=checkbox]').click()`,
  );
  await click('确认并发送到文件传输助手');
  await wait('document.body.textContent.includes("结果尚未确认")');
  assert.deepEqual(submittedTokens, [transferToken]);
  await click('已在微信确认收到');
  assert.equal(preparedTexts.length, 1, 'receipt acknowledgment must not submit the form again');
  await click('添加群聊');
  await js(`(()=>{
    const input=document.querySelector('textarea[aria-label="要添加的微信群名"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'JLU-Dela\\n合成课程群\\nJLU-Dela');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await click('保存并进入');
  await wait('!!document.querySelector("textarea[aria-label=JLU-Dela消息内容]")');
  assert.equal(
    await js(
      'document.querySelectorAll("button[aria-label=\\"选择本地微信会话 JLU-Dela\\"]").length',
    ),
    1,
  );
  await js(`(()=>{
    const input=document.querySelector('textarea[aria-label="JLU-Dela消息内容"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'合成群聊草稿');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await js(`document.querySelector('button[aria-label="选择本地微信会话 合成课程群"]').click()`);
  await wait('!!document.querySelector("textarea[aria-label=合成课程群消息内容]")');
  assert.equal(
    await js('document.querySelector("textarea[aria-label=合成课程群消息内容]").value'),
    '',
  );
  await js(`document.querySelector('button[aria-label="选择本地微信会话 JLU-Dela"]').click()`);
  await wait(
    'document.querySelector("textarea[aria-label=JLU-Dela消息内容]")?.value === "合成群聊草稿"',
  );
  await js(
    `document.querySelector('[aria-label="JLU-Dela兼容发送"] input[type=checkbox]').click()`,
  );
  await click('填入微信草稿');
  await wait('document.body.textContent.includes("已提交文字输入操作")');
  assert.equal(
    await js(
      'document.querySelector("button[aria-label=\\"选择本地微信会话 合成课程群\\"]").disabled',
    ),
    true,
  );
  assert.notEqual(preparedChats[0], preparedChats[1]);
  await click('取消确认');
  assert.equal(submittedTokens.length, 1, 'canceling a group draft must not send it');
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      `Manual WeChat overflow at ${width}`,
    );
    writeFileSync(
      `.build/wechat-manual-${width}.png`,
      (await window.webContents.capturePage()).toPNG(),
    );
  }
  phase = 'online';
  await js(`document.querySelector('button[aria-label="刷新微信会话"]').click()`);
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
    'WeChat chat smoke passed: standalone QQ-style view, permission setup, unavailable controls and polling stop, staged manual reply, chat selection, synthetic send, real local todo, AI draft, navigation cleanup, four viewport sizes. No real WeChat messages were sent.',
  );
}
