import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../api', () => ({ getRecordings: vi.fn(), syncRecordings: vi.fn() }));
vi.mock('../reader', () => ({ readSchoolPage: vi.fn() }));
vi.mock('../../vsjtu/playback', () => ({ fetchCampusMedia: vi.fn() }));
import { getRecordings, syncRecordings } from '../api';
import { readSchoolPage } from '../reader';
import { fetchCampusMedia } from '../../vsjtu/playback';
import { handleJluMediaRequest, studyMedia } from '../study';
const reader = vi.mocked(readSchoolPage);
const recording = {
  id: 'r1',
  resourceId: 'res1',
  name: 'Example',
  date: '',
  time: '',
  room: '',
  status: '2',
};
const details = {
  videos: [{ name: '教师', url: 'https://ilearnres.jlu.edu.cn/example.mp4?signature=private' }],
  subtitles: [
    { startTime: 1000, endTime: null, text: '第一段' },
    { startTime: 5000, endTime: 8000, text: '第二段' },
  ],
  subtitleError: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRecordings).mockReturnValue({
    courseId: 'c1',
    items: [recording],
    syncedAt: '2026-10-30T00:00:00Z',
  });
  reader.mockResolvedValue(details);
});
it('keeps upstream signatures out of renderer data and proxies Range responses', async () => {
  const result = await studyMedia('c1', 'r1');
  expect(JSON.stringify(result)).not.toContain('signature');
  expect(result.subtitles[0]).toEqual({ startMs: 1000, endMs: 5000, text: '第一段' });
  vi.mocked(fetchCampusMedia).mockResolvedValue(
    new Response('bytes', {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-range': 'bytes 1-5/10',
        'set-cookie': 'private',
      },
    }),
  );
  const request = new Request(result.streams[0]!.playbackUrl, { headers: { range: 'bytes=1-5' } });
  const response = await handleJluMediaRequest(request);
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe('bytes 1-5/10');
  expect(response.headers.has('set-cookie')).toBe(false);
  expect(await response.text()).toBe('bytes');
  expect(fetchCampusMedia).toHaveBeenCalledWith(details.videos[0]!.url, request, 'include');
});
it('rejects unknown recordings and unissued playback requests', async () => {
  await expect(studyMedia('c1', 'other')).rejects.toThrow('自己的课程');
  expect(reader).not.toHaveBeenCalled();
  expect(
    (await handleJluMediaRequest(new Request('dela-resource://jlu-video/not-issued'))).status,
  ).toBe(403);
});
it('refreshes older catalogs before resolving the resource and preserves missing subtitles honestly', async () => {
  vi.mocked(getRecordings).mockReturnValue({
    courseId: 'c1',
    items: [{ ...recording, resourceId: undefined }],
    syncedAt: '2026-10-30T00:00:00Z',
  });
  vi.mocked(syncRecordings).mockResolvedValue({
    courseId: 'c1',
    items: [recording],
    syncedAt: '2026-10-30T00:00:00Z',
  });
  reader.mockResolvedValue({ ...details, subtitles: [], subtitleError: '字幕请求失败' });
  expect(await studyMedia('c1', 'r1')).toMatchObject({
    subtitles: [],
    subtitleError: '字幕请求失败',
  });
  expect(syncRecordings).toHaveBeenCalledWith('c1', undefined);
});
it('rejects remote destinations outside school media domains', async () => {
  reader.mockResolvedValue({
    ...details,
    videos: [{ name: 'bad', url: 'https://example.com/video.mp4' }],
  });
  await expect(studyMedia('c1', 'r1')).rejects.toThrow('视频地址');
});
it('keeps video usable if a successful subtitle response has changed shape', async () => {
  reader.mockResolvedValue({ ...details, subtitles: [{ content: 'unknown' }] });
  expect(await studyMedia('c1', 'r1')).toMatchObject({
    streams: [{ name: '教师' }],
    subtitles: [],
    subtitleError: expect.stringContaining('字幕结构'),
  });
});
