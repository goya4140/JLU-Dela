import { useEffect, useState } from 'react';
import { parse, slideToSvgFile, type Presentation } from '@web-ppt/core';
import { ChevronLeft, ChevronRight, ExternalLink, LoaderCircle } from 'lucide-react';
import type { ResourceRef } from '../../../shared/resources';
import { Button } from '../../components/ui/button';
import { errorText } from '../../workspace/store';
import { showToast } from '../../app/toasts';

export function PptPreview({
  url,
  title,
  officeRef,
}: {
  url: string;
  title: string;
  officeRef?: ResourceRef;
}) {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [page, setPage] = useState(0);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState('fit');
  useEffect(() => {
    let active = true;
    let parsed: Presentation | undefined;
    const controller = new AbortController();
    setPresentation(null);
    setPage(0);
    setError('');
    void (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`无法读取演示文稿（${response.status}）`);
      parsed = await parse(await response.arrayBuffer());
      if (!active) {
        parsed.dispose?.();
        return;
      }
      if (!parsed.slides.length) throw new Error('演示文稿中没有可读取的幻灯片');
      setPresentation(parsed);
    })().catch((cause) => {
      if (active) setError(errorText(cause));
    });
    return () => {
      active = false;
      controller.abort();
      parsed?.dispose?.();
    };
  }, [url, attempt]);
  useEffect(() => {
    setImage('');
    if (!presentation) return;
    let active = true;
    let blob: string | undefined;
    void slideToSvgFile(presentation, presentation.slides[page]!)
      .then((svg) => {
        if (!active) return;
        if (
          /<(?:image|use|feImage)\b[^>]*href=["'](?:blob:|https?:\/\/)|url\(["']?(?:blob:|https?:\/\/)/i.test(
            svg,
          )
        )
          throw new Error('部分图片无法在本机解析，请用原应用核对');
        blob = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setImage(blob);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [presentation, page]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
        <Button
          size="sm"
          variant="ghost"
          aria-label="上一张幻灯片"
          disabled={!presentation || page === 0}
          onClick={() => {
            setError('');
            setPage(page - 1);
          }}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {presentation ? (
          <label className="flex items-center gap-1 text-xs tabular-nums text-ink-3">
            <input
              aria-label="幻灯片页码"
              type="number"
              min={1}
              max={presentation.slides.length}
              value={page + 1}
              className="w-14 rounded-control bg-field px-1 py-1 text-center text-ink"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= presentation.slides.length) {
                  setError('');
                  setPage(value - 1);
                }
              }}
            />{' '}
            / {presentation.slides.length}
          </label>
        ) : (
          <span className="text-xs text-ink-3">PPT 阅读</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-label="下一张幻灯片"
          disabled={!presentation || page + 1 >= presentation.slides.length}
          onClick={() => {
            setError('');
            setPage(page + 1);
          }}
        >
          <ChevronRight className="size-4" />
        </Button>
        <select
          aria-label="幻灯片缩放"
          className="rounded-control bg-field px-2 py-1 text-xs text-ink"
          value={zoom}
          onChange={(event) => setZoom(event.target.value)}
        >
          <option value="fit">适应窗口</option>
          <option value="1">100%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
        </select>
        <span className="order-last w-full text-xs text-ink-3">
          本机静态预览 · 复杂版式可用原应用核对
        </span>
        {officeRef && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void window.dela?.workspace
                .openResourceFile(officeRef)
                .catch((cause) =>
                  showToast({ variant: 'error', title: '打开失败', description: errorText(cause) }),
                )
            }
          >
            <ExternalLink className="size-4" />
            在外部打开
          </Button>
        )}
      </div>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p role="alert" className="max-w-lg break-words text-13 text-red">
            无法预览：{error}。可以在外部打开原文件。
          </p>
          <Button variant="outline" size="sm" onClick={() => setAttempt(attempt + 1)}>
            重试
          </Button>
        </div>
      ) : image ? (
        <div className="min-h-0 flex-1 overflow-auto bg-surface-2 p-3">
          <img
            alt={`${title} · 第 ${page + 1} 张幻灯片`}
            src={image}
            onError={() => setError('幻灯片图像未能加载，请用原应用打开')}
            className={
              zoom === 'fit' ? 'mx-auto h-full w-full object-contain' : 'mx-auto max-w-none'
            }
            style={zoom === 'fit' ? undefined : { width: presentation!.width * Number(zoom) }}
          />
        </div>
      ) : (
        <div
          role="status"
          className="flex flex-1 items-center justify-center gap-2 p-6 text-13 text-ink-3"
        >
          <LoaderCircle className="size-4 animate-spin" />
          正在读取幻灯片…
        </div>
      )}
    </div>
  );
}
