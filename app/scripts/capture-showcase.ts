import { app, ipcMain, safeStorage, session, type BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TimetableLesson } from '../src/shared/api';

process.env.TZ = 'Asia/Shanghai';
const root = process.cwd();
const output = join(root, 'docs/demos');
const profile = mkdtempSync(join(tmpdir(), 'jlu-showcase-'));
for (const name of ['userData', 'documents', 'home'] as const) app.setPath(name, profile);
(app as typeof app & { setAppPath(path: string): void }).setAppPath(root);
process.argv.push('--terminal-smoke-test');
Object.assign(safeStorage, {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from('synthetic:' + text),
  decryptString: (data: Buffer) => data.toString().slice('synthetic:'.length),
});
const now = new Date();
const syncedAt = now.toISOString();
const monday = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - ((now.getDay() + 6) % 7),
);
const dateAt = (day: number) => {
  const value = new Date(monday);
  value.setDate(value.getDate() + day);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const subjects = ['高等数学', '计算机网络', '算法设计', '数据结构', '软件工程'];
const lessons: TimetableLesson[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  semester: 'demo',
  courseCode: 'DEMO' + (i % 5),
  courseName: subjects[i % 5]!,
  className: null,
  teacher: '示例教师',
  campus: '示例校区',
  classroom: '示例教室',
  weekday: (i % 5) + 1,
  startPeriod: i < 5 ? 1 : 5,
  endPeriod: i < 5 ? 2 : 6,
  startMinute: i < 5 ? 480 : 810,
  endMinute: i < 5 ? 575 : 905,
  periodsText: i < 5 ? '1–2 节' : '5–6 节',
  weeksText: '1–16 周',
  weekNumbers: Array.from({ length: 16 }, (_, week) => week + 1),
  credits: null,
  note: null,
}));
const mailSync = {
  phase: 'idle',
  folderPath: null,
  processed: 0,
  total: null,
  error: null,
  startedAt: syncedAt,
  finishedAt: syncedAt,
};
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) =>
  originalHandle(channel, (event, ...args: unknown[]) => {
    if (channel === 'timetable:get-state')
      return { semester: 'demo', semesterStart: dateAt(0), lastSyncedAt: syncedAt, totalWeeks: 16 };
    if (channel === 'timetable:list-lessons') return lessons;
    if (channel === 'todo:get-state')
      return {
        connected: false,
        syncing: false,
        syncedAt: null,
        error: null,
        items: [
          {
            id: '00000000-0000-4000-8000-000000000123',
            source: 'personal',
            title: '整理本周学习笔记',
            notes: '演示待办',
            dueAt: `${dateAt(6)}T10:00:00+08:00`,
            status: 'pending',
            readAt: null,
            createdAt: syncedAt,
          },
        ],
      };
    if (channel === 'mail:get-state')
      return {
        account: { address: 'student@example.invalid', lastSyncedAt: syncedAt },
        sync: mailSync,
      };
    if (channel === 'mail:sync') return;
    if (channel === 'mail:list-folders')
      return [
        {
          id: 1,
          path: 'INBOX',
          name: '收件箱',
          specialUse: '\\Inbox',
          total: 3,
          unread: 2,
          lastSyncedAt: syncedAt,
        },
        {
          id: 2,
          path: 'Sent',
          name: '已发送',
          specialUse: '\\Sent',
          total: 0,
          unread: 0,
          lastSyncedAt: syncedAt,
        },
      ];
    if (channel === 'mail:list-drafts' || channel === 'mail:list-trash') return [];
    if (channel === 'mail:list-messages')
      return ['课程讨论与答疑安排', '实验报告提交提醒', '本周学习资料已更新'].map((subject, i) => ({
        id: i + 1,
        uid: i + 1,
        subject,
        sender: { name: '示例课程助教', address: 'course@example.invalid' },
        date: syncedAt,
        seen: i === 2,
        flagged: false,
        hasAttachments: i === 2,
        snippet: '人工编写的演示邮件，不含真实邮件内容。',
        size: 128,
      }));
    return listener(event, ...args);
  });
