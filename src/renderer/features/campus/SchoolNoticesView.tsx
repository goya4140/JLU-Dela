import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { JluNoticeDetail, JluNoticePage } from '../../../shared/jlu-platforms';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { DesktopOnlyNotice } from '../../components/ui/desktop-only-notice';
import { errorText } from '../../workspace/store';

export function SchoolNoticesView() {
  if (!window.dela)
    return <DesktopOnlyNotice title="学校通知" description="请在桌面应用中同步和保存学校通知。" />;
  return <DesktopNotices />;
}
function DesktopNotices() {
  const api = window.dela!.jluPlatforms;
  const [data, setData] = useState<JluNoticePage | null>(null);
  const [detail, setDetail] = useState<JluNoticeDetail | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    void api
      .getNotices('179577', 1)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [api]);
  async function sync(next = page) {
    const id = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.syncNotices('179577', next);
      if (id !== request.current) return;
      if (result.ok) {
        setData(result.data);
        setPage(next);
        setDetail(null);
      } else setError(result.error);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  async function read(id: string, channel: string) {
    const revision = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const cached = await api.getNotice(id, channel);
      if (revision !== request.current) return;
      setDetail(cached);
      const result = await api.readNotice(id, channel);
      if (revision !== request.current) return;
      if (result.ok) setDetail(result.data);
      else setError(result.error);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      if (revision === request.current) setBusy(false);
    }
  }
  const notices =
    data?.items.filter((item) => !query || `${item.title} ${item.department}`.includes(query)) ??
    [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-8 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink">学校通知</h1>
            <p className="mt-1 text-xs text-ink-3">
              电子校务 · 校内通知
              {data
                ? ` · 更新于 ${new Date(data.syncedAt).toLocaleString('zh-CN')}`
                : ' · 尚未同步'}
            </p>
          </div>
          <Button disabled={busy} size="sm" onClick={() => void sync()}>
            <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
            {busy ? '正在读取…' : '刷新通知'}
          </Button>
        </header>
        {error && (
          <p role="alert" className="rounded-control bg-field p-3 text-13 text-ink">
            {error}
          </p>
        )}
        {detail ? (
          <article className="grid min-w-0 gap-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDetail(null)}>
                <ArrowLeft className="size-4" />
                返回列表
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void api
                    .openNotice(detail.id, detail.channel)
                    .catch((reason) => setError(errorText(reason)))
                }
              >
                学校原文
              </Button>
            </div>
            <h2 className="break-words text-lg font-semibold text-ink">{detail.title}</h2>
            <p className="whitespace-pre-wrap text-xs text-ink-3">{detail.metadata}</p>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
              {detail.text}
            </div>
            {detail.attachments.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">附件</h3>
                {detail.attachments.map((attachment, index) => (
                  <Button
                    className="h-auto justify-start whitespace-normal break-all text-left"
                    key={`${attachment.url}:${index}`}
                    variant="outline"
                    onClick={() =>
                      void api
                        .openAttachment(detail.id, detail.channel, index)
                        .catch((reason) => setError(errorText(reason)))
                    }
                  >
                    {attachment.name}
                  </Button>
                ))}
              </section>
            )}
            <p className="text-xs text-ink-3">
              正文缓存于 {new Date(detail.syncedAt).toLocaleString('zh-CN')}
            </p>
          </article>
        ) : (
          <>
            <Input
              aria-label="筛选本页通知"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选本页标题或发布单位"
            />
            {!data && (
              <p className="py-8 text-13 text-ink-3">
                点击「刷新通知」读取学校列表，已读取的通知会保存在本机。
              </p>
            )}
            {data && (
              <div className="grid gap-1">
                {notices.map((item) => (
                  <button
                    key={item.id}
                    className="grid min-w-0 gap-2 rounded-control p-3 text-left hover:bg-hover disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void read(item.id, item.channel)}
                  >
                    <span className="break-words text-sm text-ink">
                      {item.pinned && <span className="mr-2 text-xs text-ink-3">置顶</span>}
                      {item.title}
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                      <span>{item.department}</span>
                      <span>{item.published}</span>
                    </span>
                  </button>
                ))}
                {!notices.length && <p className="py-6 text-13 text-ink-3">本页没有匹配的通知。</p>}
              </div>
            )}
            {data && (
              <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
                <span>
                  第 {page}
                  {data.totalPages ? ` / ${data.totalPages}` : ''} 页 · 仅筛选当前页
                </span>
                <div className="flex gap-2">
                  <Button
                    aria-label="上一页通知"
                    size="icon-sm"
                    variant="outline"
                    disabled={busy || page === 1}
                    onClick={() => void sync(page - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    aria-label="下一页通知"
                    size="icon-sm"
                    variant="outline"
                    disabled={busy || (data.totalPages !== null && page >= data.totalPages)}
                    onClick={() => void sync(page + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}
