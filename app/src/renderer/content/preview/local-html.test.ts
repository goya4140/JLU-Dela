// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { prepareLocalHtml } from './local-html';

it('keeps static content and relative assets while removing scripts, forms and remote resources', () => {
  const id = '/课程/网页.html';
  const result = prepareLocalHtml(
    `<html><head><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="css/main.css"><style>body{background-image:url(images/bg.png)}</style></head><body onload="alert(1)"><h1 id="lesson">课程</h1><script>window.evil=true</script><img src="images/图.png"><img src="https://evil.example/tracker"><form><input></form><iframe src="https://evil.example"></iframe><a href="#lesson">目录</a><a href="javascript:alert(1)">链接</a></body></html>`,
    id,
  );
  const doc = new DOMParser().parseFromString(result.html, 'text/html');
  expect(result.needsScripts).toBe(true);
  expect(doc.querySelector('h1')?.textContent).toBe('课程');
  expect(doc.querySelector('script,iframe,form,[onload]')).toBeNull();
  expect(doc.querySelector('base')?.href).toBe(
    `dela-resource://html-asset/${encodeURIComponent(id)}/`,
  );
  expect(doc.querySelector('link')?.href).toContain('/css/main.css');
  expect(doc.querySelector('img')?.src).toContain('/images/');
  expect(doc.querySelectorAll('img')[1]?.getAttribute('src')).toBeNull();
  expect(doc.querySelectorAll('a')[1]?.getAttribute('href')).toBeNull();
  expect(doc.querySelector('meta')?.content).toContain("script-src 'none'");
  expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
});
