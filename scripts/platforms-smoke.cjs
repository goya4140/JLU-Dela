const { app, BrowserWindow, session } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
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
app.whenReady().then(() => {
  session.fromPartition('persist:jlu-campus').fetch = async (url, options = {}) => {
    assert.equal(url, 'https://ilearnres.jlu.edu.cn/fixture.webm');
    const bytes = readFileSync(join(__dirname, '../assets/onboarding-video.webm'));
    const range = new Headers(options.headers).get('range');
    const match = range && /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
    const data = bytes.subarray(start, end + 1);
    return new Response(options.method === 'HEAD' ? null : data, {
      status: match ? 206 : 200,
      headers: {
        'content-type': 'video/webm',
        'content-length': String(data.length),
        'accept-ranges': 'bytes',
        ...(match ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}),
      },
    });
  };
});
const preferences = [];
const originalLoad = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = function (url, options) {
  const parsed = new URL(url);
  if (!['oa.jlu.edu.cn', 'ilearntec.jlu.edu.cn', 'ilearnres.jlu.edu.cn'].includes(parsed.hostname))
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
  } else if (parsed.hostname === 'ilearnres.jlu.edu.cn') {
    html = `<script>window.fetch=async(url)=>({ok:true,json:async()=>({status:'1',data:url.includes('videoClassInfo')?{videoList:[{videoName:'教师画面',videoPath:'https://ilearnres.jlu.edu.cn/fixture.webm'}]}:{textInfo:[{startTime:0,endTime:5000,text:'示例课堂字幕，用于引用和提问。'},{startTime:5000,endTime:10000,text:'第二段示例字幕。'}]}})});</script>`;
  } else {
    html = `<script>window.fetch=async(url)=>({ok:true,status:200,json:async()=>({data:{dataList:url.includes('termList')?[{id:'t1',year:'2026',num:'1',name:'秋季',selected:'1'}]:url.includes('myClassroom')?[{id:'c1',name:'示例班级',courseName:'示例课程',teacherName:'示例教师',statusName:'进行中'}]:[{id:'r1',resourceId:'res1',liveRecordName:'第一讲',currentDate:'2026-10-30',timeRange:'08:00-09:40',roomName:'示例教室',liveStatus:'2'}]}})});</script>`;
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
    console.error(
      await js(
        `JSON.stringify({page:document.body.innerText.slice(-1600),video:document.querySelector('video') && {readyState:document.querySelector('video').readyState,networkState:document.querySelector('video').networkState,error:document.querySelector('video').error?.message}})`,
      ),
    );
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
  assert.equal((await js('window.dela.jluPlatforms.syncNotices("179577",2)')).ok, true);
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
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('示例课程')).click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('进入学习')&&!b.disabled)`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('进入学习')).click()`,
  );
  await wait(
    `!!document.querySelector('video') && document.querySelector('video').readyState >= 1 && !!document.querySelector('[aria-label="课程学习笔记"]')`,
  );
  const tools = await js('window.dela.jluPlatforms.studyWorkspace("c1","r1")');
  assert.deepEqual(await js('window.dela.jluPlatforms.studyWorkspace("c1","r1")'), tools);
  assert.equal(
    await js(`document.querySelector('video').src.startsWith('dela-resource://jlu-video/')`),
    true,
  );
  await wait(`document.querySelector('video').textTracks[0]?.cues.length===2`);
  await js(`document.querySelector('video').play()`);
  await wait(`document.querySelector('video').currentTime>0`);
  await js(
    `document.querySelector('video').pause();document.querySelector('[aria-label="课程学习笔记"]').focus()`,
  );
  window.webContents.insertText('人工测试笔记内容\n');
  await wait(
    `window.dela.workspace.read(${JSON.stringify(tools.noteId)}).then(r=>r.text.includes('人工测试笔记内容'))`,
  );
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      `study ${width}`,
    );
    if (width < 1280)
      assert.equal(
        await js(
          `document.querySelector('[aria-label="视频与字幕"]').getBoundingClientRect().bottom<=document.querySelector('[aria-label="学习笔记与 AI"]').getBoundingClientRect().top`,
        ),
        true,
        `study panels ${width}`,
      );
    if (!root.endsWith('.asar'))
      writeFileSync(
        `.build/study-notes-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
  }
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('引用当前片段')).click()`,
  );
  await wait(
    `document.querySelector('[aria-label="发送给助手"]')?.textContent.includes('示例课堂字幕')`,
  );
  assert.equal(
    (await js(`window.dela.session.open(${JSON.stringify(tools.sessionId)})`)).messages.length,
    0,
  );
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      `study AI ${width}`,
    );
    if (!root.endsWith('.asar'))
      writeFileSync(
        `.build/study-ai-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
  }
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('返回目录')).click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('进入学习'))`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('进入学习')).click()`,
  );
  await wait(
    `document.querySelector('[aria-label="课程学习笔记"]')?.textContent.includes('人工测试笔记内容')`,
  );
  assert.deepEqual(await js('window.dela.jluPlatforms.studyWorkspace("c1","r1")'), tools);
  offline = true;
  const failed = await js('window.dela.jluPlatforms.syncNotices("179577",1)');
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, undefined);
  assert.deepEqual(await js('window.dela.jluPlatforms.getNotices("179577",1)'), notice);
  assert.equal((await js('window.dela.jluPlatforms.syncLearning()')).ok, false);
  assert.deepEqual(await js('window.dela.jluPlatforms.getLearning()'), learning.data);
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='学校通知').click()`,
  );
  await wait('!!document.querySelector(\'button[aria-label="下一页通知"]\')');
  await js(`document.querySelector('button[aria-label="下一页通知"]').click()`);
  await wait('document.body.textContent.includes("第 2")');
  assert.ok(preferences.every((p) => p.sandbox && p.contextIsolation && !p.preload));
  console.log(
    'Platforms smoke passed with synthetic data: notices, courses, embedded video, subtitles, AI drafts, saved study notes, cache preservation, isolated sessions and four viewport widths. No live school or model requests.',
  );
}
