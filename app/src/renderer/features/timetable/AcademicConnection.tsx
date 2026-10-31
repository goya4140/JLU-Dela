import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { TimetableState } from '../../../shared/timetable';
import { jluServices } from '../../../shared/jlu';
import { Button } from '../../components/ui/button';
import { platformFailureHelp } from '../onboarding/platform-failure-help';

type Attempt = {
  phase: 'idle' | 'authenticating' | 'syncing' | 'updated' | 'failed';
  authenticated?: boolean;
  error?: string;
  reason?: 'auth';
};

export function AcademicConnection({
  semester,
  disabled = false,
  onBusyChange,
  onSuccess,
}: {
  semester?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSuccess?: () => void;
}) {
  const [cache, setCache] = useState<TimetableState | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<Attempt>({ phase: 'idle' });
  const active = useRef(false);
  const running = useRef(false);
  const busy = attempt.phase === 'authenticating' || attempt.phase === 'syncing';
  useEffect(() => {
    active.current = true;
    let current = true;
    const api = window.dela;
    if (api)
      void api.timetable
        .getState(semester)
        .then((value) => {
          if (current) setCache(value);
        })
        .catch(() => {
          if (current)
            setCacheError('暂时无法读取本机课表记录，可重试同步；这不代表学校登录失效。');
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    else setLoading(false);
    return () => {
      current = false;
      active.current = false;
    };
  }, [semester]);

  async function connect(action: 'authenticate' | 'sync') {
    const api = window.dela;
    if (!api || running.current) return;
    running.current = true;
    onBusyChange?.(true);
    let authenticated = false;
    let updated = false;
    setAttempt({ phase: action === 'authenticate' ? 'authenticating' : 'syncing' });
    try {
      if (action === 'authenticate') {
        const login = await api.timetable.connect();
        if (!active.current) return;
        if (!login.ok) {
          setAttempt({
            phase: 'failed',
            error: login.error ?? '教务认证未完成',
            reason: login.reason,
          });
          return;
        }
        authenticated = true;
        setAttempt({ phase: 'syncing', authenticated });
      }
      const result = await api.timetable.syncNow(semester);
      if (!active.current) return;
      updated = result.ok;
      setAttempt(
        result.ok
          ? { phase: 'updated' }
          : {
              phase: 'failed',
              authenticated,
              error: result.error ?? '课表同步未完成',
              reason: result.reason,
            },
      );
    } catch (error) {
      if (active.current)
        setAttempt({
          phase: 'failed',
          authenticated,
          error: error instanceof Error ? error.message : '教务操作未完成，请重试',
        });
    } finally {
      try {
        const value = await api.timetable.getState(semester);
        if (active.current) {
          setCache(value);
          setCacheError(null);
        }
      } catch {
        if (active.current)
          setCacheError('暂时无法读取本机课表记录，可重试同步；这不代表学校登录失效。');
      }
      running.current = false;
      if (active.current) {
        onBusyChange?.(false);
        if (updated) onSuccess?.();
      }
    }
  }

  const help = attempt.phase === 'failed' ? platformFailureHelp(attempt) : null;
  const blocked = disabled || loading || busy || !window.dela;
  return (
    <section
      aria-label="教务课表配置"
      data-platform="academic"
      className="grid gap-3 rounded-card bg-field p-3"
    >
      <div className="grid gap-1">
        <h4 className="text-13 font-medium text-ink">吉林大学教务系统 · 单独配置</h4>
        <p className="text-xs leading-relaxed text-ink-3">
          在 Dela
          的学校窗口完成教务登录，可能需要微信认证或验证码。可关闭窗口取消，之后继续配置邮箱等其他平台。
        </p>
      </div>
      <div className="grid gap-1 text-xs text-ink-3" aria-label="本机课表状态">
        <p>
          {loading
            ? '正在读取本机课表…'
            : cache?.lastSyncedAt
              ? '已有课表可查看'
              : cacheError
                ? '本机课表状态暂时无法读取'
                : '尚无本机课表'}
        </p>
        {cache?.lastSyncedAt && (
          <p>上次课表更新：{new Date(cache.lastSyncedAt).toLocaleString()}</p>
        )}
        {cacheError && <p>{cacheError}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => void connect('authenticate')}
        >
          打开教务认证
        </Button>
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => void connect('sync')}>
          同步课表
        </Button>
      </div>
      <p
        className="flex items-center gap-1 text-13 text-ink-2"
        role="status"
        aria-label="本次教务操作"
      >
        {busy && <LoaderCircle className="size-3.5 shrink-0 animate-spin" />}
        {attempt.phase === 'authenticating'
          ? '正在等待学校认证，请在教务窗口完成验证…'
          : attempt.phase === 'syncing'
            ? attempt.authenticated
              ? '学校认证已通过，正在同步课表…'
              : '正在同步课表…'
            : attempt.phase === 'updated'
              ? '本次课表已更新'
              : attempt.phase === 'failed'
                ? attempt.authenticated
                  ? '学校认证已通过，但本次课表未更新'
                  : '本次教务操作未完成'
                : '尚未检查本次连接；已有课表不代表登录仍有效。'}
      </p>
      {help && (
        <div className="grid gap-2">
          <p className="text-13 font-medium text-ink">{help.title}</p>
          <ol
            aria-label="教务处理建议"
            className="grid list-decimal gap-1.5 pl-4 text-13 leading-relaxed text-ink-2"
          >
            {(attempt.reason === 'auth'
              ? [
                  '点击「打开教务认证」，在 Dela 的学校窗口完成登录、微信认证或验证码。',
                  '认证后会再次同步课表；外部浏览器的登录不会直接更新 Dela 会话。',
                ]
              : help.steps
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {help.checkWebsite && (
            <div>
              <Button asChild size="sm" variant="outline">
                <a href={jluServices[0].url} target="_blank" rel="noreferrer">
                  在浏览器检查教务
                </a>
              </Button>
            </div>
          )}
          {cache?.lastSyncedAt && (
            <p className="text-xs text-ink-3">
              已有课表仍可查看；请以上次更新时间判断数据是否最新。
            </p>
          )}
          <p role="alert" className="break-words text-13 text-red">
            错误详情：{attempt.error}
          </p>
        </div>
      )}
    </section>
  );
}
