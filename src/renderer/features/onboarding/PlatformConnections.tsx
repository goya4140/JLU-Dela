import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { jluServices, type JluServiceId } from '../../../shared/jlu';
import { Button } from '../../components/ui/button';
import {
  connectPlatforms,
  emptyPlatformProgress,
  jluSetupOrder,
  readPlatformProgress,
} from './platform-setup';

export function PlatformConnections({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const [progress, setProgress] = useState(emptyPlatformProgress);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    active.current = true;
    const api = window.dela;
    if (api)
      void readPlatformProgress(api)
        .then((value) => {
          if (active.current) setProgress(value);
        })
        .finally(() => {
          if (active.current) setLoading(false);
        });
    else setLoading(false);
    return () => {
      active.current = false;
    };
  }, []);
  async function connect(ids: JluServiceId[]) {
    if (!window.dela || running.current) return;
    running.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await connectPlatforms(
        window.dela,
        ids,
        (id, result) => {
          if (!active.current) return;
          setProgress((previous) => ({
            ...previous,
            [id]:
              result === null
                ? { ...previous[id], phase: 'busy', error: undefined, reason: undefined }
                : result.ok
                  ? { phase: 'verified', syncedAt: result.syncedAt }
                  : {
                      ...previous[id],
                      phase: 'failed',
                      error: result.error,
                      reason: result.reason,
                    },
          }));
        },
        () => active.current,
      );
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }
  return (
    <section aria-label="校园平台配置" className="grid gap-4">
      <div className="grid gap-2">
        <h3 className="text-base font-semibold text-ink">连接校园平台</h3>
        <p className="text-13 leading-relaxed text-ink-3">
          吉大平台先尝试复用校园会话和统一认证，仍需验证时再显示学校页面。学习通需要独立连接。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={loading || busy || !window.dela}
          size="sm"
          onClick={() => void connect(jluSetupOrder)}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}依次连接吉大平台
        </Button>
      </div>
      {loading && (
        <p role="status" className="text-13 text-ink-3">
          正在读取本机同步记录…
        </p>
      )}
      <div className="grid gap-4">
        {jluServices.map((service) => {
          const status = progress[service.id];
          const label =
            status.phase === 'busy'
              ? '正在连接，可能需要学校验证…'
              : status.phase === 'verified'
                ? '本次连接成功'
                : status.phase === 'failed'
                  ? status.reason === 'auth'
                    ? '需要完成学校认证'
                    : '连接未完成'
                  : status.phase === 'cached'
                    ? '本机已有数据'
                    : '尚未同步';
          return (
            <div
              key={service.id}
              className="grid gap-2 rounded-card bg-field p-3"
              data-platform={service.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-13 font-medium text-ink">{service.name}</h4>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-3" role="status">
                    {status.phase === 'verified' && <Check className="size-3.5" />}
                    {label}
                  </p>
                </div>
                <Button
                  disabled={loading || busy || !window.dela}
                  size="sm"
                  variant="outline"
                  onClick={() => void connect([service.id])}
                >
                  {service.id === 'chaoxing'
                    ? '连接学习通'
                    : status.phase === 'failed'
                      ? '重试'
                      : '连接'}
                </Button>
              </div>
              {status.syncedAt && (
                <p className="text-xs text-ink-3">
                  最近同步：{new Date(status.syncedAt).toLocaleString()}
                </p>
              )}
              {status.error && (
                <p role="alert" className="break-words text-13 text-red">
                  {status.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-ink-3">
        同步记录不代表会话仍有效。网络或接口失败会保留本地缓存，不会自动当作登录失效。
      </p>
      {!window.dela && <p className="text-13 text-ink-3">请在桌面应用中连接学校平台。</p>}
    </section>
  );
}
