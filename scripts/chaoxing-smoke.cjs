const { app, BrowserWindow, session, safeStorage } = require('electron');
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
  const js = (source) => window.webContents.executeJavaScript(source);
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
  ).find((entry) => entry.name === '示例课程');
  assert.ok(courseFolder);
  assert.ok(
    (await js(`window.dela.workspace.listLocalDirectory(${JSON.stringify(courseFolder.id)})`)).some(
      (entry) => entry.id === imported.id,
    ),
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
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('导入并打开')&&!b.disabled)`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('导入并打开')).click()`,
  );
  await wait(
    `!!document.querySelector('canvas') && document.body.textContent.includes('示例课件')`,
  );
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
  assert.ok(downloadRedirects >= 2);
  console.log(
    'Chaoxing smoke passed: isolated session, course redirects, nested folders, assignment metadata, native download redirects, local PDF import, failure cache retention and four viewport widths. Synthetic data only; no school or model requests.',
  );
}