app.whenReady().then(() =>
  session.fromPartition('persist:chaoxing').protocol.handle('https', (request) => {
    if (new URL(request.url).hostname !== 'mooc1.chaoxing.com')
      throw new Error('Showcase does not access school services');
    return new Response(
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;padding:40px;font:15px/1.9 -apple-system,BlinkMacSystemFont,sans-serif;color:#202124;background:#fafafa}main{max-width:680px;margin:auto}small{color:#71717a}h1{font-size:26px;line-height:1.4;margin:16px 0}section{background:white;border:1px solid #e4e4e7;border-radius:12px;padding:24px;margin-top:24px}textarea{box-sizing:border-box;width:100%;height:130px;padding:14px;border:1px solid #d4d4d8;border-radius:8px;font:inherit}</style><main><small>作业原网页 · 合成示例</small><h1>算法设计 · 分治与归并排序</h1><p>截止时间：${dateAt(6)} 20:00</p><section><b>问题 1</b><p id="question">为什么归并排序的时间复杂度是 O(n log n)？请用递归树说明每一层的工作量，并比较它与插入排序的适用场景。</p></section><section><b>我的思考</b><p><textarea placeholder="在原网页记录思路…"></textarea></p></section></main></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }),
);
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once(
    'did-finish-load',
    () =>
      void capture(window).then(
        () => app.exit(0),
        (error) => {
          console.error(error);
          app.exit(1);
        },
      ),
  );
});
createRequire(join(root, 'package.json'))(join(root, 'out/main/index.cjs'));

async function capture(window: BrowserWindow) {
  const db = new Database(join(profile, 'dela.db'));
  const save = (key: string, value: unknown) =>
    db
      .prepare('INSERT OR REPLACE INTO jlu_platform_cache VALUES (?,?)')
      .run('cx:' + key, JSON.stringify(value));
  save('courses', {
    syncedAt,
    items: subjects.map((name, i) => ({ id: 'c' + i, name, teacher: '示例教师', ended: false })),
  });
  for (let i = 0; i < 5; i++)
    save('works:c' + i, {
      courseId: 'c' + i,
      syncedAt,
      items:
        i < 3
          ? [
              {
                id: 'w' + i,
                title: ['习题整理与复习', '网络协议分析报告', '分治与归并排序'][i],
                status: '未提交',
                timing: `截止时间：${dateAt(i === 2 ? 6 : 5)} ${i === 2 ? '20:00' : '23:59'}`,
              },
            ]
          : [],
    });
  save(
    'routes',
    safeStorage
      .encryptString(
        JSON.stringify({
          'course:c2': 'https://mooc1.chaoxing.com/course',
          'work:c2:w2': 'https://mooc1.chaoxing.com/task?workId=w2',
        }),
      )
      .toString('base64'),
  );
  db.close();
  const js = <T = unknown>(source: string) =>
    window.webContents.executeJavaScript(source, true) as Promise<T>;
  const wait = async (source: string) => {
    for (let i = 0; i < 120; i++) {
      if (await js<boolean>(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Showcase timed out: ' + source);
  };
  const click = (label: string) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)}||button.getAttribute('aria-label')===${JSON.stringify(label)}).click()`,
    );
  async function snapshot(name: string) {
    await js('document.fonts.ready');
    await js(
      'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
    );
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, name), (await window.capturePage()).toPNG());
  }
  window.setSize(1440, 840);
  await wait('!!document.querySelector("#main-nav")');
  await js(`window.dela.settings.setTheme('dark')`);
  await click('学习日历');
  await wait('!!document.querySelector("[aria-label=学习月历]")');
  await click('周');
  await snapshot('calendar.png');
  await click('吉大邮箱');
  await wait('document.body.textContent.includes("课程讨论与答疑安排")');
  await snapshot('mail.png');
  await click('学习日历');
  await wait('!!document.querySelector("[aria-label=学习月历]")');
  await js(`document.querySelector('[aria-label^="作业：分治与归并排序"]').click()`);
  await wait('!!document.querySelector("[aria-label=学习日历详情]")');
  await click('在工作台打开作业');
  await wait('!!document.querySelector("[aria-label=学习通原网页区域]")');
  const view = window.contentView.children.find(
    (child) => 'webContents' in child && child.webContents !== window.webContents,
  );
  if (!view || !('webContents' in view)) throw new Error('Missing native work page');
  const remote = (view as import('electron').WebContentsView).webContents;
  remote.setBackgroundThrottling(false);
  for (let i = 0; i < 100; i++) {
    if (await remote.executeJavaScript('!!document.getElementById("question")')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await remote.executeJavaScript(
    `{const r=document.createRange();r.selectNodeContents(document.getElementById('question'));const s=getSelection();s.removeAllRanges();s.addRange(r);}`,
  );
  await click('选中文字问 AI');
  await wait('document.body.textContent.includes("选中文字已放入 AI 草稿")');
  await wait(
    `document.querySelector('[aria-label="发送给助手"]')?.textContent.includes('为什么归并排序')`,
  );
  await js(`document.querySelector('[aria-label="关闭通知"]')?.click()`);
  await click('收起目录');
  await js('new Promise(resolve=>setTimeout(resolve,250))');
  const pageImage = (await remote.capturePage()).toDataURL();
  await js(
    `(async()=>{const rect=document.querySelector('[aria-label="学习通原网页区域"]').getBoundingClientRect();const image=document.createElement('img');image.id='native-capture-layer';Object.assign(image.style,{position:'fixed',left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',zIndex:'10'});image.src=${JSON.stringify(pageImage)};document.body.append(image);await image.decode();})()`,
  );
  await snapshot('assignment-workbench.png');
  await js(`document.getElementById('native-capture-layer').remove()`);
  console.log(
    'Captured synthetic calendar, mailbox and assignment workbench. No real school, mail or model requests.',
  );
}
