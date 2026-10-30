// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  learningScript,
  noticeDetailScript,
  noticeListScript,
} from '../../../shared/jlu-collectors';

function page(
  html: string,
  url = 'https://oa.jlu.edu.cn/defaultroot/PortalInformation!getInformation.action?id=1&channelId=179577',
) {
  document.head.innerHTML = `<base href="${url}">`;
  document.body.innerHTML = html;
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return (this as HTMLElement).textContent;
    },
  });
  const dom = {
    window,
    close: () => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    },
  };
  return dom;
}
it('extracts notice rows and pagination without inventing missing lists', () => {
  const dom = page(
    '<div id="itemContainer"><div class="li"><a class="font14" href="PortalInformation!getInformation.action?id=1&channelId=179577"><font>[置顶]</font>示例通知</a><a class="column">示例单位</a><span class="time">2026-10-30</span></div></div><div>第 1 /25 页 共 750 条记录</div>',
  );
  expect(dom.window.eval(noticeListScript)).toMatchObject({
    ready: true,
    data: {
      items: [{ id: '1', title: '示例通知', department: '示例单位', pinned: true }],
      totalPages: 25,
    },
  });
  dom.window.document.body.innerHTML = '<h1>服务维护</h1>';
  expect(() => dom.window.eval(noticeListScript)).toThrow();
  dom.close();
});
it('keeps body text and both standard links and official scripted attachment entries', () => {
  const dom = page(
    '<div class="content_t">示例通知</div><div class="content_time">2026-10-30 示例单位</div><div class="content_font">正文<script>ignored()</script></div><span id="test.pdf" title="示例.pdf" onclick="downloadthis(this)">示例.pdf</span><a href="/defaultroot/rd/download/attachdownload.jsp?res=test">附表</a>',
  );
  const result = dom.window.eval(noticeDetailScript);
  expect(result).toMatchObject({
    data: {
      title: '示例通知',
      metadata: '2026-10-30 示例单位',
      attachments: [{ name: '附表' }, { name: '示例.pdf', elementId: 'test.pdf' }],
    },
  });
  expect(result).not.toHaveProperty('data.html');
  dom.close();
});
it('selects only the required learning fields and rejects absent lists', async () => {
  const dom = page('', 'https://ilearntec.jlu.edu.cn/studycenter-web/index');
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({
      data: {
        dataList: [
          {
            id: 'course-1',
            courseName: '示例课程',
            teacherName: '示例教师',
            studentId: 'private-student',
            token: 'private-token',
          },
        ],
      },
    }),
  });
  Object.assign(dom.window, { fetch });
  const result = await dom.window.eval(learningScript('courses', { termYear: '2026', term: '1' }));
  expect(JSON.stringify(result)).not.toMatch(/private-|studentId|token/);
  expect(result).toMatchObject({ data: [{ id: 'course-1', courseName: '示例课程' }] });
  fetch.mockResolvedValueOnce({ status: 401 });
  expect(await dom.window.eval(learningScript('terms'))).toEqual({ ready: false });
  fetch.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ data: {} }) });
  await expect(dom.window.eval(learningScript('terms'))).rejects.toThrow('Missing');
  dom.close();
});
