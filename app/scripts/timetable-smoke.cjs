const { app, BrowserWindow, net } = require('electron');
const { EventEmitter } = require('node:events');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(process.argv[2] || '.');
app.setAppPath(root);
if (root.endsWith('.asar')) {
  Object.defineProperty(app, 'isPackaged', { value: true });
  process.resourcesPath = dirname(root);
}
const profile = mkdtempSync(join(tmpdir(), 'jlu-timetable-smoke-'));
for (const name of ['userData', 'home', 'documents']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const schoolUrl = 'https://iedu.jlu.edu.cn/jwapp/sys/wdkb/*default/index.do';
let failure = 'none';
let recovery = 'automatic';
const schoolWindows = [];
let loginPreferences;
const requests = [];
const fixture = {
  dqxnxq: [{ DM: '2026-2027-1' }],
  cxxszhxqkb: [
    {
      KBID: 'synthetic',
      KCM: '测试课程',
      KCH: 'DEMO',
      SKJS: '测试教师/fixture',
      JASMC: '测试教室',
      SKXQ: '1',
      KSJC: '1',
      JSJC: '2',
      SKZC: '1111111111111111',
    },
  ],
  jc: [
    { DM: '1', KSSJ: '09:10', JSSJ: '09:55', SFSY: '1' },
    { DM: '2', KSSJ: '10:05', JSSJ: '10:50', SFSY: '1' },
  ],
  cxxljc: [{ XQKSRQ: '2026-09-14', ZZC: '20' }],
  xsdkkc: [],
  xswpkc: [],
};
net.request = (options) => {
  assert.equal(new URL(options.url).hostname, 'iedu.jlu.edu.cn');
  assert.equal(options.useSessionCookies, true);
  const request = new EventEmitter();
  let body = '';
  request.setHeader = () => {};
  request.write = (value) => {
    body += value;
  };
  request.abort = () => {};
  request.end = (value) => {
    body += value ?? '';
    requests.push({ url: options.url, body });
    setImmediate(() => {
      if (failure === 'offline') return request.emit('error', new Error('fixture offline'));
      if (failure === 'expired' || failure === 'redirect') {
        request.emit(
          'redirect',
          302,
          'GET',
          failure === 'expired'
            ? 'https://cas.jlu.edu.cn/tpass/login?service=iedu'
            : 'https://iedu.jlu.edu.cn/maintenance',
          {},
        );
        return;
      }
      const key = new URL(options.url).pathname.split('/').pop().replace('.do', '');
      assert.ok(Object.hasOwn(fixture, key), `unexpected fixture: ${key}`);
      const response = new EventEmitter();
      response.statusCode = failure === 'forbidden' ? 403 : failure === 'server' ? 500 : 200;
      request.emit('response', response);
      response.emit(
        'data',
        Buffer.from(
          JSON.stringify(
            failure === 'schema'
              ? { code: '0', datas: {} }
              : {
                  code: '0',
                  datas: {
                    [key]: {
                      rows: fixture[key],
                      totalSize: ['jc', 'cxxszhxqkb'].includes(key) ? -1 : fixture[key].length,
                      ...(key === 'cxxszhxqkb' ? { pageSize: 0, pageNumber: 0 } : {}),
                    },
                  },
                },
          ),
        ),
      );
      response.emit('end');
    });
  };
  return request;
};
const originalLoad = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = function (url, options) {
  if (url !== schoolUrl) return originalLoad.call(this, url, options);
  loginPreferences = this.webContents.getLastWebPreferences();
  const hidden = !this.isVisible();
  schoolWindows.push({ window: this, hidden, preferences: loginPreferences });
  if (hidden && recovery === 'network') return Promise.reject(new Error('fixture offline'));
  if (hidden && recovery === 'schema') failure = 'schema';
  else if (!hidden || recovery === 'automatic') failure = 'none';
  const target =
    hidden && recovery === 'manual' ? 'https://cas.jlu.edu.cn/tpass/login?service=iedu' : schoolUrl;
  this.webContents.getURL = () => target;
  this.hide();
  this.webContents.once('did-finish-load', () => this.webContents.emit('did-navigate', {}, target));
  return originalLoad.call(
    this,
    'data:text/html,<title>School login fixture</title>' +
      (target === schoolUrl
        ? '<p>Test fixture</p>'
        : '<form id="loginForm"><input type="password"></form>'),
    options,
  );
};
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
  const js = (source) => window.webContents.executeJavaScript(source);
  const wait = async (source) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${source}`);
  };
  await wait('!!window.dela && !!document.querySelector("#main-nav")');
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find((button) => button.textContent.trim() === '课表').click()`,
  );
  await wait('document.body.textContent.includes("登录并同步")');
  await js(
    `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === '登录并同步').click()`,
  );
  await wait('window.dela.timetable.getState().then((state) => !!state.lastSyncedAt)');
  assert.equal(loginPreferences.sandbox, true);
  assert.equal(loginPreferences.contextIsolation, true);
  assert.ok(!loginPreferences.preload);
  let state = await js('window.dela.timetable.getState()');
  let lessons = await js('window.dela.timetable.listLessons()');
  assert.equal(state.semesterStart, '2026-09-14');
  assert.equal(state.totalWeeks, 20);
  assert.equal(lessons[0].startMinute, 550);
  assert.equal(lessons[0].endMinute, 650);
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find((button) => button.textContent.trim() === '课表').click()`,
  );
  await wait('document.body.textContent.includes("测试课程")');
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    assert.equal(
      await js('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
      true,
      `overflow at ${width}`,
    );
    if (width === 1280 && !root.endsWith('.asar')) {
      await js(
        'Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})))',
      );
      mkdirSync('.build', { recursive: true });
      writeFileSync(
        '.build/jlu-timetable-fixture.png',
        (await window.webContents.capturePage()).toPNG(),
      );
    }
  }
  let count = schoolWindows.length;
  failure = 'expired';
  assert.equal((await js('window.dela.timetable.syncNow("2026-2027-1")')).ok, true);
  assert.equal(schoolWindows.length, count + 1);
  assert.equal(schoolWindows.at(-1).hidden, true);
  assert.equal(schoolWindows.at(-1).window.isDestroyed(), true);
  state = await js('window.dela.timetable.getState()');
  lessons = await js('window.dela.timetable.listLessons()');
  for (const mode of ['offline', 'forbidden', 'server', 'redirect', 'schema']) {
    failure = mode;
    count = schoolWindows.length;
    const result = await js('window.dela.timetable.syncNow("2026-2027-1")');
    assert.equal(result.ok, false, mode);
    assert.equal(result.reason, undefined, mode);
    assert.equal(schoolWindows.length, count, mode);
    assert.deepEqual(await js('window.dela.timetable.getState()'), state);
    assert.deepEqual(await js('window.dela.timetable.listLessons()'), lessons);
  }
  for (const mode of ['manual', 'network', 'schema']) {
    recovery = mode;
    failure = 'expired';
    const result = await js('window.dela.timetable.syncNow("2026-2027-1")');
    assert.equal(result.ok, false, mode);
    assert.equal(result.reason, mode === 'manual' ? 'auth' : undefined, mode);
    assert.equal(schoolWindows.at(-1).hidden, true);
    assert.equal(schoolWindows.at(-1).window.isDestroyed(), true);
    assert.deepEqual(await js('window.dela.timetable.getState()'), state);
    assert.deepEqual(await js('window.dela.timetable.listLessons()'), lessons);
  }
  recovery = 'manual';
  failure = 'expired';
  count = schoolWindows.length;
  await js(`document.querySelector('button[aria-label="同步课表"]').click()`);
  await wait(
    `window.dela.timetable.getState().then((value) => value.lastSyncedAt !== ${JSON.stringify(state.lastSyncedAt)})`,
  );
  assert.equal(schoolWindows.length, count + 2);
  assert.equal(schoolWindows.at(-2).hidden, true);
  assert.equal(schoolWindows.at(-1).hidden, false);
  assert.ok(schoolWindows.slice(count).every((item) => item.window.isDestroyed()));

  failure = 'forbidden';
  count = schoolWindows.length;
  await wait(`!document.querySelector('button[aria-label="同步课表"]').disabled`);
  await js(`document.querySelector('button[aria-label="同步课表"]').click()`);
  await wait('document.body.textContent.includes("403")');
  assert.equal(schoolWindows.length, count);
  assert.ok(
    requests.some((request) => new URLSearchParams(request.body).get('XNXQDM') === '2026-2027-1'),
  );
  console.log(
    'Timetable smoke passed with synthetic fixtures: login, SSO recovery, manual-only authentication, error classification, cache preservation, clock times, and four viewport widths. No school account or live school request was used.',
  );
}
