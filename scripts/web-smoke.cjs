const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync, mkdtempSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'dela-web-smoke-')));
app.whenReady().then(async () => {
  const { startWebServer } = require(resolve('out/web/host.cjs'));
  let creates = 0,
    recordingSyncs = 0,
    recordings = null;
  let savedNote = '# 示例学习笔记',
    revision = 'a'.repeat(64);
  let appearance = { theme: 'light', fontSize: 16, zoom: 1 };
  let personal = [];
  const syncedAt = new Date().toISOString();
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const semesterStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const fixture = {
    sessionId: '120d76e8-12bd-4663-b661-b219e102d4fe',
    projectId: null,
    cwd: null,
    configured: false,
    model: '',
    providerName: null,
    running: false,
    messages: [{ role: 'assistant', content: '示例回答\n\n```txt\n' + 'x'.repeat(300) + '\n```' }],
  };
  const folder = {
    courseId: '1:2',
    folderId: '',
    name: '示例资料',
    syncedAt,
    items: [
      {
        id: 'file',
        name: '示例课件.pdf',
        type: 'file',
        size: '5KB',
        creator: '示例教师',
        date: '10-31',
        downloadable: true,
      },
    ],
  };
  const notice = {
    id: '1',
    channel: '179577',
    title: '示例学校通知',
    department: '示例部门',
    published: '10-31',
    pinned: false,
    url: 'https://oa.jlu.edu.cn/fixture',
  };
  const service = await startWebServer({
    directory: resolve('out/renderer'),
    mediaFetch: async (_url, range) => {
      const bytes = readFileSync(resolve('assets/onboarding-video.webm'));
      const match = range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = match ? Number(match[1]) : 0,
        end = match && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      return new Response(bytes.subarray(start, end + 1), {
        status: range ? 206 : 200,
        headers: {
          'content-type': 'video/webm',
          'accept-ranges': 'bytes',
          'content-length': String(end - start + 1),
          ...(range ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}),
        },
      });
    },
    invoke: async (method, args) => {
      if (method === 'todo.state' || method === 'todo.refresh' || method === 'todo.read')
        return { items: personal, connected: false, syncing: false, syncedAt: null, error: null };
      if (method === 'todo.save') {
        const input = args[0];
        personal = [
          {
            id: 'personal-fixture',
            source: 'personal',
            title: input.title,
            notes: input.notes || '',
            dueAt: input.dueAt || null,
            status: input.completed ? 'completed' : 'pending',
            calendar: input.calendar || false,
            readAt: syncedAt,
          },
        ];
        return { items: personal, connected: false, syncing: false, syncedAt: null, error: null };
      }
      if (method === 'chaoxing.calendar' || method === 'chaoxing.syncCalendar') {
        const data = {
          courses: [{ id: '1:2', name: '示例课程', syncedAt }],
          coursesSyncedAt: syncedAt,
          works: [
            {
              id: 'calendar-work',
              courseId: '1:2',
              courseName: '示例课程',
              title: '示例日历作业',
              timing: '剩余两天',
              status: '待交',
              deadline: null,
              syncedAt,
            },
          ],
        };
        return method.endsWith('syncCalendar') ? { data, failures: [] } : data;
      }

      if (method === 'appearance.theme') return appearance.theme;
      if (method === 'appearance.fontSize') return appearance.fontSize;
      if (method === 'appearance.zoom') return appearance.zoom;
      if (method === 'schedule.state')
        return { semester: '2026-2027-1', lastSyncedAt: syncedAt, semesterStart, totalWeeks: 16 };
      if (method === 'schedule.lessons')
        return [
          {
            id: 1,
            semester: '2026-2027-1',
            courseCode: 'fixture',
            courseName: '示例课表课程',
            className: null,
            teacher: '示例教师',
            campus: '示例校区',
            classroom: '示例教室',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            startMinute: 480,
            endMinute: 575,
            periodsText: '1-2节',
            weeksText: '1-16周',
            weekNumbers: Array.from({ length: 16 }, (_, i) => i + 1),
            credits: null,
            note: null,
          },
        ];
      if (method === 'chaoxing.courses')
        return {
          syncedAt,
          items: [{ id: '1:2', name: '示例学习通课程', teacher: '示例教师', ended: false }],
        };
      if (method === 'chaoxing.files') return null;
      if (method === 'chaoxing.syncFiles') return { ok: true, data: folder };
      if (method === 'chaoxing.works') return null;
      if (method === 'chaoxing.syncWorks')
        return {
          ok: true,
          data: {
            courseId: '1:2',
            syncedAt,
            items: [{ id: 'w1', title: '示例作业', status: '待交', timing: '同步时提示' }],
          },
        };
      if (method === 'notices.list')
        return { channel: '179577', page: 1, totalPages: 1, syncedAt, items: [notice] };
      if (method === 'notices.cached') return null;
      if (method === 'notices.read')
        return {
          ok: true,
          data: {
            ...notice,
            metadata: '示例通知',
            text: '这是示例通知正文。',
            attachments: [],
            syncedAt,
          },
        };
      if (method === 'learning.courses')
        return {
          termId: 't1',
          terms: [{ id: 't1', year: '2026-2027', num: '1', name: '秋季', selected: true }],
          syncedAt,
          courses: [
            {
              id: 'l1',
              name: '示例学在吉大课程',
              courseName: '示例学在吉大课程',
              teacher: '示例教师',
              status: '',
            },
          ],
        };
      if (method === 'learning.recordings') return recordings;
      if (method === 'learning.syncRecordings') {
        recordingSyncs++;
        recordings = {
          courseId: 'l1',
          syncedAt,
          items: [
            {
              id: 'v1',
              resourceId: 'fixture',
              name: '示例录播',
              date: '10-31',
              time: '10:00',
              room: '示例教室',
              status: '可查看',
            },
          ],
        };
        return { ok: true, data: recordings };
      }
      if (method === 'learning.media')
        return {
          ok: true,
          data: {
            streams: [
              { name: '教师机位', playbackUrl: 'dela-resource://jlu-video/fixture' },
              { name: 'HDMI', playbackUrl: 'dela-resource://jlu-video/hdmi' },
            ],
            subtitles: [{ startMs: 0, endMs: 5000, text: '示例学校字幕' }],
            subtitleError: null,
          },
        };
      if (method === 'learning.note') return { id: 'a'.repeat(48), text: savedNote, revision };
      if (method === 'learning.saveNote') {
        savedNote = args[1];
        revision = 'b'.repeat(64);
        return { id: args[0], text: savedNote, revision };
      }
      if (method === 'model.list' || method === 'chat.list') return [];
      if (method === 'chat.create') {
        creates++;
        return fixture;
      }
      if (method === 'chat.open') return fixture;
      throw Error('Unexpected fixture method ' + method + ' ' + JSON.stringify(args));
    },
  });
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 850,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.setMinimumSize(360, 500);
  window.webContents.setBackgroundThrottling(false);
  const js = (source) =>
    window.webContents.executeJavaScript(source).catch(async (error) => {
      throw new Error(
        error.message +
          '\n' +
          source +
          '\n' +
          (await window.webContents.executeJavaScript('document.body.innerText')),
      );
    });
  const wait = async (source) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error('Timed out: ' + source + '\n' + (await js('document.body.innerText')));
  };
  const click = async (label) => {
    const selector = `Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled&&b.getClientRects().length)`;
    await wait(`!!(${selector})`);
    await js(`(${selector}).click()`);
  };
  const navigate = async (label) => {
    if (await js(`document.querySelector('#main-nav').getClientRects().length===0`))
      await click('展开侧边栏');
    await click(label);
  };
  const openCourse = async (name) => {
    const selector = `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h2')?.textContent===${JSON.stringify(name)}&&!b.disabled)`;
    await wait(`!!(${selector})`);
    await js(`(${selector}).click()`);
  };
  const capture = async (page) => {
    for (const width of [600, 900, 1280, 1800]) {
      window.setSize(width, 850);
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await wait(
        `Math.abs(document.querySelector('main').getBoundingClientRect().left-${width < 768 ? 1 : 201})<0.5`,
      );
      assert.equal(
        await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
        true,
      );
      assert.equal(
        await js(`document.querySelector('main').getBoundingClientRect().right<=innerWidth+1`),
        true,
      );
      if (width === 600) {
        assert.equal(
          await js(`document.querySelector('#main-nav').getClientRects().length===0`),
          true,
        );
        await click('展开侧边栏');
        assert.equal(
          await js(`document.querySelector('#main-nav').getBoundingClientRect().right<=innerWidth`),
          true,
        );
        await click('关闭侧边栏');
      }
      if (page === 'study') {
        assert.equal(
          await js(
            width >= 1280
              ? `document.querySelector('[aria-label="视频与字幕"]').getBoundingClientRect().right<=document.querySelector('[aria-label="学习笔记与 AI"]').getBoundingClientRect().left`
              : `document.querySelector('[aria-label="视频与字幕"]').getBoundingClientRect().bottom<=document.querySelector('[aria-label="学习笔记与 AI"]').getBoundingClientRect().top`,
          ),
          true,
        );
      }
      mkdirSync('.build', { recursive: true });
      writeFileSync(
        `.build/web-aligned-${page}-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    window.setSize(1280, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  };
  try {
    await window.loadURL(service.url);
    await wait(`document.body.textContent.includes('现在想聊些什么')`);
    assert.equal(await js('location.hash'), '');
    await wait(
      `document.documentElement.classList.contains('light')&&document.documentElement.style.fontSize==='16px'`,
    );
    await capture('home');
    await navigate('学习日历');
    await wait(`document.body.textContent.includes('示例日历作业')`);
    await click('列表');
    await capture('study-calendar');
    await click('新建待办');
    await js(
      `(()=>{const input=document.querySelector('input[placeholder="例如：准备小组展示"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'网页个人待办');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await js(`document.querySelector('form').requestSubmit()`);
    await wait(
      `document.body.textContent.includes('网页个人待办')&&!document.querySelector('form')`,
    );
    assert.equal(personal[0]?.title, '网页个人待办');
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')?.startsWith('个人待办：网页个人待办')).click()`,
    );
    await click('标为完成');
    await wait(`document.body.textContent.includes('重新打开')`);
    assert.equal(personal[0].status, 'completed');
    await click('重新打开');
    await wait(`document.body.textContent.includes('标为完成')`);
    await click('编辑');
    await wait(`!!document.querySelector('form')`);
    await js(
      `(()=>{const input=document.querySelector('input[placeholder="例如：准备小组展示"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'修改后的网页待办');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await js(`document.querySelector('form').requestSubmit()`);
    await wait(
      `!document.querySelector('form')&&document.body.textContent.includes('修改后的网页待办')`,
    );
    assert.equal(personal[0].title, '修改后的网页待办');

    await navigate('课表');
    await wait(`document.body.textContent.includes('示例课表课程')`);
    await capture('timetable');
    await click('月');
    await wait(
      `!!document.querySelector('button[aria-pressed="true"]')&&document.querySelector('button[aria-pressed="true"]').textContent==='月'`,
    );
    await capture('month');
    await navigate('学习通');
    await openCourse('示例学习通课程');
    await wait(`document.body.textContent.includes('示例课件.pdf')`);
    assert.equal(
      await js(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('在桌面端导入')).disabled`,
      ),
      true,
    );
    await click('作业');
    await wait(`document.body.textContent.includes('示例作业')`);
    await click('返回课程');
    await capture('chaoxing');
    await navigate('学校通知');
    await wait(`document.body.textContent.includes('示例学校通知')`);
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('示例学校通知')).click()`,
    );
    await wait(`document.body.textContent.includes('这是示例通知正文')`);
    await capture('notice');
    await navigate('学在吉大');
    await openCourse('示例学在吉大课程');
    await wait(`document.body.textContent.includes('示例录播')`);
    assert.equal(recordingSyncs, 1);
    await click('返回课程');
    await openCourse('示例学在吉大课程');
    await wait(`document.body.textContent.includes('示例录播')`);
    assert.equal(recordingSyncs, 1);
    await click('同步录像');
    await wait(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='同步录像'&&!b.disabled)`,
    );
    assert.equal(recordingSyncs, 2);
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='示例录播').click()`,
    );
    await wait(
      `document.body.textContent.includes('示例学校字幕')&&document.querySelector('[aria-label="录像学习笔记"]')?.getAttribute('contenteditable')==='true'`,
    );
    await wait(`document.querySelector('video').readyState>=2`);
    await js(`document.querySelector('video').muted=true;document.querySelector('video').play()`);
    await wait(`document.querySelector('video').currentTime>0.25`);
    await js(`document.querySelector('video').pause()`);
    await capture('study');
    await js(
      `document.querySelector('[aria-label="录像学习笔记"]').focus();document.execCommand('insertText',false,'人工网页测试笔记');window.confirm=()=>false;true`,
    );
    await wait(`document.body.textContent.includes('尚未保存')`);
    await navigate('学校通知');
    assert.equal(await js(`!!document.querySelector('video')`), true);
    await click('保存笔记');
    await wait(`document.body.textContent.includes('已保存')`);
    assert.ok(savedNote.includes('人工网页测试笔记'));
    await click('引用 0:00 字幕');
    await click('引用当前片段');
    await wait(
      `document.querySelector('textarea[aria-label="发送给助手"]')?.value.includes('示例学校字幕')`,
    );
    assert.equal(creates, 0);
    await click('新建对话');
    await wait(`!document.querySelector('textarea[aria-label="发送给助手"]').disabled`);
    assert.equal(creates, 1);
    await capture('chat');
    appearance = { theme: 'dark', fontSize: 18, zoom: 1.25 };
    await window.loadURL(service.origin);
    await wait(
      `document.documentElement.classList.contains('dark')&&document.documentElement.style.fontSize==='18px'&&document.documentElement.style.zoom==='1.25'`,
    );
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const scaled = await js(
      `({bottom:document.querySelector('main').getBoundingClientRect().bottom,right:document.querySelector('main').getBoundingClientRect().right,height:innerHeight,width:innerWidth})`,
    );
    assert.ok(
      scaled.bottom <= scaled.height + 1 && scaled.right <= scaled.width + 1,
      JSON.stringify(scaled),
    );
    writeFileSync('.build/web-aligned-zoom.png', (await window.webContents.capturePage()).toPNG());
    assert.equal(await js(`typeof window.dela`), 'undefined');
    assert.equal(window.webContents.getLastWebPreferences().preload, undefined);
    console.log(
      'Web smoke passed: shared desktop learning calendar and todo editing, course/notice views, week/month calendar, navigation drawer, video, Markdown notes, dirty-note guard, inline AI quote and four viewport widths. Synthetic data; no school or model requests.',
    );
    window.destroy();
    service.server.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
