const { app, BrowserWindow, Menu } = require('electron');
const { dirname, join, resolve } = require('node:path');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');

const root = resolve(process.argv[2] || '.');
app.setAppPath(root);
if (root.endsWith('.asar')) {
  Object.defineProperty(app, 'isPackaged', { value: true });
  process.resourcesPath = dirname(root);
}
const profile = mkdtempSync(join(tmpdir(), 'jlu-dela-smoke-'));
for (const name of ['userData', 'documents', 'home']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once('did-finish-load', () => {
    void run(window).then(
      () => app.exit(0),
      (error) => {
        console.error(error);
        app.exit(1);
      },
    );
  });
});
require(join(root, 'out/main/index.cjs'));

async function run(window) {
  const js = (source) => window.webContents.executeJavaScript(source);
  const wait = async (source, label) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${label}`);
  };
  await wait('!!window.dela && !!document.querySelector("#main-nav")', 'workspace ready');
  assert.equal(app.getName(), 'JLU Dela');
  assert.equal(app.getPath('userData'), profile);
  assert.equal((await js('window.dela.workspace.getState()')).directory, join(profile, 'JLU-Dela'));
  const skills = await js('window.dela.capability.listSkills()');
  assert.ok(
    !skills.some((skill) =>
      ['canvas', 'classroom', 'shuiyuan', 'mail', 'todo'].includes(skill.name),
    ),
  );
  assert.ok(
    skills
      .find((skill) => skill.name === 'document-reading')
      .path.startsWith(join(profile, '.jlu-dela')),
  );
  if (process.platform === 'darwin')
    assert.equal(Menu.getApplicationMenu().items[0].label, 'JLU Dela');
  await js(
    `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === '吉大校园').click()`,
  );
  await wait('document.querySelector("h1")?.textContent === "吉大校园"', 'JLU campus view');
  const links = await js(
    `Array.from(document.querySelectorAll('[data-setting-id="jlu-campus"] a')).map((link) => link.href)`,
  );
  assert.deepEqual(links, [
    'https://iedu.jlu.edu.cn/jwapp/sys/emaphome/portal/index.do',
    'https://oa.jlu.edu.cn/defaultroot/login.jsp?access=oa',
    'https://ilearntec.jlu.edu.cn/studycenter-web/index#/',
    'https://i.chaoxing.com/base',
  ]);
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('span')).filter((node) => node.textContent === '同步待接入').length`,
    ),
    0,
  );
  if (!root.endsWith('.asar')) {
    await js(
      `Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})))`,
    );
    mkdirSync('.build', { recursive: true });
    writeFileSync('.build/jlu-campus.png', (await window.webContents.capturePage()).toPNG());
  }
  await js(
    `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === '学校通知').click()`,
  );
  await wait('document.querySelector("h1")?.textContent === "学校通知"', 'JLU notifications view');
  assert.equal(await js('document.body.textContent.includes("刷新通知")'), true);
  assert.equal(await js('document.body.textContent.includes("尚未同步")'), true);
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find((button) => button.textContent.trim() === '课程资料').click()`,
  );
  await wait('document.body.textContent.includes("本地课程资料")', 'local course library');
  assert.equal(await js('document.body.textContent.includes("连接 Canvas")'), false);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log(
    'JLU smoke passed: isolated profile, native menu, campus links, preview integrations and notifications route.',
  );
}
