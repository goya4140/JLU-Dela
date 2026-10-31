import { describe, it, expect, vi } from 'vitest';
import {
  connectPlatforms,
  connectPlatform,
  readPlatformProgress,
  jluSetupOrder,
  type SetupApi,
  type SetupResult,
} from './platform-setup';
const date = '2026-10-31T02:00:00.000Z';
function fixture() {
  const api = {
    timetable: {
      syncNow: vi.fn<SetupApi['timetable']['syncNow']>(async () => ({ ok: true })),
      connect: vi.fn<SetupApi['timetable']['connect']>(async () => ({ ok: true })),
      getState: vi.fn(async () => ({ lastSyncedAt: date })),
    },
    jluPlatforms: {
      getNotices: vi.fn(async () => ({ syncedAt: date })),
      getLearning: vi.fn(async () => null),
      syncNotices: vi.fn(async () => ({ ok: true, data: { syncedAt: date } })),
      syncLearning: vi.fn(async () => ({ ok: true, data: { syncedAt: date } })),
    },
    chaoxing: {
      courses: vi.fn(async () => null),
      syncCourses: vi.fn(async () => ({ ok: true, data: { syncedAt: date } })),
    },
  };
  return { api: api as unknown as SetupApi, mocks: api };
}
describe('campus setup', () => {
  it('reads historical cache without authentication or network sync and preserves other cache states on a failed local read', async () => {
    const { api, mocks } = fixture();
    mocks.jluPlatforms.getLearning.mockRejectedValueOnce(new Error('disk failure'));
    const state = await readPlatformProgress(api);
    expect(state.academic).toEqual({ phase: 'cached', syncedAt: date });
    expect(state.learning.phase).toBe('failed');
    expect(state.chaoxing.phase).toBe('empty');
    expect(mocks.timetable.connect).not.toHaveBeenCalled();
    expect(mocks.timetable.syncNow).not.toHaveBeenCalled();
    expect(mocks.jluPlatforms.syncNotices).not.toHaveBeenCalled();
  });
  it('connects JLU platforms in order, reuses a valid session and leaves Chaoxing for a separate action', async () => {
    const { api, mocks } = fixture();
    const events: string[] = [];
    await connectPlatforms(api, jluSetupOrder, (id, result) => {
      events.push(id + ':' + (result === null ? 'start' : result.ok ? 'ok' : 'failed'));
    });
    expect(events).toEqual([
      'academic:start',
      'academic:ok',
      'notices:start',
      'notices:ok',
      'learning:start',
      'learning:ok',
    ]);
    expect(mocks.timetable.connect).not.toHaveBeenCalled();
    expect(mocks.chaoxing.syncCourses).not.toHaveBeenCalled();
    expect(await connectPlatform(api, 'chaoxing')).toEqual({ ok: true, syncedAt: date });
    expect(mocks.chaoxing.syncCourses).toHaveBeenCalledOnce();
  });
  it('opens manual academic authentication only after confirmed auth failure, then retries the requested sync', async () => {
    const { api, mocks } = fixture();
    mocks.timetable.syncNow.mockResolvedValueOnce({
      ok: false,
      reason: 'auth',
      error: '请认证',
    });
    expect(await connectPlatform(api, 'academic')).toEqual({ ok: true, syncedAt: date });
    expect(mocks.timetable.connect).toHaveBeenCalledOnce();
    expect(mocks.timetable.syncNow).toHaveBeenCalledTimes(2);
  });
  it('does not classify a network error as expired login and can still connect later platforms', async () => {
    const { api, mocks } = fixture();
    mocks.timetable.syncNow.mockRejectedValueOnce(new Error('请求超时'));
    const results: SetupResult[] = [];
    await connectPlatforms(api, jluSetupOrder, (_id, result) => {
      if (result) results.push(result);
    });
    expect(results[0]).toEqual({ ok: false, error: '请求超时' });
    expect(mocks.timetable.connect).not.toHaveBeenCalled();
    expect(mocks.jluPlatforms.syncLearning).toHaveBeenCalledOnce();
  });
  it('stops after an interrupted manual login rather than opening more platform windows', async () => {
    const { api, mocks } = fixture();
    mocks.timetable.syncNow.mockResolvedValueOnce({ ok: false, reason: 'auth' });
    mocks.timetable.connect.mockResolvedValueOnce({ ok: false, error: '未完成登录' });
    await connectPlatforms(api, jluSetupOrder, () => {});
    expect(mocks.jluPlatforms.syncNotices).not.toHaveBeenCalled();
    expect(mocks.jluPlatforms.syncLearning).not.toHaveBeenCalled();
  });
  it('does not start another platform after leaving the setup page', async () => {
    const { api, mocks } = fixture();
    let active = true;
    await connectPlatforms(
      api,
      jluSetupOrder,
      (_id, result) => {
        if (result) active = false;
      },
      () => active,
    );
    expect(mocks.timetable.syncNow).toHaveBeenCalledOnce();
    expect(mocks.jluPlatforms.syncNotices).not.toHaveBeenCalled();
  });
});
