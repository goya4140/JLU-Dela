const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { readFile, mkdtemp, writeFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  app.setPath('userData', await mkdtemp(resolve(tmpdir(), 'dela-pages-')));
  await app.whenReady();
  const unexpected = [];
  const server = createServer(async (request, response) => {
    if (
      request.method !== 'GET' ||
      !request.url.startsWith('/JLU-Dela/') ||
      request.url.includes('/api/')
    ) {
      unexpected.push(request.method + ' ' + request.url);
      response.writeHead(404);
      response.end();
      return;
    }
    const path = resolve('.build/pages', request.url.slice('/JLU-Dela/'.length) || 'index.html');
    if (!path.startsWith(resolve('.build/pages') + '/')) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const data = await readFile(path);
      response.setHeader(
        'content-type',
        {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.webm': 'video/webm',
        }[extname(path)] || 'application/octet-stream',
      );
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/JLU-Dela/`;
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 850,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setBackgroundThrottling(false);
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (
      !details.url.startsWith(base) &&
      !details.url.startsWith('data:') &&
      !details.url.startsWith('blob:')
    ) {
      unexpected.push(details.url);
      callback({ cancel: true });
    } else callback({});
  });
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
    const query = `Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;
    await wait(`!!(${query})`);
    await js(`(${query}).click()`);
  };
  try {
    await window.loadURL(base);
    await wait(
      `document.body.textContent.includes('交互演示')&&document.body.textContent.includes('现在想聊些什么')`,
    );
    await click('学习日历');
    await wait(`document.body.textContent.includes('网络协议分析')`);
    await click('列表');
    await writeFile('.build/pages-preview.png', (await window.webContents.capturePage()).toPNG());
    await click('课表');
    await wait(`document.body.textContent.includes('计算机网络')`);
    await click('学习通');
    await wait(`document.body.textContent.includes('计算机网络')`);
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h2')?.textContent.includes('计算机网络')).click()`,
    );
    await wait(`document.body.textContent.includes('网络分层与协议')`);
    await click('学在吉大');
    await wait(
      `Array.from(document.querySelectorAll('button')).some(b=>b.querySelector('h2')?.textContent.includes('计算机网络')&&!b.disabled)`,
    );
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h2')?.textContent.includes('计算机网络')).click()`,
    );
    await wait(`document.body.textContent.includes('进入学习')`);
    await js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('进入学习')).click()`,
    );
    await wait(
      `document.querySelector('video')?.readyState>=2&&document.querySelector('[aria-label="录像学习笔记"]')?.textContent.includes('示例笔记')`,
    );
    await js(`document.querySelector('video').muted=true;document.querySelector('video').play()`);
    await wait(`document.querySelector('video').currentTime>0.25`);
    await js(`document.querySelector('video').pause()`);
    await click('保存笔记');
    await wait(`document.body.textContent.includes('已保存')`);
    await writeFile(
      '.build/pages-study-preview.png',
      (await window.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(unexpected, []);
    console.log(
      'Pages smoke passed: project subpath, calendar, courses, video, note save, no backend or external requests; isolated synthetic data.',
    );
    window.destroy();
    server.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    window.destroy();
    server.close();
    app.exit(1);
  }
})();
