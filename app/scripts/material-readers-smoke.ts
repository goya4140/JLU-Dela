import { app, BrowserWindow, dialog } from 'electron';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { KnowledgeRoot } from '../src/shared/knowledge';

const root = resolve('.');
(app as typeof app & { setAppPath(path: string): void }).setAppPath(root);
const profile = realpathSync(mkdtempSync(join(tmpdir(), 'dela-materials-smoke-')));
for (const name of ['userData', 'documents', 'home'] as const) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const library = join(profile, '课程资料'),
  coursePath = join(library, '计算机网络');
mkdirSync(join(coursePath, '第一章', 'images'), { recursive: true });
mkdirSync(join(coursePath, '空文件夹'));
writeFileSync(join(library, '培养方案.xmind'), 'root file');
writeFileSync(join(coursePath, '课堂笔记.md'), '# 可靠传输\n滑动窗口与确认。');
const html = join(coursePath, '第一章', '课程.html');
writeFileSync(
  html,
  '<html><head><link rel="stylesheet" href="style.css"></head><body><h1 id="lesson">本地 HTML 课程</h1><img src="images/diagram.svg"><script>window.materialScriptExecuted=true</script><a href="#lesson">回到标题</a></body></html>',
);
writeFileSync(
  join(coursePath, '第一章', 'style.css'),
  'h1 { color: rgb(12, 90, 140); } body { background-image:url(images/diagram.svg); }',
);
writeFileSync(
  join(coursePath, '第一章', 'images', 'diagram.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#1565c0"/></svg>',
);
const externalPpt = process.env.JLU_PPT_SMOKE_FILE;
const ppt = join(
  coursePath,
  externalPpt?.toLowerCase().endsWith('.ppt') ? '课程.ppt' : '课程.pptx',
);
copyFileSync(externalPpt ?? join(root, 'scripts/fixtures/material-reader.pptx'), ppt);
const original = readFileSync(ppt);
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [library] });
const timeout = setTimeout(() => app.exit(1), 110000);
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once('did-finish-load', () => {
    void run(window).then(
      () => {
        clearTimeout(timeout);
        app.exit(0);
      },
      (error) => {
        console.error(error);
        app.exit(1);
      },
    );
  });
});
createRequire(join(root, 'package.json'))(join(root, 'out/main/index.cjs'));

async function run(window: BrowserWindow) {
  const js = <T = unknown>(source: string) =>
    window.webContents.executeJavaScript(source) as Promise<T>;
  const wait = async (source: string) => {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.error(await js('document.body.innerText.slice(-1500)'));
    throw new Error('Timed out: ' + source);
  };
  const click = (text: string) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`,
    );
  const selectFile = (name: string) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('p')?.textContent===${JSON.stringify(name)})?.click()`,
    );
  await wait('!!window.dela?.knowledge && !!document.querySelector("#main-nav")');
  const attached = await js<KnowledgeRoot>('window.dela.knowledge.attach()');
  await js(`window.dela.knowledge.enroll(${JSON.stringify(attached.id)},'计算机网络')`);
  await click('知识库');
  await wait('document.body.textContent.includes("培养方案.xmind")');
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='计算机网络')?.click()`,
  );
  await wait('document.body.textContent.includes("空文件夹")');
  await click('空文件夹');
  await wait('document.body.textContent.includes("当前目录 0 项")');
  await click('课程根目录');
  await wait('document.body.textContent.includes("第一章")');
  await click('第一章');
  await wait('document.body.textContent.includes("课程.html")');
  await selectFile('课程.html');
  await wait(
    `!!document.querySelector('iframe[title="课程.html"]')?.contentDocument?.querySelector('h1')`,
  );
  await wait(
    `getComputedStyle(document.querySelector('iframe[title="课程.html"]').contentDocument.querySelector('h1')).color==='rgb(12, 90, 140)'`,
  );
  await wait(
    `document.querySelector('iframe[title="课程.html"]').contentDocument.querySelector('img')?.naturalWidth===120`,
  );
  assert.equal(
    await js(
      `!!document.querySelector('iframe[title="课程.html"]').contentWindow.materialScriptExecuted`,
    ),
    false,
  );
  await click('源码');
  await wait(
    '!!document.querySelector(".cm-editor") || document.body.textContent.includes("<html>")',
  );
  await click('预览');
  await wait(
    `!!document.querySelector('iframe[title="课程.html"]')?.contentDocument?.querySelector('h1')`,
  );
  await click('课程根目录');
  await wait(`document.body.textContent.includes(${JSON.stringify(basename(ppt))})`);
  await selectFile(basename(ppt));
  // 本机 PPT 阅读只在 macOS 启用，Windows 走 Office 占位与 PDF 导出流程。
  if (process.platform === 'win32') {
    await wait(
      `document.body.textContent.includes('PowerPoint 演示文稿')&&document.body.textContent.includes('导出为 PDF 预览')`,
    );
  } else {
    await wait(
      `Array.from(document.images).some(i=>i.alt.includes('第 1 张幻灯片')&&i.complete&&i.naturalWidth>0)`,
    );
    if (!externalPpt) {
      const svg = await js<string>(
        `fetch(Array.from(document.images).find(i=>i.alt.includes('第 1 张幻灯片')).src).then(r=>r.text())`,
      );
      assert.match(svg, /<image[^>]+(?:href|xlink:href)="data:image\//);
      assert.ok(!svg.includes('href="blob:'));
    }
    assert.equal(
      await js(`document.querySelector('button[aria-label="上一张幻灯片"]')?.disabled`),
      true,
    );
    await js(`document.querySelector('button[aria-label="下一张幻灯片"]').click()`);
    await wait(
      `Array.from(document.images).some(i=>i.alt.includes('第 2 张幻灯片')&&i.complete&&i.naturalWidth>0)`,
    );
    await js(
      `(()=>{const select=document.querySelector('select[aria-label="幻灯片缩放"]');select.value='2';select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await wait(
      `Array.from(document.images).some(i=>i.alt.includes('第 2 张幻灯片')&&i.style.width)`,
    );
    await js(
      `(()=>{const select=document.querySelector('select[aria-label="幻灯片缩放"]');select.value='fit';select.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('[aria-label="幻灯片页码"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await wait(
      `Array.from(document.images).some(i=>i.alt.includes('第 1 张幻灯片')&&i.complete&&i.naturalWidth>0&&!i.style.width)`,
    );
    window.setMinimumSize(360, 500);
    mkdirSync('.build', { recursive: true });
    for (const width of [600, 900, 1280, 1800]) {
      window.setSize(width, 850);
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await js(
        'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
      );
      assert.equal(
        await js(
          `document.querySelector('select[aria-label="幻灯片缩放"]').parentElement.getBoundingClientRect().height<150`,
        ),
        true,
        'PPT toolbar ' + width,
      );
      assert.equal(
        await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
        true,
        'viewport ' + width,
      );
      writeFileSync(
        `.build/material-ppt-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
  }
  assert.deepEqual(readFileSync(ppt), original);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log(
    'Material readers smoke passed: root files, real folder hierarchy and empty folders, HTML styles/images/source with scripts disabled, PPT handling for this platform, source preservation. Isolated profile; no school or model requests.',
  );
}
