const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, dirname } = require('node:path');
const Database = require('better-sqlite3');
const assert = require('node:assert/strict');
const root = resolve(process.argv[2] || '.');
app.setAppPath(root);
if (root.endsWith('.asar')) {
  Object.defineProperty(app, 'isPackaged', { value: true });
  process.resourcesPath = dirname(root);
}
const profile = mkdtempSync(join(tmpdir(), 'study-calendar-smoke-'));
for (const name of ['userData', 'documents', 'home']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
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
  const now = new Date(),
    year = now.getFullYear(),
    month = String(now.getMonth() + 1).padStart(2, '0'),
    today = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;
  const syncedAt = now.toISOString();
  const lesson = {
    id: 1,
    semester: 'fixture',
    courseCode: 'CS1',
    courseName: '示例课程',
    className: null,
    teacher: '示例教师',
    campus: null,
    classroom: '示例教室',
    weekday: now.getDay() || 7,
    startPeriod: 1,
    endPeriod: 2,
    startMinute: 480,
    endMinute: 575,
    periodsText: '1-2节',
    weeksText: '1-16周',
    weekNumbers: Array.from({ length: 16 }, (_, i) => i + 1),
    credits: null,
    note: null,
  };
  const db = new Database(join(profile, 'dela.db'));
  const save = (key, data) =>
    db
      .prepare('INSERT OR REPLACE INTO jlu_platform_cache VALUES (?,?)')
      .run(key, JSON.stringify(data));
  save('cx:courses', {
    items: [
      { id: 'a', name: '示例课程', teacher: '示例教师', ended: false },
      { id: 'b', name: '尚未读取课程', teacher: '', ended: false },
    ],
    syncedAt,
  });
  save('cx:works:a', {
    courseId: 'a',
    syncedAt,
    items: [
      { id: '1', title: '示例课程报告', status: '未交', timing: `截止时间：${today} 23:59` },
      { id: '2', title: '时间待确认作业', status: '未交', timing: '剩余2天' },
      { id: '3', title: '已完成示例报告', status: '已提交', timing: `截止日期：${today}` },
    ],
  });
  ipcMain.removeHandler('timetable:get-state');
  ipcMain.handle('timetable:get-state', () => ({
    semester: 'fixture',
    semesterStart: `${year}-${month}-01`,
    lastSyncedAt: syncedAt,
    totalWeeks: 16,
  }));
  ipcMain.removeHandler('timetable:list-lessons');
  ipcMain.handle('timetable:list-lessons', () => [lesson]);
  let syncs = 0;
  ipcMain.removeHandler('cx:calendar:sync');
  ipcMain.handle('cx:calendar:sync', async () => {
    syncs++;
    throw new Error('示例网络超时');
  });
  const js = (code) => window.webContents.executeJavaScript(code, true);
  const wait = async (code) => {
    for (let i = 0; i < 100; i++) {
      if (await js(code)) return;
      await new Promise((r) => setTimeout(r, 80));
    }
    throw new Error(`Timed out: ${code}\n${await js('document.body.innerText')}`);
  };
  await wait(`document.querySelector('[title="学习日历"]')`);
  await js(`document.querySelector('[title="学习日历"]').click()`);
  await wait(
    `document.querySelector('[aria-label="学习月历"]') && document.body.textContent.includes('示例课程报告')`,
  );
  assert.equal(syncs, 0);
  assert.equal(
    await js(
      `document.querySelector('[aria-label="学习月历"]').textContent.includes('时间待确认作业')`,
    ),
    false,
  );
  assert.ok(
    await js(
      `document.querySelector('[aria-label="未定日期事项"]').textContent.includes('时间待确认作业')`,
    ),
  );
  assert.ok(await js(`document.body.textContent.includes('尚未读取课程')`));
  const click = (label) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`,
    );
  await click('刷新学习通作业');
  await wait(`document.body.textContent.includes('示例网络超时')`);
  assert.ok(await js(`document.body.textContent.includes('示例课程报告')`));
  const cached = await js('window.dela.chaoxing.calendar()');
  assert.equal(cached.works.length, 3);
  window.setMinimumSize(360, 500);
  for (const [view, selector] of [
    ['月', '学习月历'],
    ['周', '学习周历'],
    ['列表', '学习日历列表'],
  ]) {
    await click(view);
    await wait(`document.querySelector('[aria-label="${selector}"]')`);
    for (const width of [600, 900, 1280, 1800]) {
      window.setSize(width, 850);
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.equal(
        await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
        true,
        `${view} ${width}`,
      );
      if (!root.endsWith('.asar')) {
        mkdirSync('.build', { recursive: true });
        writeFileSync(
          `.build/study-calendar-${view}-${width}.png`,
          (await window.webContents.capturePage()).toPNG(),
        );
      }
    }
  }
  await click('月');
  await js(`document.querySelector('[aria-label^="作业：示例课程报告"]').click()`);
  await wait(`document.querySelector('[aria-label="学习日历详情"]')`);
  assert.ok(await js(`document.querySelector('[role="dialog"]').textContent.includes('23:59')`));
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('[role="dialog"] button')).some(b=>b.textContent.includes('标为完成'))`,
    ),
    false,
  );
  db.close();
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log(
    'Study calendar smoke passed: real cached work aggregation, timetable projection, explicit/unknown deadlines, coverage, failed refresh preserves cache, work details, three views and four viewport widths. Isolated synthetic data only; no school or model requests.',
  );
}
