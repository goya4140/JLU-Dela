const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(process.argv[2] || '.');
app.setAppPath(root);
if (root.endsWith('.asar')) {
  Object.defineProperty(app, 'isPackaged', { value: true });
  process.resourcesPath = dirname(root);
}
const profile = realpathSync(mkdtempSync(join(tmpdir(), 'setup-guide-smoke-')));
for (const name of ['userData', 'documents', 'home']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const syncedAt = '2026-10-31T02:00:00.000Z';
const calls = [];
const mailCalls = [];
let mailConnected = false;
let mode = 'success';
let academicAttempts = 0;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) =>
  originalHandle(channel, async (...args) => {
    if (channel === 'mail:get-state')
      return {
        account: mailConnected ? { address: 'student@mails.jlu.edu.cn', lastSyncedAt: null } : null,
        sync: {
          phase: 'idle',
          folderPath: null,
          processed: 0,
          total: null,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      };
    if (channel === 'mail:configure') {
      assert.equal(args[1].address, 'student@mails.jlu.edu.cn');
      mailCalls.push(channel);
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (mailCalls.length === 1) return { ok: false, error: '示例邮箱认证失败，可重试' };
      mailConnected = true;
      return { ok: true };
    }
    if (channel === 'mail:sync') {
      mailCalls.push(channel);
      return;
    }
    if (channel === 'timetable:get-state')
      return { ...(await handler(...args)), lastSyncedAt: syncedAt };
    if (channel === 'jlu:notices:get') return { channel: '179577', page: 1, items: [], syncedAt };
    if (channel === 'jlu:learning:get' || channel === 'cx:courses:get') return null;
    if (
      [
        'timetable:sync',
        'timetable:connect',
        'jlu:notices:sync',
        'jlu:learning:sync',
        'cx:courses:sync',
      ].includes(channel)
    ) {
      calls.push(channel);
      if (channel === 'timetable:sync') {
        academicAttempts++;
        if (mode === 'forbidden')
          return { ok: false, error: '吉大教务拒绝访问（403），请确认账号权限或校园网/VPN' };
        if (mode === 'network') throw new Error('示例网络超时');
        if (mode === 'cancel' || (mode === 'recover' && academicAttempts === 1))
          return { ok: false, reason: 'auth', error: '示例认证失效' };
        return { ok: true };
      }
      if (channel === 'timetable:connect')
        return mode === 'cancel' ? { ok: false, error: '示例用户关闭认证' } : { ok: true };
      return { ok: true, data: { syncedAt } };
    }
    return handler(...args);
  });
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once(
    'did-finish-load',
    () =>
      void run(window).then(
        () => app.exit(0),
        (error) => {
          console.error(error);
          app.exit(1);
        },
      ),
  );
});
require(join(root, 'out/main/index.cjs'));
async function run(window) {
  const js = async (source) => {
    try {
      return await window.webContents.executeJavaScript(source);
    } catch (error) {
      throw new Error(source, { cause: error });
    }
  };
  const wait = async (source) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    console.error(await js('document.body.innerText.slice(-2000)'));
    throw new Error('Timed out: ' + source);
  };
  const click = (label) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`,
    );
  const idle = () => wait(`!document.querySelector('[aria-label="校园平台配置"] button').disabled`);
  await wait('!!window.dela && !!document.querySelector("#main-nav")');
  await click('设置');
  await wait('!!document.querySelector("[aria-label=设置分区]")');
  await click('使用指南');
  await wait('!!document.querySelector("[aria-label=使用指南正文]")');
  await idle();
  assert.deepEqual(calls, [], 'opening the guide must only read local cache');
  assert.ok(
    await js(
      'document.querySelector("[data-platform=academic]").textContent.includes("本机已有数据")',
    ),
  );
  assert.ok(await js('document.body.textContent.includes("尚未配置模型")'));
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await js(
      'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
    );
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      'guide width ' + width,
    );
    assert.equal(
      await js(
        `(()=>{const r=document.querySelector('[aria-label="校园平台配置"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`,
      ),
      true,
      'platform content fits ' + width,
    );
    if (!root.endsWith('.asar')) {
      mkdirSync('.build', { recursive: true });
      writeFileSync(
        `.build/setup-guide-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
  }
  await click('打开邮箱');
  await wait(
    `!!document.querySelector('input[placeholder="name@mails.jlu.edu.cn"]') && !document.querySelector('[aria-label="校园平台配置"]')`,
  );
  assert.ok(await js(`document.body.textContent.includes('教工邮箱')`));
  await click('设置');
  await wait('!!document.querySelector("[aria-label=设置分区]")');
  await click('使用指南');
  await idle();
  await click('依次连接吉大平台');
  await idle();
  assert.deepEqual(calls, ['timetable:sync', 'jlu:notices:sync', 'jlu:learning:sync']);
  assert.ok(
    await js(
      'document.querySelector("[data-platform=learning]").textContent.includes("本次连接成功")',
    ),
  );
  await click('连接学习通');
  await idle();
  assert.equal(calls.at(-1), 'cx:courses:sync');
  calls.length = 0;
  mode = 'network';
  await click('依次连接吉大平台');
  await idle();
  assert.deepEqual(calls, ['timetable:sync', 'jlu:notices:sync', 'jlu:learning:sync']);
  assert.ok(
    await js(
      'document.querySelector("[data-platform=academic]").textContent.includes("示例网络超时")',
    ),
  );
  assert.ok(
    await js('document.querySelector("[data-platform=academic]").textContent.includes("最近同步")'),
  );
  assert.equal(
    await js(
      'document.querySelector("[data-platform=academic]").textContent.includes("需要完成学校认证")',
    ),
    false,
  );
  calls.length = 0;
  mode = 'forbidden';
  await click('依次连接吉大平台');
  await idle();
  assert.deepEqual(calls, ['timetable:sync', 'jlu:notices:sync', 'jlu:learning:sync']);
  assert.ok(
    await js(
      'document.querySelector("[data-platform=academic]").textContent.includes("访问被拒绝（403）")',
    ),
  );
  assert.ok(
    await js(
      'document.querySelector("[data-platform=academic]").textContent.includes("网页可以访问但 Dela 仍报 403")',
    ),
  );
  assert.equal(
    await js('document.querySelector("[data-platform=academic] a").href'),
    'https://iedu.jlu.edu.cn/jwapp/sys/emaphome/portal/index.do',
  );
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      'recovery guidance width ' + width,
    );
    if (!root.endsWith('.asar'))
      writeFileSync(
        `.build/setup-recovery-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
  }
  await click('课表');
  await wait(`!!document.querySelector('button[aria-label="同步课表"]')`);
  await js(`document.querySelector('button[aria-label="同步课表"]').click()`);
  await wait(`!!document.querySelector('[aria-label="课表同步处理建议"]')`);
  assert.ok(
    await js(
      `document.querySelector('[aria-label="课表同步处理建议"]').textContent.includes('网页可以访问但 Dela 仍报 403')`,
    ),
  );
  await click('设置');
  await wait('!!document.querySelector("[aria-label=设置分区]")');
  await click('使用指南');
  await idle();
  calls.length = 0;
  mode = 'cancel';
  await click('依次连接吉大平台');
  await idle();
  assert.deepEqual(calls, ['timetable:sync', 'timetable:connect']);
  calls.length = 0;
  academicAttempts = 0;
  mode = 'recover';
  await click('依次连接吉大平台');
  await idle();
  assert.deepEqual(calls, [
    'timetable:sync',
    'timetable:connect',
    'timetable:sync',
    'jlu:notices:sync',
    'jlu:learning:sync',
  ]);
  await click('配置模型');
  await wait('!document.querySelector("[aria-label=使用指南正文]")');
  await click('使用指南');
  await idle();
  assert.equal(
    await js(
      'document.querySelector("[data-platform=academic]").textContent.includes("本次连接成功")',
    ),
    false,
    'revisit uses cache status, not a persistent logged-in claim',
  );
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  await js(
    `localStorage.setItem('dela.onboarding.consent','1');localStorage.removeItem('dela.onboarding.completed');localStorage.setItem('dela.onboarding.step','0')`,
  );
  const wizardUrl = new URL(window.webContents.getURL());
  wizardUrl.searchParams.delete('smoke-test');
  await window.loadURL(wizardUrl.href);
  await wait('!!document.querySelector("[data-onboarding-intro]")');
  await click('开始使用');
  await wait(
    `document.querySelector('[role=group]')?.getAttribute('aria-label')==='第 1 步，共 4 步'`,
  );
  await wait('document.body.textContent.includes("开始配置")');
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      'wizard width ' + width,
    );
  }
  await click('开始配置');
  await wait('document.body.textContent.includes("配置模型服务")');
  await click('跳过');
  await wait('document.body.textContent.includes("校园连接")');
  await idle();
  const beforeReload = calls.length;
  await window.reload();
  await wait('!!document.querySelector("[data-onboarding-intro]")');
  await click('开始使用');
  await wait(
    `document.querySelector('[role=group]')?.getAttribute('aria-label')==='第 3 步，共 4 步'`,
  );
  await idle();
  assert.equal(calls.length, beforeReload, 'resuming setup does not automatically connect');
  await click('打开邮箱');
  await wait(`document.querySelector('h2')?.textContent==='连接吉大邮箱'`);
  assert.equal(
    await js(`!!document.querySelector('#main-nav')`),
    false,
    'mail configuration stays inside the first-run wizard',
  );
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.ok(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      'mail form width ' + width,
    );
  }
  await js(
    `(()=>{for(const [selector,value] of [['input[type=email]','student@mails.jlu.edu.cn'],['input[type=password]','fixture-password']]){const node=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}})()`,
  );
  await js(`document.querySelector('form').requestSubmit()`);
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='跳过'&&b.disabled)`,
  );
  await wait(`document.body.textContent.includes('示例邮箱认证失败，可重试')`);
  assert.equal(mailConnected, false);
  await js(`document.querySelector('form').requestSubmit()`);
  await wait(`document.body.textContent.includes('已连接，返回校园连接')`);
  await click('已连接，返回校园连接');
  await idle();
  assert.ok(
    await js(
      `document.querySelector('[data-platform=mail]').textContent.includes('已连接，可收发邮件')`,
    ),
  );
  assert.deepEqual(mailCalls, ['mail:configure', 'mail:configure', 'mail:sync']);
  assert.equal(await js(`localStorage.getItem('dela.onboarding.completed')`), null);

  await click('跳过');
  await wait('document.body.textContent.includes("完成配置")');
  await click('完成配置');
  await wait('!!document.querySelector("[aria-label=使用指南正文]")');
  assert.equal(await js('localStorage.getItem("dela.onboarding.completed")'), '1');
  console.log(
    'Setup guide smoke passed: local-only status, ordered JLU connection, separate Chaoxing, network errors preserve cache, interrupted authentication stops batch, recovery retries, revisit, four viewport widths, first-run steps, inline mail configuration, failed login retry, busy navigation protection, connected mail before first sync, model skip, resume and completion opening the guide. Synthetic IPC fixtures and consent record in an isolated profile only; no school or model requests.',
  );
}
