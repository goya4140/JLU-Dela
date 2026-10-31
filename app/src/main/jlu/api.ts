import type { WebContents } from 'electron';
import { z } from 'zod';
import type { JluPlatformResult } from '../../shared/jlu-platforms';
import { CampusAuthError, createCampusLoginWindow, getCampusSession } from '../campus';
import { getDatabase } from '../database';
import { readSchoolPage } from './reader';
import { learningScript, noticeDetailScript, noticeListScript } from '../../shared/jlu-collectors';

export const OA_CHANNELS = { '179577': '校内通知' } as const;
export const LEARNING_URL = 'https://ilearntec.jlu.edu.cn/studycenter-web/index#/';
const OA_ORIGIN = 'https://oa.jlu.edu.cn';
const digit = z.string().regex(/^\d+$/);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const text = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => String(value ?? '').trim());
const attachmentSchema = z.object({
  name: z.string(),
  elementId: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+$/)
    .optional(),
  url: z
    .string()
    .url()
    .refine((url) => new URL(url).origin === OA_ORIGIN),
});
const noticeSchema = z.object({
  id: digit,
  channel: digit,
  title: z.string().min(1),
  department: z.string(),
  published: z.string(),
  pinned: z.boolean(),
  url: z
    .string()
    .url()
    .refine((url) => new URL(url).origin === OA_ORIGIN),
});
export const noticePageSchema = z.object({
  channel: digit,
  page: z.number().int().positive(),
  totalPages: z.number().int().positive().nullable(),
  items: z.array(noticeSchema),
  syncedAt: z.string().datetime(),
});
export const noticeDetailSchema = z.object({
  id: digit,
  channel: digit,
  title: z.string().min(1),
  metadata: z.string(),
  text: z.string(),
  attachments: z.array(attachmentSchema),
  url: z.string().url(),
  syncedAt: z.string().datetime(),
});
const termSchema = z.object({
  id: identifier,
  year: text.pipe(z.string().regex(/^\d{4}$/)),
  num: text.pipe(z.string().regex(/^\d+$/)),
  name: text,
  selected: z
    .union([z.string(), z.number(), z.boolean()])
    .nullish()
    .transform((v) => ['1', 'true', 'selected'].includes(String(v))),
});
const courseRowSchema = z
  .object({ id: identifier, name: text, courseName: text, teacherName: text, statusName: text })
  .refine((row) => !!(row.name || row.courseName));
export const learningSchema = z.object({
  terms: z.array(termSchema),
  termId: identifier.nullable(),
  courses: z.array(
    z.object({
      id: identifier,
      name: z.string(),
      courseName: z.string(),
      teacher: z.string(),
      status: z.string(),
    }),
  ),
  syncedAt: z.string().datetime(),
});
export const recordingsSchema = z.object({
  courseId: identifier,
  items: z.array(
    z.object({
      id: identifier,
      resourceId: text.optional(),
      name: z.string(),
      date: z.string(),
      time: z.string(),
      room: z.string(),
      status: z.string(),
    }),
  ),
  syncedAt: z.string().datetime(),
});

