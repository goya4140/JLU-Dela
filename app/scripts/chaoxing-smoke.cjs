const { app, BrowserWindow, session, safeStorage, dialog } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, dirname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(process.argv[2] || '.');
app.setAppPath(root);
if (root.endsWith('.asar')) {
  Object.defineProperty(app, 'isPackaged', { value: true });
  process.resourcesPath = dirname(root);
}
const profile = mkdtempSync(join(tmpdir(), 'dela-cx-smoke-'));
for (const name of ['userData', 'documents', 'home']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
Object.assign(safeStorage, {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from('fixture-sealed:' + value),
  decryptString: (value) => value.toString().slice('fixture-sealed:'.length),
});
let offline = false;
let downloadRedirects = 0;
let requiresLogin = false;
let workLoads = 0;
const privateQuery = 'courseid=1&clazzid=2&cpi=3&enc=fixture-private';
const pdfObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',
  '<< /Length 0 >>\nstream\n\nendstream',
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
pdfObjects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 5\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => String(offset).padStart(10, '0') + ' 00000 n ')
  .join('\n')}\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
app.whenReady().then(() => {
  const cx = session.fromPartition('persist:chaoxing');
  cx.protocol.handle('https', (request) => {
    const url = new URL(request.url);
    assert.ok(url.hostname.endsWith('.chaoxing.com') || url.hostname === 'd0.cldisk.com');
    if (offline) return new Response('fixture unavailable', { status: 503 });
    let html = '';
    if (url.pathname === '/base')
      html = `<h3 id="first21583">Courses</h3><iframe id="frame_content" src="https://mooc2-ans.chaoxing.com/visit/interaction"></iframe>`;
    else if (url.pathname === '/visit/interaction')
      html = `<div class="course learnCourse"><div class="course-info"><h3><a href="https://mooc1.chaoxing.com/visit/stucoursemiddle?${privateQuery}"><span class="course-name" title="示例课程">示例课程</span></a></h3><p class="color3">示例教师</p></div></div>`;
    else if (url.pathname === '/visit/stucoursemiddle')
      return Response.redirect(
        `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?${privateQuery}`,
      );
    else if (url.pathname === '/mooc2-ans/mycourse/stu')
      html =
        url.searchParams.get('pageHeader') === '8'
          ? '<iframe id="frame_content-zy" src="https://mooc1.chaoxing.com/mooc2/work/list"></iframe>'
          : `<iframe id="frame_content-zl" src="https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?${privateQuery}"></iframe>`;
    else if (url.pathname === '/mooc2/work/list')
      html =
        '<div class="bottomList"><li role="link" data="https://mooc1.chaoxing.com/mooc2/work/task?workId=w1&answerId=private"><div class="right-content"><p class="overHidden2">示例作业</p><p class="status">未交</p></div><div class="time">剩余2天</div></li></div>';
    else if (url.pathname === '/mooc2/work/task') {
      if (requiresLogin) return Response.redirect('https://passport2.chaoxing.com/login');
      workLoads++;
      html =
        '<h1>示例作业原网页</h1><p>截止时间：2026-11-02 20:00</p><p id="question">解释微控制器的工作过程</p><textarea id="answer" aria-label="示例作答"></textarea><a href="https://mooc1.chaoxing.com/fixture-next">下一页</a>';
    } else if (url.pathname === '/login')
      html = '<a href="https://mooc1.chaoxing.com/fixture-login-done">完成示例登录</a>';
    else if (url.pathname === '/fixture-login-done') {
      requiresLogin = false;
      html = '<p>示例登录已恢复</p>';
    } else if (url.pathname === '/fixture-next') html = '<h1>示例下一页</h1>';
    else if (url.pathname === '/mooc2-ans/coursedata/stu-datalist')
      html = `<input id="downloadDomain" value="https://mooc1.chaoxing.com"><input id="courseId" value="1"><input id="classId" value="2"><input id="cpi" value="3"><input id="enc" value="fixture-private"><div class="dataBody">${url.searchParams.has('dataId') ? '<ul class="dataBody_td" id="d1" type="pdf" dataname="示例课件.pdf" isdown="1"><li class="dataBody_size_stu">5KB</li></ul>' : '<ul class="dataBody_td" id="f1" type="afolder" dataname="示例资料夹"></ul>'}</div>`;
    else if (url.pathname === '/coursedata/downloadData') {
      downloadRedirects++;
      return Response.redirect('https://d0.cldisk.com/fixture.pdf');
    } else if (url.pathname === '/fixture.pdf') {
      assert.equal(request.headers.get('referer'), 'https://mooc2-ans.chaoxing.com/');
      return new Response(pdf, { headers: { 'content-type': 'application/pdf' } });
    } else throw new Error('Unexpected fixture request: ' + url.pathname);
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
});
const preferences = [];
app.once('browser-window-created', (_event, window) => {
  app.on('browser-window-created', (_event, child) =>
    preferences.push({
      ...child.webContents.getLastWebPreferences(),
      isChaoxing: child.webContents.session === session.fromPartition('persist:chaoxing'),
    }),
  );
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
      console.error('Renderer step failed:', source);
      throw error;
    }
  };
  const wait = async (source) => {
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    console.error(await js('document.body.innerText.slice(-1200)'));
    throw new Error('Timed out: ' + source);
  };
  await wait('!!window.dela?.chaoxing && !!document.querySelector("#main-nav")');
  const courses = await js('window.dela.chaoxing.syncCourses()');
  assert.equal(courses.ok, true);
  assert.equal(courses.data.items.length, 1);
  assert.ok(!JSON.stringify(courses).includes('fixture-private'));
  const files = await js('window.dela.chaoxing.syncFiles("1:2")');
  assert.equal(files.ok, true);
  assert.equal(
    (await js('window.dela.chaoxing.syncFiles("1:2","f1")')).data.items[0].downloadable,
    true,
  );
  const works = await js('window.dela.chaoxing.syncWorks("1:2")');
  assert.equal(works.data.items[0].status, '未交');
  const imported = await js('window.dela.chaoxing.importFile("1:2","f1","d1")');
  assert.ok(imported.id.startsWith(profile));
  assert.equal(readFileSync(imported.id, 'utf8'), pdf);
  const workspaceState = await js('window.dela.workspace.getState()');
  const importedFolder = workspaceState.entries.find((entry) => entry.name === '学习通资料');
  assert.ok(importedFolder);
  const courseFolder = (
    await js(`window.dela.workspace.listLocalDirectory(${JSON.stringify(importedFolder.id)})`)
  ).find((entry) => entry.name === '示例课程 (1_2)');
  assert.ok(courseFolder);
  assert.ok(
    (
      await js(
        `window.dela.workspace.listLocalDirectory(${JSON.stringify(join(courseFolder.path, '示例资料夹'))})`,
      )
    ).some((entry) => entry.id === imported.id),
  );
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='学习通').click()`,
  );
  await wait('document.body.textContent.includes("示例课程")');
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('示例课程')).click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='示例资料夹'&&!b.disabled)`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='示例资料夹').click()`,
  );
  await wait(
    `document.body.textContent.includes('示例课件.pdf') && !document.querySelector('fieldset').disabled`,
  );
  window.setMinimumSize(360, 500);
  for (const mode of ['files', 'works']) {
    if (mode === 'works') {
      await js(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='作业').click()`,
      );
      await wait(
        `document.body.textContent.includes('示例作业') && !document.querySelector('fieldset').disabled`,
      );
    }
    await js(
      'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
    );
    for (const width of [600, 900, 1280, 1800]) {
      window.setSize(width, 850);
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(
        await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
        true,
        `${mode} ${width}`,
      );
      if (!root.endsWith('.asar')) {
        mkdirSync('.build', { recursive: true });
        writeFileSync(
          `.build/chaoxing-${mode}-${width}.png`,
          (await window.webContents.capturePage()).toPNG(),
        );
      }
    }
  }
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='资料').click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='示例资料夹'&&!b.disabled)`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='示例资料夹').click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('打开本地文件')&&!b.disabled)`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('打开本地文件')).click()`,
  );
  await wait(
    `!!document.querySelector('canvas') && document.body.textContent.includes('示例课件')`,
  );
  assert.equal(await js("'canvas' in window.dela"), false);
  const searchResults = await js('window.dela.search.query("示例课件")');
  const importedFile = searchResults.find((row) => row.kind === 'course-file');
  assert.ok(importedFile?.target.entryId.includes('学习通资料'));
  assert.ok(!importedFile.target.entryId.startsWith('source:'));
  const importedDirectory = importedFile.target.entryId.slice(
    0,
    importedFile.target.entryId.lastIndexOf('/'),
  );
  const references = await js(
    `window.dela.workspace.localReferenceFiles(${JSON.stringify(importedDirectory)})`,
  );
  assert.ok(references.some((file) => file.path === importedFile.target.entryId));
  await assert.rejects(js("window.dela.workspace.openLink('javascript:alert(1)')"), /不支持的链接/);
  await assert.rejects(
    js("window.dela.workspace.openLink('https://user:secret@example.test')"),
    /不支持的链接/,
  );
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='课程资料').click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='打开学习通')`,
  );
  if (!root.endsWith('.asar'))
    writeFileSync('.build/chaoxing-library.png', (await window.webContents.capturePage()).toPNG());
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='打开学习通').click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('示例课程'))`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('示例课程')).click()`,
  );
  await wait(
    `!!document.querySelector('fieldset') && !document.querySelector('fieldset').disabled && document.body.textContent.includes('示例资料夹')`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='作业').click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='在工作台打开作业')`,
  );
  requiresLogin = true;
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='在工作台打开作业').click()`,
  );
  await wait(`!!document.querySelector('[aria-label="学习通原网页区域"]')`);
  const native = () =>
    window.contentView.children.find(
      (view) => view.webContents && view.webContents !== window.webContents,
    );
  const until = async (check) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Native work page timed out');
  };
  await until(() => native()?.webContents.getURL().includes('/login'));
  console.log('Native school login shown in workbench');
  const page = native();
  const remote = page.webContents;
  remote.setBackgroundThrottling(false);
  const pref = remote.getLastWebPreferences();
  assert.ok(pref.sandbox && pref.contextIsolation && !pref.nodeIntegration && !pref.preload);
  assert.equal(remote.session, session.fromPartition('persist:chaoxing'));
  assert.equal(await remote.executeJavaScript('typeof window.dela'), 'undefined');
  await remote.executeJavaScript('document.querySelector("a").click()', true);
  await until(() => remote.getURL().includes('workId=w1') && !remote.isLoading());
  await wait(`document.body.textContent.includes('已读取作业时间')`);
  console.log('Native login recovery and deadline extraction passed');
  const datedWork = (await js('window.dela.chaoxing.calendar()')).works[0];
  assert.deepEqual(datedWork.deadline, { date: '2026-11-02', time: '20:00' });
  assert.ok(datedWork.detailSyncedAt);
  await remote.executeJavaScript('document.querySelector("textarea").value="尚未提交的示例草稿"');
  await js(`document.querySelector('[data-tab^="preview:"]').click()`);
  await until(() => !page.getVisible());
  await js(`document.querySelector('[data-tab="web:chaoxing/1:2/w1"]').click()`);
  await until(() => page.getVisible());
  assert.equal(native().webContents.id, remote.id);
  assert.equal(
    await remote.executeJavaScript('document.querySelector("textarea").value'),
    '尚未提交的示例草稿',
  );
  // A DOM dialog must temporarily hide the native layer.
  await js(
    `{ const d=document.createElement('div'); d.setAttribute('role','dialog'); d.id='fixture-dialog'; d.textContent='示例对话框'; document.body.append(d); }`,
  );
  await until(() => !page.getVisible());
  await js(`document.getElementById('fixture-dialog').remove()`);
  await until(() => page.getVisible());
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const rect = await js(
      `(()=>{const r=document.querySelector('[aria-label="学习通原网页区域"]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    const bounds = page.getBounds();
    assert.ok(
      Math.abs(bounds.x - rect.x) < 2 && Math.abs(bounds.y - rect.y) < 2,
      'native position',
    );
    assert.ok(
      Math.abs(bounds.width - rect.width) < 2 && Math.abs(bounds.height - rect.height) < 2,
      'native size',
    );
    assert.ok(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
    );
  }
  await remote.executeJavaScript(
    `{ const r=document.createRange(); r.selectNodeContents(document.getElementById('question')); const s=getSelection();s.removeAllRanges();s.addRange(r); }`,
  );
  const loads = workLoads;
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='选中文字问 AI').click()`,
  );
  await wait(`document.body.textContent.includes('选中文字已放入 AI 草稿')`);
  assert.equal(workLoads, loads);
  assert.equal(
    await remote.executeJavaScript('document.querySelector("textarea").value'),
    '尚未提交的示例草稿',
  );
  const draft = await js(`localStorage.getItem('dela.session.drafts')`);
  assert.ok(draft.includes('解释微控制器的工作过程') && !draft.includes('尚未提交的示例草稿'));
  const layout = await js(`localStorage.getItem('dela.workspace.project')`);
  assert.ok(!String(layout).includes('private'));
  console.log('Native retained forms, bounds, overlays and split AI draft passed');
  // Exercise the browser's own beforeunload protection without a real submission.
  await remote.executeJavaScript('window.onbeforeunload=()=>false; undefined', true);
  let prompts = 0;
  const originalDialog = dialog.showMessageBoxSync;
  dialog.showMessageBoxSync = () => {
    prompts++;
    return 0;
  };
  const closeWork = async (label) => {
    let timer;
    try {
      return await Promise.race([
        js(`window.dela.webTabs.close('web:chaoxing/1:2/w1')`),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(label + ' timed out; prompts=' + prompts)),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  assert.equal(await closeWork('Cancel work page unload'), false);
  console.log('Native beforeunload cancellation passed');
  assert.equal(prompts, 1);
  assert.equal(remote.isDestroyed(), false);
  await remote.executeJavaScript('document.readyState');
  dialog.showMessageBoxSync = () => 1;
  assert.equal(await closeWork('Confirm work page unload'), true);
  console.log('Native beforeunload confirmation passed');
  dialog.showMessageBoxSync = originalDialog;
  assert.equal(remote.isDestroyed(), true);
  const localLibrary = join(profile, '本地知识库');
  const localCourse = join(localLibrary, '本学期课程');
  mkdirSync(localCourse, { recursive: true });
  const existing = join(localCourse, '已下载的课件.pdf');
  writeFileSync(existing, pdf);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [localLibrary] });
  const knowledge = await js('window.dela.knowledge.attach()');
  const linkedCourse = await js(
    `window.dela.knowledge.enroll(${JSON.stringify(knowledge.id)},'本学期课程')`,
  );
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='学习通').click()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('示例课程'))`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('示例课程')).click()`,
  );
  await wait(
    `document.querySelector('select[aria-label="关联本地课程"]')?.options.length===2 && !document.querySelector('fieldset').disabled`,
  );
  await js(
    `(()=>{const select=document.querySelector('select[aria-label="关联本地课程"]');select.value=${JSON.stringify(linkedCourse.id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await wait(
    `document.body.textContent.includes(${JSON.stringify(localCourse)}) && !document.querySelector('fieldset').disabled`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='示例资料夹').click()`,
  );
  await wait(
    `document.body.textContent.includes('示例课件.pdf') && !document.querySelector('fieldset').disabled`,
  );
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [existing] });
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='关联本地文件').click()`,
  );
  await wait(`document.body.textContent.includes('已关联本地文件')`);
  const linked = await js('window.dela.chaoxing.files("1:2","f1")');
  assert.equal(linked.items[0].local.origin, 'linked');
  assert.equal(linked.items[0].local.status, 'ready');
  const reopened = await js('window.dela.chaoxing.importFile("1:2","f1","d1")');
  assert.equal(readFileSync(reopened.id, 'utf8'), pdf);
  assert.equal(downloadRedirects, 1);
  const latestWorks = await js('window.dela.chaoxing.works("1:2")');
  offline = true;
  const failed = await js('window.dela.chaoxing.syncWorks("1:2")');
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, undefined);
  assert.deepEqual(await js('window.dela.chaoxing.works("1:2")'), latestWorks);
  assert.ok(
    preferences.every(
      (p) => p.isChaoxing && p.sandbox && p.contextIsolation && !p.nodeIntegration && !p.preload,
    ),
  );
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  assert.equal(downloadRedirects, 1);
  console.log(
    'Chaoxing smoke passed: isolated session, course redirects, nested folders, assignment metadata, native download redirects, local PDF import, course and file associations without duplicate downloads, failure cache retention, native workbench tabs, in-tab login recovery, exact deadlines, retained forms, overlay hiding, split AI drafts, beforeunload cancellation and four viewport widths. Synthetic data only; no school or model requests.',
  );
}
