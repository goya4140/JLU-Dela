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
writeFileSync(note, '# 可靠传输\n滑动窗口通过确认实现可靠传输。\n');
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
  assert.equal(readFileSync(note, 'utf8'), '# 可靠传输\n滑动窗口通过确认实现可靠传输。\n');
  assert.equal((await js('window.dela.knowledge.state()')).courses[0].id, course.id);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  console.log(
    'Knowledge smoke passed: in-place folders, course scope, Markdown search, real PDF text extraction and page jump, unsent AI drafts, new notes, source preservation and four viewport widths. Synthetic data only; no school or model requests.',
  );
}
