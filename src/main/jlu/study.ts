import { randomBytes } from 'node:crypto';
import type { WebContents } from 'electron';
import { z } from 'zod';
import type { JluStudyMedia } from '../../shared/jlu-platforms';
import { studyMediaScript } from '../../shared/jlu-collectors';
import { fetchCampusMedia } from '../vsjtu/playback';
import { getRecordings, syncRecordings } from './api';
import { readSchoolPage } from './reader';

const mediaSchema = z.object({
  videos: z.array(z.object({ name: z.string().nullish(), url: z.string().url() })).min(1),
  subtitles: z.unknown(),
  subtitleError: z.string().nullable(),
});
const subtitlesSchema = z.array(
  z.object({
    startTime: z.coerce.number().finite().nonnegative(),
    endTime: z.coerce.number().finite().nonnegative().nullish(),
    text: z.string().nullable(),
  }),
);
const streams = new Map<string, string>();

export async function studyMedia(
  courseId: string,
  recordingId: string,
  sender?: WebContents,
): Promise<JluStudyMedia> {
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,160}$/)
    .parse(recordingId);
  let recording = getRecordings(courseId)?.items.find((row) => row.id === recordingId);
  if (!recording) throw new Error('请先同步并选择自己的课程录像');
  if (!recording.resourceId) {
    recording = (await syncRecordings(courseId, sender)).items.find(
      (row) => row.id === recordingId,
    );
  }
  if (!recording?.resourceId) throw new Error('该节次尚未提供可播放录像');
  const resourceId = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,160}$/)
    .parse(recording.resourceId);
  const raw = await readSchoolPage({
    url: 'https://ilearnres.jlu.edu.cn/iplat-resc/index.html',
    title: '课程录像',
    sender,
    accepts: (url) =>
      url.origin === 'https://ilearnres.jlu.edu.cn' && url.pathname === '/iplat-resc/index.html',
    resumeFrom: (url) =>
      url.origin === 'https://ilearntec.jlu.edu.cn' && url.pathname === '/studycenter-web/index',
    script: studyMediaScript(resourceId),
  });
  const result = mediaSchema.safeParse(raw);
  if (!result.success) throw new Error('学校录像或字幕结构无法识别，请重试加载');
  const data = result.data;
  const captions = subtitlesSchema.safeParse(data.subtitles);
  const subtitles = captions.success ? captions.data.sort((a, b) => a.startTime - b.startTime) : [];
  for (const video of data.videos) {
    const url = new URL(video.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname.endsWith('.jlu.edu.cn') ||
      url.username ||
      url.password
    )
      throw new Error('学校返回的视频地址暂不支持在应用内播放');
  }
  return {
    streams: data.videos.map((video, index) => {
      const token = randomBytes(24).toString('hex');
      streams.set(token, video.url);
      if (streams.size > 128) streams.delete(streams.keys().next().value!);
      return {
        name: video.name || `画面 ${index + 1}`,
        playbackUrl: `dela-resource://jlu-video/${token}`,
      };
    }),
    subtitles: subtitles
      .map((row, index, rows) => ({
        startMs: row.startTime,
        endMs: rows[index + 1]?.startTime ?? row.endTime ?? row.startTime + 10000,
        text: row.text?.trim() ?? '',
      }))
      .filter((row) => row.text && row.endMs >= row.startMs),
    subtitleError: captions.success ? data.subtitleError : '字幕结构无法识别，视频仍可播放',
  };
}

export async function handleJluMediaRequest(request: Request): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const target = url.hostname === 'jlu-video' ? streams.get(url.pathname.slice(1)) : undefined;
  if (!target) return new Response(null, { status: 403 });
  try {
    const response = await fetchCampusMedia(target, request, 'include');
    if (![200, 206, 416].includes(response.status)) {
      await response.body?.cancel();
      return new Response(null, { status: 502 });
    }
    const headers = new Headers({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (request.method === 'HEAD' || response.status === 416) {
      await response.body?.cancel();
      if (response.status === 416) headers.set('content-length', '0');
      return new Response(null, { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
