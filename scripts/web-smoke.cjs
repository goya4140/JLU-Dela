const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync, mkdtempSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'dela-web-smoke-')));
app.whenReady().then(async () => {
  const { startWebServer } = require(resolve('out/web/host.cjs'));
  let creates = 0;
  let recordingSyncs = 0;
  let recordings = null;
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
      if (method === 'schedule.state') return { semester: '示例学期', lastSyncedAt: null };
      if (method === 'schedule.lessons')
        return [
          {
            courseName: '示例课表课程',
            weekday: 1,
            periodsText: '1-2节',
            weeksText: '1-16周',
            classroom: '示例教室',
          },
        ];
      if (method === 'chaoxing.courses')
        return { items: [{ id: '1:2', name: '示例学习通课程', teacher: '示例教师' }] };
      if (method === 'chaoxing.syncWorks')
        return {
          ok: true,
          data: { items: [{ id: 'w1', title: '示例作业', status: '待交', timing: '同步时提示' }] },
        };
      if (method === 'chaoxing.syncFiles')
        return {
          ok: true,
          data: {
            name: '示例资料',
            items: [
              { id: 'file', name: '示例课件.pdf', size: '5KB', creator: '示例教师', date: '10-31' },
            ],
          },
        };
      if (method === 'notices.list')
        return {
          items: [
            {
              id: '1',
              channel: '179577',
              title: '示例学校通知',
              department: '示例部门',
              published: '10-31',
            },
          ],
        };
      if (method === 'notices.read')
        return {
          ok: true,
          data: { title: '示例学校通知', metadata: '示例通知', text: '这是示例通知正文。' },
        };
      if (method === 'learning.courses')
        return { courses: [{ id: 'l1', name: '示例学在吉大课程', teacher: '示例教师' }] };
      if (method === 'learning.recordings') return recordings;
      if (method === 'learning.syncRecordings') {
        recordingSyncs++;
        recordings = {
          items: [
            {
              id: 'v1',
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
            streams: [{ name: '示例画面', playbackUrl: 'dela-resource://jlu-video/fixture' }],
            subtitles: [{ startMs: 0, endMs: 5000, text: '示例学校字幕' }],
            subtitleError: null,
          },
        };
      if (method === 'learning.note')
        return { id: 'a'.repeat(48), text: '# 示例学习笔记', revision: 'a'.repeat(64) };
      if (method === 'learning.saveNote')
        return { id: args[0], text: args[1], revision: 'b'.repeat(64) };
      if (method === 'model.list') return [];
      if (method === 'chat.list') return [];
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
  const js = (source) => window.webContents.executeJavaScript(source);
  const wait = async (source) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error('Timed out: ' + source + '\n' + (await js('document.body.innerText')));
  };
  const click = async (label) => {
    await wait(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`,
    );
    return js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`,
    );
  };
  try {
    await window.loadURL(service.url);
    await wait(`document.body.textContent.includes('示例课表课程')`);
    assert.equal(await js('location.hash'), '');
    await click('学习通');
    await wait(`document.body.textContent.includes('示例学习通课程')`);
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='示例学习通课程').click()`,
    );
    await wait(`document.body.textContent.includes('示例作业')`);
    await click('课程资料');
    await wait(`document.body.textContent.includes('示例课件.pdf')`);
    await click('学校通知');
    await wait(`document.body.textContent.includes('示例学校通知')`);
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='示例学校通知').click()`,
    );
    await wait(`document.body.textContent.includes('这是示例通知正文')`);
    await click('学在吉大');
    await wait(
      `Array.from(document.querySelectorAll('button')).some(b=>b.querySelector('h3')?.textContent==='示例学在吉大课程'&&!b.disabled)`,
    );
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='示例学在吉大课程').click()`,
    );
    await wait(`document.body.textContent.includes('示例录播')`);
    assert.equal(recordingSyncs, 1);
    await click('学在吉大');
    await wait(
      `Array.from(document.querySelectorAll('button')).some(b=>b.querySelector('h3')?.textContent==='示例学在吉大课程'&&!b.disabled)`,
    );
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='示例学在吉大课程').click()`,
    );
    await wait(`document.body.textContent.includes('示例录播')`);
    assert.equal(recordingSyncs, 1);
    await click('同步');
    await wait(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='同步'&&!b.disabled)`,
    );
    assert.equal(recordingSyncs, 2);

    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='示例录播').click()`,
    );
    await wait(
      `document.body.textContent.includes('示例学校字幕') && !!document.querySelector('video') && !document.querySelector('[aria-label="录像学习笔记"]').disabled`,
    );
    await wait(`document.querySelector('video').readyState>=2`);
    await js(`document.querySelector('video').muted=true; document.querySelector('video').play()`);
    await wait(`document.querySelector('video').currentTime>0.25`);
    await js(`document.querySelector('video').pause()`);
    for (const width of [600, 900, 1280, 1800]) {
      window.setSize(width, 850);
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(
        await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
        true,
      );
      mkdirSync('.build', { recursive: true });
      writeFileSync(
        `.build/web-study-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }

    await click('保存笔记');
    await wait(`document.body.textContent.includes('已保存')`);
    await click('引用并提问');
    await wait(`document.querySelector('textarea')?.value.includes('示例学校字幕')`);

    await wait(`document.body.textContent.includes('新建对话')`);
    assert.equal(creates, 0);
    await click('新建对话');
    await wait(
      `!!document.querySelector('textarea') && !document.querySelector('textarea').disabled`,
    );
    assert.equal(creates, 1);
    for (const width of [600, 900, 1280, 1800]) {
      window.setSize(width, 850);
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(
        await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
        true,
      );
      mkdirSync('.build', { recursive: true });
      writeFileSync(`.build/web-${width}.png`, (await window.webContents.capturePage()).toPNG());
    }
    assert.equal(window.webContents.getLastWebPreferences().preload, undefined);
    console.log(
      'Web smoke passed: browser-only client, pairing cookie, cached timetable, courses, assignments, notices, recordings, video playback, subtitles, shared note saving, deliberate chat creation and four viewport widths. Synthetic data; no school or model requests.',
    );
    window.destroy();
    service.server.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
