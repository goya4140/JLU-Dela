export const chaoxingEntryScript = `(() => {
  const heading=document.getElementById('first21583') || [...document.querySelectorAll('h3')].find(el=>/^(课程|courses)$/i.test(el.textContent.trim()));
  if(!heading) return {ready:false};
  if(!document.documentElement.dataset.delaCourses) {document.documentElement.dataset.delaCourses='1';heading.click();}
  const frame=document.querySelector('iframe#frame_content');
  const url=frame?.src && new URL(frame.src);
  return url?.hostname==='mooc2-ans.chaoxing.com' && url.pathname==='/visit/interaction' ? {ready:true,data:{url:url.href}} : {ready:false};
})()`;
export const chaoxingCoursesScript = `(() => {
  const cards=[...document.querySelectorAll('.course.learnCourse')];
  if(!cards.length) {
    if(/暂无课程|还没有课程/.test(document.body.innerText)) return {ready:true,data:[]};
    return {ready:false};
  }
  return {ready:true,data:cards.map(row=>{
    const link=row.querySelector('h3 a[href]'), name=row.querySelector('.course-name');
    const url=link && new URL(link.href), courseId=url?.searchParams.get('courseid'),classId=url?.searchParams.get('clazzid');
    return {id:courseId+':'+classId,name:name?.getAttribute('title')||name?.textContent.trim(),teacher:row.querySelector('.course-info .color3')?.textContent.trim()||'',ended:!!row.querySelector('.not-open-tip'),url:url?.href};
  })};
})()`;
export function chaoxingFrameScript(kind: 'files' | 'works'): string {
  return `(() => {
    const frame=document.querySelector(${JSON.stringify(kind === 'files' ? 'iframe#frame_content-zl' : 'iframe#frame_content-zy')});
    return frame?.src ? {ready:true,data:{url:frame.src}} : {ready:false};
  })()`;
}
export const chaoxingFilesScript = `(() => {
  const body=document.querySelector('.dataBody');
  if(!body) return {ready:false};
  const rows=[...body.querySelectorAll('.dataBody_td')];
  if(!rows.length && !/暂无|没有|无资料|无文件/.test(body.innerText)) throw new Error('Unknown empty resources');
  const field=id=>document.getElementById(id)?.value || '';
  const items=rows.map(row=>{
    const type=row.getAttribute('type')||'', id=row.id || 'teacher-courseware';
    const name=row.getAttribute('dataname') || row.querySelector('.dataBody_name_stu')?.textContent.trim();
    let folderUrl=null,downloadUrl=null;
    if(type==='afolder') {
      const url=new URL(location.href);
      for(const [key,value] of Object.entries({dataId:id,dataName:name,type:'1',parent:[...document.querySelectorAll('.subtitleId')].map(e=>e.id).join(','),flag:'0',enc:field('enc'),cpi:field('cpi'),ut:field('ut')||'s',microTopicId:field('microTopicId')})) url.searchParams.set(key,value);
      folderUrl=url.href;
    } else if(row.getAttribute('isdown')==='1' && field('downloadDomain')) {
      const url=new URL(field('downloadDomain')+'/coursedata/downloadData');
      for(const [key,value] of Object.entries({dataId:id,classId:field('classId'),cpi:field('cpi'),courseId:field('courseId'),ut:'s'})) url.searchParams.set(key,value);
      downloadUrl=url.href;
    }
    return {id,name,type,size:row.querySelector('.dataBody_size_stu')?.textContent.trim()||'',creator:row.querySelector('.dataBody_creater_stu')?.textContent.trim()||'',date:row.querySelector('.dataBody_time_stu')?.textContent.trim()||'',downloadable:!!downloadUrl,folderUrl,downloadUrl};
  });
  return {ready:true,data:items};
})()`;
export const chaoxingWorksScript = `(() => {
  const container=document.querySelector('.bottomList');
  if(!container) return {ready:false};
  const rows=[...container.querySelectorAll('li[data][role="link"]')];
  if(!rows.length && !/暂无作业|没有作业|未发布作业/.test(document.body.innerText)) throw new Error('Unknown empty work list');
  return {ready:true,data:rows.map(row=>({id:new URL(row.getAttribute('data'),location.href).searchParams.get('workId'),title:row.querySelector('.right-content .overHidden2')?.textContent.trim(),status:row.querySelector('.status')?.textContent.trim()||'',timing:row.querySelector('.time')?.textContent.trim()||'',url:new URL(row.getAttribute('data'),location.href).href,detailTiming:row.querySelector('.time')?.getAttribute('title')?.trim()||undefined}))};
})()`;

export const chaoxingDetailTimingScript = String.raw`(() => {
  const lines = [];
  for (const element of document.querySelectorAll('p, li, label, dd, dt, td, th, span, div')) {
    if (lines.length >= 10) break;
    if (element.closest('script, style, textarea, input, [contenteditable], [hidden], [aria-hidden="true"]') || element.querySelector('textarea, input, [contenteditable]')) continue;
    const text = (element.innerText ?? '').trim();
    if (text.length > 180 || !/(?:截止时间|截止日期|截止|deadline|due(?:\s+date)?|end\s*(?:time|date))\s*[:：]?\s*20\d{2}[-/.年]/i.test(text)) continue;
    let visible = true;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') { visible = false; break; }
    }
    if (visible && !lines.includes(text)) lines.push(text);
  }
  return lines.join('\n');
})()`;
