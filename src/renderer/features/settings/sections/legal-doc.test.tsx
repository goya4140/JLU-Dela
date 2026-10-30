// @vitest-environment jsdom
// 条款页：docs 下的 Markdown 到设置页版式的映射。两个文档各跑一遍。
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import privacy from '../../../../../docs/privacy.md?raw';
import terms from '../../../../../docs/terms.md?raw';
import { PrivacySection } from './PrivacySection';
import { TermsSection } from './TermsSection';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/**
 * 加粗必须全部生效：源码里每对 ** 都要有一个 strong，正文里不能残留字面星号。
 * `。**你` 这类「加粗以中文标点收尾、紧跟汉字」的写法 CommonMark 不认为闭合，
 * 只会渲染出星号（GitHub 同样如此）——这条断言是回归护栏，改条款正文时别退化回去。
 */
function expectBoldAllRendered(markdown: string) {
  const strong = [...container.querySelectorAll('strong')].map((node) => node.textContent ?? '');
  expect(strong.length).toBe((markdown.match(/\*\*/g) ?? []).length / 2);
  expect(container.textContent).not.toContain('**');
  return strong;
}

async function render(node: ReactElement) {
  await act(async () => root.render(node));
}

it('renders JLU preview scope and preserves the upstream license link', async () => {
  await render(<TermsSection />);
  expect([...container.querySelectorAll('h1')].map((node) => node.textContent)).toEqual([
    '使用条款',
  ]);
  expect(container.textContent).toContain('非官方适配项目');
  expect(container.textContent).toContain('同步仍待接入');
  expect(
    container.querySelector('a[href="https://github.com/goya4140/JLU-Dela/blob/main/LICENSE"]'),
  ).not.toBeNull();
  expectBoldAllRendered(terms);
});

it('renders the isolated JLU data paths and describes model transmission', async () => {
  await render(<PrivacySection />);
  expect([...container.querySelectorAll('h1')].map((node) => node.textContent)).toEqual([
    '隐私条款',
  ]);
  expect(container.textContent).toContain('~/Library/Application Support/JLU-Dela/');
  expect(container.textContent).toContain('~/.jlu-dela/skills/');
  expect(container.textContent).toContain('不代表模型推理离线');
  expect(container.textContent).toContain('当前仅在系统浏览器中打开');
  expectBoldAllRendered(privacy);
});
