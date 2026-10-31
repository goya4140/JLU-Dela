import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { jluServices } from '../../../shared/jlu';
import { Button } from '../../components/ui/button';
import { useNavigationStore } from '../../navigation/view';
import { AcademicConnection } from '../timetable/AcademicConnection';
import { platformFailureHelp } from './platform-failure-help';
import {
  connectPlatform,
  emptyPlatformProgress,
  readPlatformProgress,
  type SetupPlatformId,
  type SetupResult,
} from './platform-setup';

const services = jluServices.filter((service) => service.id !== 'academic');

export function PlatformConnections({
  onBusyChange,
  onConnectMail,
}: {
  onBusyChange?: (busy: boolean) => void;
  onConnectMail?: () => void;
}) {
  const [progress, setProgress] = useState(emptyPlatformProgress);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [academicBusy, setAcademicBusy] = useState(false);
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
  async function connect(id: SetupPlatformId) {
    if (!window.dela || running.current) return;
    running.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setProgress((previous) => ({
      ...previous,
      [id]: { ...previous[id], phase: 'busy', error: undefined, reason: undefined },
    }));
    try {
      let result: SetupResult;
      try {
        result = await connectPlatform(window.dela, id);
      } catch (error) {
        result = {
          ok: false,
          error: error instanceof Error ? error.message : '平台连接失败，请重试',
        };
      }
      if (active.current)
        setProgress((previous) => ({
          ...previous,
          [id]: result.ok
            ? { phase: 'verified', syncedAt: result.syncedAt }
            : { ...previous[id], phase: 'failed', error: result.error, reason: result.reason },
        }));
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
          各平台分别配置，可以跳过任意一项。教务可能需要微信认证；学生邮箱只需邮箱地址与邮箱密码，不依赖教务连接。
        </p>
      </div>
      <AcademicConnection
        onBusyChange={(value) => {
          setAcademicBusy(value);
          onBusyChange?.(value);
        }}
        disabled={busy}
      />
      {loading && (
        <p role="status" className="text-13 text-ink-3">
          正在读取本机同步记录…
        </p>
      )}
      <div className="grid gap-4">
        {services.map((service) => {
          const status = progress[service.id];
          const help = status.phase === 'failed' ? platformFailureHelp(status) : null;
          const label =
            service.id === 'mail'
              ? status.phase === 'cached'
                ? '已连接，可收发邮件'
                : '尚未连接'
              : status.phase === 'busy'
                ? '正在连接，可能需要学校验证…'
                : status.phase === 'verified'
                  ? '本次连接成功'
                  : status.phase === 'failed'
                    ? help?.title
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
                  disabled={loading || busy || academicBusy || !window.dela}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    service.id === 'mail'
                      ? onConnectMail
                        ? onConnectMail()
                        : useNavigationStore.getState().navigate('mail')
                      : void connect(service.id)
                  }
                >
                  {status.phase === 'busy' && <LoaderCircle className="size-3.5 animate-spin" />}
                  {service.id === 'mail'
                    ? '打开邮箱'
                    : service.id === 'chaoxing'
                      ? '连接学习通'
                      : status.phase === 'failed'
                        ? '重试'
                        : '连接'}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-ink-3">
                {service.id === 'mail'
                  ? '邮箱地址与邮箱密码，无需先完成教务认证。'
                  : service.id === 'chaoxing'
                    ? '使用学习通账号独立登录。'
                    : '单独连接；已有校园会话可复用，学校仍可能要求再次验证。'}
              </p>
              {status.syncedAt && (
                <p className="text-xs text-ink-3">
                  最近同步：{new Date(status.syncedAt).toLocaleString()}
                </p>
              )}
              {help && (
                <div className="grid gap-3">
                  <ol
                    aria-label="解决建议"
                    className="grid list-decimal gap-1.5 pl-4 text-13 leading-relaxed text-ink-2"
                  >
                    {help.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {help.checkWebsite && (
                    <div>
                      <Button asChild size="sm" variant="outline">
                        <a href={service.url} target="_blank" rel="noreferrer">
                          在浏览器检查平台
                        </a>
                      </Button>
                    </div>
                  )}
                  {status.syncedAt && (
                    <p className="text-xs text-ink-3">旧数据仍可阅读；本次未更新。</p>
                  )}
                  <p role="alert" className="break-words text-13 text-red">
                    错误详情：{status.error}
                  </p>
                </div>
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
