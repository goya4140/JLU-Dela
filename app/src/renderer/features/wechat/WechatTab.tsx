import { useCallback, useEffect, useRef, useState } from 'react';
import { MonitorPlay, Square } from 'lucide-react';
import type { WechatMirrorSupport } from '../../../shared/wechat';
import { Button } from '../../components/ui/button';
import { errorText } from '../../workspace/store';

export function WechatTab() {
  const api = window.dela?.wechatMirror;
  const [support, setSupport] = useState<WechatMirrorSupport | null>(null);
  const [phase, setPhase] = useState<'idle' | 'choosing' | 'live'>('idle');
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setPhase('idle');
    void api?.stop().catch(console.error);
  }, [api]);
  useEffect(() => {
    let active = true;
    if (api)
      void api
        .getSupport()
        .then((value) => {
          if (active) setSupport(value);
        })
        .catch((cause) => {
          if (active) setError(errorText(cause));
        });
    const unsubscribe = api?.onStop(stop);
    return () => {
      active = false;
      unsubscribe?.();
      stop();
    };
  }, [api, stop]);

  async function chooseWindow() {
    if (!api) return;
    const current = ++generation.current;
    setPhase('choosing');
    setError(null);
    try {
      await api.prepare();
      if (current !== generation.current) {
        await api.stop();
        return;
      }
      const selected = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window', frameRate: 15 },
        audio: false,
      });
      if (current !== generation.current) {
        selected.getTracks().forEach((track) => track.stop());
        await api.stop();
        return;
      }
      const track = selected.getVideoTracks()[0];
      if (!track || track.getSettings().displaySurface !== 'window') {
        selected.getTracks().forEach((item) => item.stop());
        throw new Error('请选择微信的单个窗口，不要选择整个屏幕。');
      }
      stream.current = selected;
      track.addEventListener('ended', stop, { once: true });
      if (video.current) {
        video.current.srcObject = selected;
        await video.current.play();
      }
      if (current !== generation.current) return;
      setPhase('live');
    } catch (cause) {
      if (current !== generation.current) return;
      stop();
      if (cause instanceof DOMException && cause.name === 'NotAllowedError')
        setError('未开始共享。请在系统选择器中允许共享微信窗口。');
      else setError(errorText(cause));
    }
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="微信窗口镜像">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">微信窗口</h1>
          <p role="status" className="mt-1 text-xs text-ink-3">
            {phase === 'live'
              ? '正在镜像 · 仅在本机显示'
              : phase === 'choosing'
                ? '请在系统选择器中选择微信窗口'
                : '窗口镜像实验'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!api}
            onClick={() => void api!.openWechat().catch((cause) => setError(errorText(cause)))}
          >
            在微信中操作
          </Button>
          {phase === 'live' ? (
            <Button variant="outline" onClick={stop}>
              <Square />
              停止镜像
            </Button>
          ) : (
            <Button
              disabled={!support?.supported || phase === 'choosing'}
              onClick={() => void chooseWindow()}
            >
              <MonitorPlay />
              选择微信窗口
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="mx-5 mb-3 break-words text-13 text-red">
          {error}
        </p>
      )}
      <div className="relative mx-5 mb-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-card bg-page">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="所选微信窗口的实时画面"
          className={phase === 'live' ? 'size-full object-contain' : 'hidden'}
        />
        {phase !== 'live' && (
          <div className="max-w-md space-y-3 p-6 text-center">
            <MonitorPlay className="mx-auto size-10 text-ink-3" />
            <h2 className="text-base font-medium">把微信原窗口显示在这里</h2>
            <p className="text-13 leading-relaxed text-ink-3">
              {support && !support.supported
                ? support.reason
                : '先打开微信，再选择要显示的微信窗口。登录、回复和文件操作仍在原微信完成。'}
            </p>
          </div>
        )}
      </div>
      <p className="px-5 pb-4 text-xs leading-relaxed text-ink-3">
        镜像会跟随原窗口切换聊天。画面不保存、不上传；切换标签、离开工作台或隐藏 Dela 会停止镜像。
      </p>
    </section>
  );
}
