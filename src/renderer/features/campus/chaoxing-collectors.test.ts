// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  chaoxingCoursesScript,
  chaoxingFilesScript,
  chaoxingWorksScript,
} from '../../../shared/chaoxing-collectors';
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  configurable: true,
  get() {
    return (this as HTMLElement).textContent;
  },
});
it('extracts visible course metadata and retains the official route only for main', () => {
  document.body.innerHTML = `<div class="course learnCourse"><div class="course-info"><h3><a href="https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=1&clazzid=2&enc=private"><span class="course-name" title="示例课程">示例课程</span></a></h3><p class="color3">示例教师</p></div></div>`;
  expect(window.eval(chaoxingCoursesScript)).toMatchObject({
    ready: true,
    data: [{ id: '1:2', name: '示例课程', teacher: '示例教师', ended: false }],
  });
});
it('distinguishes folders, downloadable documents and special teacher courseware', () => {
  document.body.innerHTML = `<input id="downloadDomain" value="https://mooc1.chaoxing.com"><input id="cpi" value="3"><input id="classId" value="2"><input id="courseId" value="1"><div class="dataBody"><ul class="dataBody_td" id="f1" type="afolder" dataname="课件"></ul><ul class="dataBody_td" id="d1" type="pdf" dataname="示例.pdf" isdown="1"><li class="dataBody_size_stu">12KB</li></ul><ul class="dataBody_td" type="tch-courseware"><li class="dataBody_name_stu">教师课件</li></ul></div>`;
  const result = window.eval(chaoxingFilesScript);
  expect(result.data).toMatchObject([
    { id: 'f1', type: 'afolder', downloadable: false },
    { id: 'd1', type: 'pdf', downloadable: true },
    { id: 'teacher-courseware', type: 'tch-courseware', downloadable: false },
  ]);
  expect(result.data[1].downloadUrl).toContain('/coursedata/downloadData?');
});
it('reads assignment metadata without opening an attempt or collecting answers', () => {
  document.body.innerHTML = `<div class="bottomList"><li role="link" data="https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?workId=w1&answerId=private&enc=secret"><div class="right-content"><p class="overHidden2 fl">示例作业</p><p class="status fl">未交</p></div><div class="time">剩余2天</div></li></div>`;
  const result = window.eval(chaoxingWorksScript);
  expect(result).toEqual({
    ready: true,
    data: [{ id: 'w1', title: '示例作业', status: '未交', timing: '剩余2天' }],
  });
  expect(JSON.stringify(result)).not.toMatch(/private|secret|answerId/);
  document.body.innerHTML = '<div class="bottomList">服务维护</div>';
  expect(() => window.eval(chaoxingWorksScript)).toThrow('Unknown empty');
  document.body.innerHTML = '<div class="bottomList">暂无作业</div>';
  expect(window.eval(chaoxingWorksScript)).toMatchObject({ ready: true, data: [] });
});
