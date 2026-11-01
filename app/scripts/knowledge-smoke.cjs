const { app, BrowserWindow, dialog } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(process.argv[2] || '.');
app.setAppPath(root);
if (root.endsWith('.asar')) {
  Object.defineProperty(app, 'isPackaged', { value: true });
  process.resourcesPath = dirname(root);
}
const profile = realpathSync(mkdtempSync(join(tmpdir(), 'knowledge-smoke-')));
for (const name of ['userData', 'documents', 'home']) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const library = join(profile, '示例知识库'),
  coursePath = join(library, '本学期', '计算机网络');
mkdirSync(coursePath, { recursive: true });
const note = join(coursePath, '课堂笔记.md');
const noteContent = `# 可靠传输
滑动窗口通过确认实现可靠传输。

## 本节学习目标

- 解释发送窗口与接收窗口如何配合。
- 区分累计确认与选择确认。
- 用时间线梳理丢包后的重传过程。

## 两种重传策略

| 策略 | 丢包后如何处理 |
| --- | --- |
| Go-Back-N | 重传丢失分组及其后尚未确认的分组 |
| Selective Repeat | 只重传尚未确认的分组 |

## 课后自测

如果第三个分组丢失，而第四个分组先到达，接收端应如何处理？
结合网络课件画出发送方与接收方的时间线，再记录仍有疑问的地方。
`;
writeFileSync(note, noteContent);
mkdirSync(join(library, '另一门课'));
writeFileSync(join(library, '另一门课', '独有.md'), '只属于另一门课');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  ...['Network course', 'Sliding window'].map((text) => {
    const stream = `BT /F1 16 Tf 30 300 Td (${text}) Tj ET`;
    return `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 8\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => String(offset).padStart(10, '0') + ' 00000 n ')
  .join('\n')}\ntrailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(join(coursePath, '网络课件.pdf'), pdf);
writeFileSync(
  join(coursePath, '课程网页.html'),
  '<!doctype html><html><head><meta charset="utf-8"><title>课程网页</title></head><body><h1>网页渲染成功</h1><p>章节小结</p><img src="示意图.png"></body></html>',
);
writeFileSync(join(coursePath, '示意图.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [library] });
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
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    console.error(await js('document.body.innerText.slice(-1800)'));
    throw new Error('Timed out: ' + source);
  };
  const click = async (label) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`,
    );
  await wait('!!window.dela?.knowledge && !!document.querySelector("#main-nav")');
  const attached = await js('window.dela.knowledge.attach()');
  const course = await js(
    `window.dela.knowledge.enroll(${JSON.stringify(attached.id)},'本学期/计算机网络')`,
  );
  const search = await js(`window.dela.knowledge.search(${JSON.stringify(course.id)},'滑动窗口')`);
  assert.equal(search[0].line, 2);
  assert.equal(
    (await js(`window.dela.knowledge.search(${JSON.stringify(course.id)},'只属于另一门课')`))
      .length,
    0,
  );
  await click('知识库');
  await wait('document.body.textContent.includes("我的课程")');
  // 浏览模式：连接文件夹后应能直接看到其中的文件，而不只是文件夹。
  const hasButton = (label) =>
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)})`;
  await wait(hasButton('本学期'));
  await click('本学期');
  await wait(hasButton('计算机网络'));
  await click('计算机网络');
  await wait(
    `document.body.textContent.includes('课堂笔记.md') && document.body.textContent.includes('网络课件.pdf')`,
  );
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('设为课程'))`,
    ),
    true,
  );
  // 浏览模式点击文件应直接在工作台打开；HTML 按渲染视图，相对图片走本机资源协议。
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('课程网页.html')).click()`,
  );
  await wait(
    `document.querySelector('iframe')?.contentDocument?.body?.textContent?.includes('网页渲染成功')`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='渲染预览')`,
  );
  assert.equal(
    await js(
      `document.querySelector('iframe')?.contentDocument?.querySelector('img')?.getAttribute('src')?.startsWith('dela-resource://note-asset/')`,
    ),
    true,
  );
  await js(
    `Array.from(document.querySelectorAll('#main-nav button')).find(b=>b.textContent.trim()==='知识库').click()`,
  );
  await wait('document.body.textContent.includes("我的课程")');
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.querySelector('h3')?.textContent==='计算机网络')`,
  );
  if (!root.endsWith('.asar')) {
    // 窗口未重绘时 capturePage 会拿到空白画面，先触发一次尺寸变化再截图。
    window.setSize(1280, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await js(
      'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    mkdirSync('.build', { recursive: true });
    writeFileSync('.build/knowledge-browse.png', (await window.webContents.capturePage()).toPNG());
  }
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h3')?.textContent==='计算机网络').click()`,
  );
  await wait(
    `document.body.textContent.includes('课堂笔记.md') && !document.body.textContent.includes('正在读取…')`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('p')?.textContent==='课堂笔记.md').click()`,
  );
  await wait(`document.body.textContent.includes('可靠传输')`);
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await js(
      'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
    );
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      'reader ' + width,
    );
    if (!root.endsWith('.asar')) {
      mkdirSync('.build', { recursive: true });
      writeFileSync(
        `.build/knowledge-reader-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
  }
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('p')?.textContent==='网络课件.pdf').click()`,
  );
  await wait(`!!document.querySelector('canvas')`);
  // HTML 资料默认渲染，可切换到源码再切回。
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('p')?.textContent==='课程网页.html').click()`,
  );
  await wait(`!!document.querySelector('iframe')`);
  await wait(
    `document.querySelector('iframe')?.contentDocument?.body?.textContent?.includes('网页渲染成功')`,
  );
  await click('源码');
  await wait(`!document.querySelector('iframe') && !!document.querySelector('.cm-content')`);
  await wait(`document.body.textContent.includes('网页渲染成功')`);
  await click('渲染预览');
  await wait(
    `document.querySelector('iframe')?.contentDocument?.body?.textContent?.includes('网页渲染成功')`,
  );
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('p')?.textContent==='网络课件.pdf').click()`,
  );
  await wait(`!!document.querySelector('canvas')`);
  await click('提取 PDF 正文');
  await wait(`document.body.textContent.includes('已提取 2 页正文')`);
  const indexed = await js(
    `window.dela.knowledge.search(${JSON.stringify(course.id)},'Sliding window')`,
  );
  assert.equal(indexed[0].page, 2);
  await js(
    `(()=>{const input=document.querySelector('[aria-label="检索本课程资料"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Sliding window');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await js(`document.querySelector('button[aria-label="搜索本课程"]').click()`);
  await wait(`document.body.textContent.includes('第 2 页')`);
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Sliding window')&&b.querySelector('p')).click()`,
  );
  await wait(`document.querySelector('[aria-label="PDF 页码"]')?.value==='2'`);
  await click('引用并提问');
  await wait(
    `document.querySelector('[aria-label="发送给助手"]')?.textContent.includes('Sliding window')`,
  );
  const sessionId = await js(`window.dela.knowledge.session(${JSON.stringify(course.id)})`);
  assert.equal(
    (await js(`window.dela.session.open(${JSON.stringify(sessionId)})`)).messages.length,
    0,
  );
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await js(
      'Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
    );
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      'AI ' + width,
    );
    if (width < 1024)
      assert.equal(
        await js(
          `document.querySelector('[aria-label="课程资料列表"]').getBoundingClientRect().bottom<=document.querySelector('[aria-label="课程阅读"]').getBoundingClientRect().top && document.querySelector('[aria-label="课程阅读"]').getBoundingClientRect().bottom<=document.querySelector('aside[aria-label="课程问答"]').getBoundingClientRect().top`,
        ),
        true,
        'stacked panes ' + width,
      );
    if (!root.endsWith('.asar'))
      writeFileSync(
        `.build/knowledge-ai-${width}.png`,
        (await window.webContents.capturePage()).toPNG(),
      );
  }
  const saved = await js(
    `window.dela.knowledge.note(${JSON.stringify(course.id)},'# 学习记录\\n\\n引用：网络课件.pdf 第 2 页')`,
  );
  assert.ok(saved.startsWith(coursePath));
  assert.ok(readFileSync(saved, 'utf8').includes('引用'));
  assert.equal(readFileSync(note, 'utf8'), noteContent);
  assert.equal((await js('window.dela.knowledge.state()')).courses[0].id, course.id);
  // 取消课程与断开连接：只清本机登记，磁盘文件保持原位。
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='知识库'&&!b.closest('#main-nav')).click()`,
  );
  await wait('document.body.textContent.includes("我的课程")');
  await js(`document.querySelector('button[aria-label="取消课程 计算机网络"]').click()`);
  await wait(`document.body.textContent.includes('取消这门课程？')`);
  await js(
    `Array.from(document.querySelectorAll('[role="alertdialog"] button')).find(b=>b.textContent.trim()==='取消课程').click()`,
  );
  await wait(`!document.body.textContent.includes('我的课程')`);
  assert.equal((await js('window.dela.knowledge.state()')).courses.length, 0);
  await js(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='断开连接').click()`,
  );
  await wait(`document.body.textContent.includes('保持连接')`);
  await js(
    `Array.from(document.querySelectorAll('[role="alertdialog"] button')).find(b=>b.textContent.trim()==='断开连接').click()`,
  );
  await wait(`!document.body.textContent.includes('断开连接')`);
  assert.deepEqual(await js('window.dela.knowledge.state()'), { roots: [], courses: [] });
  assert.equal(readFileSync(note, 'utf8'), noteContent);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log(
    'Knowledge smoke passed: in-place folders, folder browsing with files, HTML render/source toggle, course scope, Markdown search, real PDF text extraction and page jump, unsent AI drafts, new notes, course removal and folder detaching without touching source files, and four viewport widths. Synthetic data only; no school or model requests.',
  );
}
