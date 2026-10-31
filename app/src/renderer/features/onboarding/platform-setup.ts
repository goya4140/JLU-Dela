import type { DelaApi } from '../../../shared/api';
import type { JluServiceId } from '../../../shared/jlu';

export type SetupApi = Pick<DelaApi, 'jluPlatforms' | 'chaoxing' | 'mail'>;
export type SetupPlatformId = Exclude<JluServiceId, 'academic'>;
export type SetupResult =
  { ok: true; syncedAt: string | null } | { ok: false; error: string; reason?: 'auth' };
export type PlatformProgress = {
  phase: 'empty' | 'cached' | 'busy' | 'verified' | 'failed';
  syncedAt: string | null;
  error?: string;
  reason?: 'auth';
};
export type PlatformProgressMap = Record<SetupPlatformId, PlatformProgress>;
export const emptyPlatformProgress = (): PlatformProgressMap => ({
  notices: { phase: 'empty', syncedAt: null },
  learning: { phase: 'empty', syncedAt: null },
  chaoxing: { phase: 'empty', syncedAt: null },
  mail: { phase: 'empty', syncedAt: null },
});

export async function readPlatformProgress(api: SetupApi): Promise<PlatformProgressMap> {
  const ids: SetupPlatformId[] = ['notices', 'learning', 'chaoxing'];
  const [notices, learning, chaoxing, mail] = await Promise.allSettled([
    api.jluPlatforms.getNotices('179577', 1).then((row) => row?.syncedAt ?? null),
    api.jluPlatforms.getLearning().then((row) => row?.syncedAt ?? null),
    api.chaoxing.courses().then((row) => row?.syncedAt ?? null),
    api.mail.getState(),
  ]);
  const results = [notices, learning, chaoxing];
  const progress = emptyPlatformProgress();
  for (const [index, result] of results.entries()) {
    const id = ids[index]!;
    progress[id] =
      result.status === 'fulfilled'
        ? { phase: result.value ? 'cached' : 'empty', syncedAt: result.value }
        : { phase: 'failed', syncedAt: null, error: '无法读取本机同步记录，请重试' };
  }
  progress.mail =
    mail.status === 'rejected'
      ? { phase: 'failed', syncedAt: null, error: '无法读取邮箱连接记录，请重试' }
      : mail.value.account
        ? { phase: 'cached', syncedAt: mail.value.account.lastSyncedAt }
        : { phase: 'empty', syncedAt: null };
  return progress;
}

export async function connectPlatform(api: SetupApi, id: SetupPlatformId): Promise<SetupResult> {
  if (id === 'mail') {
    return { ok: false, error: '请在「吉大邮箱」页填写邮箱地址与密码完成连接' };
  }
  const result =
    id === 'notices'
      ? await api.jluPlatforms.syncNotices('179577', 1)
      : id === 'learning'
        ? await api.jluPlatforms.syncLearning()
        : await api.chaoxing.syncCourses();
  return result.ok ? { ok: true, syncedAt: result.data.syncedAt } : result;
}
