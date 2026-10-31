import type { DelaApi } from '../../../shared/api';
import type { JluServiceId } from '../../../shared/jlu';

export type SetupApi = Pick<DelaApi, 'timetable' | 'jluPlatforms' | 'chaoxing' | 'mail'>;
export type SetupResult =
  | { ok: true; syncedAt: string | null }
  | { ok: false; error: string; reason?: 'auth'; stopBatch?: boolean };
export type PlatformProgress = {
  phase: 'empty' | 'cached' | 'busy' | 'verified' | 'failed';
  syncedAt: string | null;
  error?: string;
  reason?: 'auth';
};
export type PlatformProgressMap = Record<JluServiceId, PlatformProgress>;
export const jluSetupOrder: JluServiceId[] = ['academic', 'notices', 'learning'];
export const emptyPlatformProgress = (): PlatformProgressMap => ({
  academic: { phase: 'empty', syncedAt: null },
  notices: { phase: 'empty', syncedAt: null },
  learning: { phase: 'empty', syncedAt: null },
  chaoxing: { phase: 'empty', syncedAt: null },
  mail: { phase: 'empty', syncedAt: null },
});

export async function readPlatformProgress(api: SetupApi): Promise<PlatformProgressMap> {
  const ids: JluServiceId[] = [...jluSetupOrder, 'chaoxing'];
  const [academic, notices, learning, chaoxing, mail] = await Promise.allSettled([
    api.timetable.getState().then((row) => row.lastSyncedAt),
    api.jluPlatforms.getNotices('179577', 1).then((row) => row?.syncedAt ?? null),
    api.jluPlatforms.getLearning().then((row) => row?.syncedAt ?? null),
    api.chaoxing.courses().then((row) => row?.syncedAt ?? null),
    api.mail.getState(),
  ]);
  const results = [academic, notices, learning, chaoxing];
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

export async function connectPlatform(api: SetupApi, id: JluServiceId): Promise<SetupResult> {
  if (id === 'academic') {
    let result = await api.timetable.syncNow();
    if (!result.ok && result.reason === 'auth') {
      const login = await api.timetable.connect();
      if (!login.ok)
        return {
          ok: false,
          error: login.error ?? '未完成学校认证',
          reason: login.reason,
          stopBatch: true,
        };
      result = await api.timetable.syncNow();
    }
    if (!result.ok)
      return { ok: false, error: result.error ?? '课表同步失败', reason: result.reason };
    return { ok: true, syncedAt: (await api.timetable.getState()).lastSyncedAt };
  }
  if (id === 'mail') {
    // 邮箱用账号密码在「吉大邮箱」页连接，不走校园 SSO 批量流程。
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

export async function connectPlatforms(
  api: SetupApi,
  ids: JluServiceId[],
  report: (id: JluServiceId, result: SetupResult | null) => void,
  shouldContinue: () => boolean = () => true,
) {
  for (const id of ids) {
    if (!shouldContinue()) break;
    report(id, null);
    let result: SetupResult;
    try {
      result = await connectPlatform(api, id);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : '平台连接失败，请重试',
      };
    }
    report(id, result);
    if (!result.ok && (result.reason === 'auth' || result.stopBatch)) break;
  }
}
