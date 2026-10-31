import type { MailState } from '../../../shared/mail';
import { describe, it, expect, vi } from 'vitest';
import { connectPlatform, readPlatformProgress, type SetupApi } from './platform-setup';
const date = '2026-10-31T02:00:00.000Z';
function fixture() {
  const api = {
    jluPlatforms: {
      getNotices: vi.fn(async () => ({ syncedAt: date })),
      getLearning: vi.fn(async () => null),
      syncNotices: vi.fn<SetupApi['jluPlatforms']['syncNotices']>(async () => ({
        ok: true,
        data: { channel: '179577', page: 1, totalPages: null, items: [], syncedAt: date },
      })),
      syncLearning: vi.fn(async () => ({ ok: true, data: { syncedAt: date } })),
    },
    chaoxing: {
      courses: vi.fn(async () => null),
      syncCourses: vi.fn(async () => ({ ok: true, data: { syncedAt: date } })),
    },
    mail: {
      getState: vi.fn(async (): Promise<MailState> => ({
        account: null,
        sync: {
          phase: 'idle',
          folderPath: null,
          processed: 0,
          total: null,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      })),
    },
  };
  return { api: api as unknown as SetupApi, mocks: api };
}
describe('campus setup', () => {
  it('reads historical cache without authentication or network sync and preserves other cache states on a failed local read', async () => {
    const { api, mocks } = fixture();
    mocks.jluPlatforms.getLearning.mockRejectedValueOnce(new Error('disk failure'));
    const state = await readPlatformProgress(api);
    expect(state.notices).toEqual({ phase: 'cached', syncedAt: date });
    expect(state.learning.phase).toBe('failed');
    expect(state.chaoxing.phase).toBe('empty');
    expect(state.mail.phase).toBe('empty');
    expect(mocks.jluPlatforms.syncNotices).not.toHaveBeenCalled();
  });
  it('recognizes a configured mailbox before its first synchronization completes', async () => {
    const { api, mocks } = fixture();
    mocks.mail.getState.mockResolvedValueOnce({
      account: { address: 'student@mails.jlu.edu.cn', lastSyncedAt: null },
      sync: {
        phase: 'connecting',
        folderPath: null,
        processed: 0,
        total: null,
        error: null,
        startedAt: null,
        finishedAt: null,
      },
    });
    expect((await readPlatformProgress(api)).mail).toEqual({ phase: 'cached', syncedAt: null });
    expect(await connectPlatform(api, 'mail')).toMatchObject({ ok: false });
    expect(mocks.chaoxing.syncCourses).not.toHaveBeenCalled();
  });
  it('only connects the requested platform and leaves every other platform untouched', async () => {
    const { api, mocks } = fixture();
    expect(await connectPlatform(api, 'notices')).toEqual({ ok: true, syncedAt: date });
    expect(mocks.jluPlatforms.syncNotices).toHaveBeenCalledOnce();
    expect(mocks.jluPlatforms.syncLearning).not.toHaveBeenCalled();
    expect(mocks.chaoxing.syncCourses).not.toHaveBeenCalled();
    expect(await connectPlatform(api, 'chaoxing')).toEqual({ ok: true, syncedAt: date });
    expect(mocks.chaoxing.syncCourses).toHaveBeenCalledOnce();
  });
  it('keeps a platform authentication failure independent of a later connection', async () => {
    const { api, mocks } = fixture();
    mocks.jluPlatforms.syncNotices.mockResolvedValueOnce({
      ok: false,
      reason: 'auth',
      error: '学校认证未完成',
    });
    expect(await connectPlatform(api, 'notices')).toMatchObject({ ok: false, reason: 'auth' });
    expect(await connectPlatform(api, 'learning')).toEqual({ ok: true, syncedAt: date });
    expect(mocks.chaoxing.syncCourses).not.toHaveBeenCalled();
  });
});