function cached<T>(key: string, schema: z.ZodType<T>): T | null {
  const row = getDatabase().prepare('SELECT data FROM jlu_platform_cache WHERE key=?').get(key) as
    { data: string } | undefined;
  if (!row) return null;
  try {
    return schema.parse(JSON.parse(row.data));
  } catch {
    throw new Error('本地校园缓存无法识别，请重新同步');
  }
}
function save<T>(key: string, data: T): T {
  getDatabase()
    .prepare('INSERT OR REPLACE INTO jlu_platform_cache (key,data) VALUES (?,?)')
    .run(key, JSON.stringify(data));
  return data;
}
export async function platformResult<T>(work: () => Promise<T>): Promise<JluPlatformResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '学校平台读取失败',
      ...(error instanceof CampusAuthError ? { reason: 'auth' as const } : {}),
    };
  }
}
function listUrl(channel: string, page: number): string {
  return `${OA_ORIGIN}/defaultroot/PortalInformation!jldxList.action?${new URLSearchParams({ channelId: digit.parse(channel), startPage: String(z.number().int().positive().parse(page)) })}`;
}
function detailUrl(id: string, channel: string): string {
  return `${OA_ORIGIN}/defaultroot/PortalInformation!getInformation.action?${new URLSearchParams({ id: digit.parse(id), channelId: digit.parse(channel) })}`;
}
export function getNotices(channel: string, page: number) {
  listUrl(channel, page);
  return cached(`oa:${channel}:${page}`, noticePageSchema);
}
export async function syncNotices(channel: string, page: number, sender?: WebContents) {
  const url = listUrl(channel, page);
  const raw = await readSchoolPage({
    url,
    title: '电子校务通知',
    sender,
    accepts: (current) =>
      current.origin === OA_ORIGIN &&
      current.pathname.endsWith('/PortalInformation!jldxList.action'),
    script: noticeListScript,
  });
  const result = noticePageSchema.safeParse({
    ...(raw as object),
    channel,
    page,
    syncedAt: new Date().toISOString(),
  });
  if (!result.success) throw new Error('电子校务通知结构已变化，本地列表未更新');
  const date = (offset: number) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + offset * 86400000));
  for (const item of result.data.items)
    item.published = item.published
      .replace(/^今天\s*/, `${date(0)} `)
      .replace(/^昨天\s*/, `${date(-1)} `)
      .trim();
  return save(`oa:${channel}:${page}`, result.data);
}
export function getNotice(id: string, channel: string) {
  detailUrl(id, channel);
  return cached(`oa-detail:${channel}:${id}`, noticeDetailSchema);
}
export async function readNotice(id: string, channel: string, sender?: WebContents) {
  const url = detailUrl(id, channel);
  const raw = await readSchoolPage({
    url,
    title: '电子校务通知正文',
    sender,
    accepts: (current) =>
      current.origin === OA_ORIGIN &&
      current.pathname.endsWith('/PortalInformation!getInformation.action'),
    script: noticeDetailScript,
  });
  const result = noticeDetailSchema.safeParse({
    ...(raw as object),
    id,
    channel,
    url,
    syncedAt: new Date().toISOString(),
  });
  if (!result.success) throw new Error('通知正文或附件结构已变化，本地正文未更新');
  return save(`oa-detail:${channel}:${id}`, result.data);
}
export function getLearning() {
  return cached('learning', learningSchema);
}
async function learningData(script: string, sender?: WebContents): Promise<unknown> {
  return readSchoolPage({
    url: LEARNING_URL,
    title: '学在吉大',
    sender,
    accepts: (current) =>
      current.origin === 'https://ilearntec.jlu.edu.cn' &&
      current.pathname === '/studycenter-web/index',
    script,
  });
}
export async function syncLearning(requested?: string, sender?: WebContents) {
  const terms = z.array(termSchema).safeParse(await learningData(learningScript('terms'), sender));
  if (!terms.success || !terms.data.length) throw new Error('学在吉大学期数据缺失，本地课程未更新');
  const term = requested
    ? terms.data.find((row) => row.id === identifier.parse(requested))
    : (terms.data.find((row) => row.selected) ?? terms.data[0]);
  if (!term) throw new Error('所选学期不在学校返回的列表中');
  const courses = z
    .array(courseRowSchema)
    .safeParse(
      await learningData(
        learningScript('courses', { termYear: term.year, term: term.num }),
        sender,
      ),
    );
  if (!courses.success) throw new Error('学在吉大课程结构已变化，本地课程未更新');
  const data = {
    terms: terms.data,
    termId: term.id,
    courses: courses.data.map((row) => ({
      id: row.id,
      name: row.name,
      courseName: row.courseName,
      teacher: row.teacherName,
      status: row.statusName,
    })),
    syncedAt: new Date().toISOString(),
  };
  return save('learning', data);
}
export function getRecordings(courseId: string) {
  return cached(`recordings:${identifier.parse(courseId)}`, recordingsSchema);
}
export async function syncRecordings(courseId: string, sender?: WebContents) {
  identifier.parse(courseId);
  if (!getLearning()?.courses.some((course) => course.id === courseId))
    throw new Error('请先同步并选择自己的课程');
  const rows = z
    .array(
      z.object({
        id: identifier,
        resourceId: text,
        liveRecordName: text,
        currentDate: text,
        timeRange: text,
        roomName: text,
        liveStatus: text,
      }),
    )
    .safeParse(
      await learningData(
        learningScript('recordings', { roomType: '0', identity: '0', teachClassId: courseId }),
        sender,
      ),
    );
  if (!rows.success) throw new Error('学在吉大回放目录结构已变化，本地目录未更新');
  return save(`recordings:${courseId}`, {
    courseId,
    items: rows.data.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      name: row.liveRecordName,
      date: row.currentDate,
      time: row.timeRange,
      room: row.roomName,
      status: row.liveStatus,
    })),
    syncedAt: new Date().toISOString(),
  });
}
export async function openSchoolUrl(sender: WebContents, url: string, title: string) {
  await getCampusSession();
  const window = createCampusLoginWindow(sender, title);
  await window.loadURL(url);
  return window;
}
export async function openAttachment(
  sender: WebContents,
  id: string,
  channel: string,
  index: number,
) {
  const attachment = getNotice(id, channel)?.attachments[
    z.number().int().nonnegative().parse(index)
  ];
  if (!attachment) throw new Error('附件不在已读取的通知中');
  const window = await openSchoolUrl(sender, attachment.url, attachment.name);
  if (attachment.elementId)
    await window.webContents.executeJavaScript(`(() => {
      const element = document.getElementById(${JSON.stringify(attachment.elementId)});
      if (!element || element.getAttribute('onclick') !== 'downloadthis(this)') throw new Error('附件入口已变化');
      element.click();
    })()`);
}

export async function openNotice(sender: WebContents, id: string, channel: string): Promise<void> {
  await openSchoolUrl(sender, detailUrl(id, channel), '学校通知原文');
}
