const { app, BrowserWindow } = require('electron');
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
const profile = mkdtempSync(join(tmpdir(), 'jlu-platforms-'));
for (const name of ['userData', 'home', 'documents']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
let offline = false;
const preferences = [];
const originalLoad = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = function (url, options) {
  const parsed = new URL(url);
  if (!['oa.jlu.edu.cn', 'ilearntec.jlu.edu.cn'].includes(parsed.hostname))
    return originalLoad.call(this, url, options);
  preferences.push(this.webContents.getLastWebPreferences());
  this.hide();
  this.webContents.getURL = () => url;
  if (offline) return Promise.reject(new Error('fixture offline'));
  let html;
  if (parsed.hostname === 'oa.jlu.edu.cn') {
    html = parsed.pathname.includes('jldxList')
      ? '<div id="itemContainer"><div class="li"><a class="font14" href="https://oa.jlu.edu.cn/defaultroot/PortalInformation!getInformation.action?id=1&channelId=179577">示例通知</a><a class="column">示例单位</a><span class="time">2026-10-30</span></div></div><p>第 1 /2 页 共 2 条记录</p>'
      : '<div class="content_t">示例通知全文</div><div class="content_time">示例单位</div><div class="content_font">示例正文</div><a href="https://oa.jlu.edu.cn/defaultroot/rd/download/attachdownload.jsp?res=fixture">示例附件</a>';
  } else {
    html = `<script>window.fetch=async(url)=>({ok:true,status:200,json:async()=>({data:{dataList:url.includes('termList')?[{id:'t1',year:'2026',num:'1',name:'秋季',selected:'1'}]:url.includes('myClassroom')?[{id:'c1',name:'示例班级',courseName:'示例课程',teacherName:'示例教师',statusName:'进行中'}]:[{id:'r1',liveRecordName:'第一讲',currentDate:'2026-10-30',timeRange:'08:00-09:40',roomName:'示例教室',liveStatus:'2'}]}})});</script>`;
  }
  return originalLoad.call(
    this,
    'data:text/html;charset=utf-8,' + encodeURIComponent(html),
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
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out: ' + source);
  };
  await wait('!!window.dela && !!document.querySelector("#main-nav")');
  const first = await js('window.dela.jluPlatforms.syncNotices("179577",1)');
  assert.equal(first.ok, true);
  assert.equal(
    (await js('window.dela.jluPlatforms.readNotice("1","179577")')).data.attachments.length,
    1,
  );
  const notice = await js('window.dela.jluPlatforms.getNotices("179577",1)');
  const learning = await js('window.dela.jluPlatforms.syncLearning()');
  assert.equal(learning.ok, true);
  assert.equal(learning.data.courses.length, 1);
  assert.equal((await js('window.dela.jluPlatforms.syncRecordings("c1")')).data.items.length, 1);
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='学校通知').click()`,
  );
  await wait('document.body.textContent.includes("示例通知")');
  await js(
    'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
  );
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
      true,
      `notices ${width}`,
    );
    if (!root.endsWith('.asar')) {
      mkdirSync('.build', { recursive: true });
      writeFileSync(
        `.build/platforms-notices-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
  }
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='学在吉大').click()`,
  );
  await wait('document.body.textContent.includes("示例课程")');
  await js(
    'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
  );
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
      true,
      `learning ${width}`,
    );
    if (!root.endsWith('.asar')) {
      writeFileSync(
        `.build/platforms-learning-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
  }
  if (!root.endsWith('.asar')) {
    mkdirSync('.build', { recursive: true });
    writeFileSync(
      '.build/jlu-learning-fixture.png',
      (await window.webContents.capturePage()).toPNG(),
    );
  }
  offline = true;
  const failed = await js('window.dela.jluPlatforms.syncNotices("179577",1)');
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, undefined);
  assert.deepEqual(await js('window.dela.jluPlatforms.getNotices("179577",1)'), notice);
  assert.equal((await js('window.dela.jluPlatforms.syncLearning()')).ok, false);
  assert.deepEqual(await js('window.dela.jluPlatforms.getLearning()'), learning.data);
  assert.ok(preferences.every((p) => p.sandbox && p.contextIsolation && !p.preload));
  console.log(
    'Platforms smoke passed with synthetic data: notices, body, attachments, learning terms/courses/recordings, cache preservation, isolated sessions and four viewport widths. No live school requests.',
  );
}
