import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');
const require = createRequire(join(root, 'package.json'));
(app as typeof app & { setAppPath(path: string): void }).setAppPath(root);
const profile = mkdtempSync(join(tmpdir(), 'dela-wechat-smoke-'));
for (const name of ['userData', 'home', 'documents'] as const) app.setPath(name, profile);
process.argv.push('--terminal-smoke-test');
const timeout = setTimeout(() => {
  console.error('WeChat smoke timed out');
  app.exit(1);
}, 55000);
app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once(
    'did-finish-load',
    () =>
      void run(window).then(
        () => {
          clearTimeout(timeout);
          app.exit(0);
        },
        (error) => {
          console.error(error);
          app.exit(1);
        },
      ),
  );
});
require(join(root, 'out/main/index.cjs'));

async function run(window: BrowserWindow) {
  const js = (source: string) =>
    window.webContents.executeJavaScript(source).catch((error) => {
      console.error('Failed smoke expression:', source);
      throw error;
    });
  async function wait(source: string) {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (await js(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    console.error(await js('document.body.innerText.slice(-1600)'));
    throw new Error(`Timed out: ${source}`);
  }
  async function click(label: string) {
    const lookup = `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)})`;
    await wait(`!!(${lookup}) && !(${lookup}).disabled`);
    await js(`${lookup}.click()`);
  }
  await wait('!!window.dela?.wechatMirror && !!document.querySelector("#main-nav")');
  assert.equal((await js('window.dela.wechatMirror.getSupport()')).supported, true);
  await js(`(()=>{
    window.wechatTestMode='window';
    window.wechatTestStreams=[];
    navigator.mediaDevices.getDisplayMedia=async()=>{
      if(window.wechatTestMode==='cancel') throw new DOMException('cancelled','NotAllowedError');
      const canvas=document.createElement('canvas');
      canvas.width=960; canvas.height=540;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#f4f4f4'; ctx.fillRect(0,0,960,540);
      ctx.fillStyle='#dedede'; ctx.fillRect(0,0,260,540);
      ctx.fillStyle='#262626'; ctx.font='24px sans-serif';
      ctx.fillText('Synthetic WeChat window',300,80);
      ctx.font='18px sans-serif';
      ctx.fillText('Local display only',300,140);
      const stream=canvas.captureStream(15);
      const track=stream.getVideoTracks()[0];
      const settings=track.getSettings.bind(track);
      const mode=window.wechatTestMode;
      track.getSettings=()=>({...settings(), displaySurface: mode});
      window.wechatTestStreams.push(stream);
      return stream;
    };
  })()`);
  await click('微信窗口');
  await wait('document.querySelector("[role=tab]")?.textContent.includes("微信窗口")');
  await wait('!!document.querySelector("video")');
  assert.equal(await js('document.querySelectorAll("video")[0].srcObject'), null);
  await js('window.wechatTestMode="monitor"');
  await click('选择微信窗口');
  await wait('document.body.textContent.includes("不要选择整个屏幕")');
  assert.equal(
    await js(
      'window.wechatTestStreams.at(-1).getTracks().every(track=>track.readyState==="ended")',
    ),
    true,
  );
  await js('window.wechatTestMode="cancel"');
  await click('选择微信窗口');
  await wait('document.body.textContent.includes("未开始共享")');
  await js('window.wechatTestMode="window"');
  await click('选择微信窗口');
  await wait(
    'document.querySelector("video")?.videoWidth===960 && document.body.textContent.includes("正在镜像")',
  );
  assert.equal(await js('document.querySelector("video").muted'), true);
  mkdirSync('.build', { recursive: true });
  window.setMinimumSize(360, 500);
  for (const width of [600, 900, 1280, 1800]) {
    window.setSize(width, 850);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(
      await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),
      true,
      `WeChat overflow at ${width}`,
    );
    writeFileSync(`.build/wechat-${width}.png`, (await window.webContents.capturePage()).toPNG());
  }
  await click('停止镜像');
  assert.equal(
    await js(
      'window.wechatTestStreams.at(-1).getTracks().every(track=>track.readyState==="ended")',
    ),
    true,
  );
  await click('选择微信窗口');
  await wait('document.body.textContent.includes("正在镜像")');
  await js(
    '(()=>{window.wechatStopSignals=0; window.dela.wechatMirror.onStop(()=>window.wechatStopSignals++);})()',
  );
  app.show();
  window.show();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(window.isVisible(), true);
  window.hide();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(window.isVisible(), false);
  assert.equal(await js('window.wechatStopSignals'), 1);
  await wait(
    'window.wechatTestStreams.at(-1).getTracks().every(track=>track.readyState==="ended")',
  );
  window.show();
  await click('选择微信窗口');
  await wait('document.body.textContent.includes("正在镜像")');
  await click('首页');
  await wait(
    'window.wechatTestStreams.at(-1).getTracks().every(track=>track.readyState==="ended")',
  );
  await click('微信窗口');
  await wait('document.body.textContent.includes("窗口镜像实验")');
  assert.equal(await js('document.querySelectorAll("[role=tab]").length'), 1);
  assert.equal(
    await js(
      'window.wechatTestStreams.every(stream=>stream.getTracks().every(track=>track.readyState==="ended"))',
    ),
    true,
  );
  console.log(
    'WeChat mirror smoke passed: workbench tab, local video, screen rejection, picker cancellation, stop, hide, navigation cleanup, and four viewport sizes. No native WeChat capture or login was performed.',
  );
}
