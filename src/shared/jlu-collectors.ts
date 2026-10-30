export const noticeListScript = `(() => {
  const container = document.getElementById('itemContainer');
  if (!container) throw new Error('Missing notice list');
  const items = [...container.querySelectorAll('a.font14')].map(anchor => {
    const url = new URL(anchor.href);
    const row = anchor.closest('.li');
    return {
      id: url.searchParams.get('id'), channel: url.searchParams.get('channelId'),
      title: anchor.textContent.trim().replace(/^\\[置顶\\]\\s*/, ''),
      department: row?.querySelector('.column')?.textContent.trim() || '',
      published: row?.querySelector('.time')?.textContent.trim() || '',
      pinned: !!anchor.querySelector('font'), url: url.href,
    };
  });
  const pagination = document.body.innerText.match(/第\\s*\\d+\\s*\\/\\s*(\\d+)\\s*页/);
  if (!items.length && !/共\\s*0\\s*条记录/.test(document.body.innerText)) throw new Error('Unknown empty list');
  return { ready: true, data: { items, totalPages: pagination ? Number(pagination[1]) : null } };
})()`;

export const noticeDetailScript = `(() => {
  const title = document.querySelector('.content_t');
  const body = document.querySelector('.content_font');
  if (!title || !body) throw new Error('Missing notice content');
  return { ready: true, data: {
    title: title.textContent.trim(),
    metadata: document.querySelector('.content_time')?.textContent.trim() || '',
    text: body.innerText.trim(),
    attachments: [...document.querySelectorAll('a[href]')]
      .filter(a => /attachdownload|download/i.test(a.getAttribute('href')))
      .map(a => ({ name: a.textContent.trim() || a.title || '附件', url: a.href }))
      .concat([...document.querySelectorAll('span[onclick="downloadthis(this)"]')]
        .map(element => ({ name: element.title || element.textContent.trim(), url: location.href, elementId: element.id }))),
  } };
})()`;

/** 返回课程所需字段，不把学生身份字段、会话或媒体签名送出网页。 */
export function learningScript(
  kind: 'terms' | 'courses' | 'recordings',
  query: Record<string, string> = {},
): string {
  const path =
    kind === 'terms'
      ? '/studycenter/platform/common/termList'
      : kind === 'courses'
        ? '/studycenter/platform/classroom/myClassroom'
        : '/coursecenter/liveAndRecord/getLiveAndRecordInfoList';
  const fields =
    kind === 'terms'
      ? ['id', 'year', 'num', 'name', 'selected']
      : kind === 'courses'
        ? ['id', 'name', 'courseName', 'teacherName', 'statusName']
        : ['id', 'liveRecordName', 'currentDate', 'timeRange', 'roomName', 'liveStatus'];
  return `(async () => {
    let response;
    try { response = await fetch(${JSON.stringify(path + '?' + new URLSearchParams(query))}, {
      method: ${JSON.stringify(kind === 'terms' ? 'POST' : 'GET')}, credentials: 'include'
    }); } catch { return { ready: false }; }
    if (response.status === 401) return { ready: false };
    if (response.redirected && /\\/tpass\\/login|\\/cas-server\\/login/.test(new URL(response.url).pathname)) return { ready: false };
    if (!response.ok) throw new Error('Learning request failed');
    let payload; try { payload = await response.json(); } catch { throw new Error('Invalid learning response'); }
    const rows = payload?.data?.dataList;
    if (!Array.isArray(rows)) throw new Error('Missing learning list');
    const fields = ${JSON.stringify(fields)};
    return { ready: true, data: rows.map(row => Object.fromEntries(fields.map(key => [key, row[key]]))) };
  })()`;
}
