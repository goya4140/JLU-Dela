import { useEffect, useState } from 'react';
import type { WechatApi, WechatDatabaseState } from '../../../shared/wechat';
import { Button } from '../../components/ui/button';

const labels = {
  ready: '已读取 JLU-Dela 群的本机消息',
  'needs-access': '当前缺少数据库访问材料，未进行本次同步。',
  'group-not-found': '未找到名称完全一致的 JLU-Dela 群，未读取其他群消息。',
  ambiguous: '有多个同名 JLU-Dela 群，已停止读取，需要先确定真实群 ID。',
  error: '数据库读取失败，已停止自动刷新；已有缓存保留。',
  'missing-runtime': '此预览版尚未准备数据库读取组件。',
};
const media: Record<string, string> = {
  image: '[图片]',
  sticker: '[表情]',
  video: '[视频]',
  voice: '[语音]',
  file: '[文件]',
};

export function WechatDatabaseMessages({ api }: { api: WechatApi }) {
  const [state, setState] = useState<WechatDatabaseState | null>(null);
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!watching) return;
    let active = true;
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      setBusy(true);
      setFailed(false);
      try {
        const value = await api.syncDatabase();
        if (active) {
          setState(value);
          if (value.phase !== 'ready') setWatching(false);
        }
      } catch {
        if (active) {
          setFailed(true);
          setWatching(false);
        }
      } finally {
        pending = false;
        if (active) setBusy(false);
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, watching]);
  return (
    <section aria-label="JLU-Dela 数据库群消息" className="w-full max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">群消息 · 只读数据库</h2>
        <Button variant="outline" disabled={busy} onClick={() => setWatching(!watching)}>
          {busy ? '正在读取…' : watching ? '停止同步' : '检查并同步群消息'}
        </Button>
      </div>
      <p role="status" className="text-13 leading-relaxed text-ink-3">
        {failed
          ? '读取组件未能返回结果，已停止同步。'
          : state
            ? labels[state.phase]
            : '只读取原微信已同步到本机的 JLU-Dela 群消息。'}
      </p>
      {state?.chatId && <p className="break-all text-xs text-ink-3">真实群 ID：{state.chatId}</p>}
      {state?.lastSyncAt && (
        <p className="text-xs text-ink-3">
          上次成功读取：{new Date(state.lastSyncAt).toLocaleString()}
          {!watching && ' · 已停止自动刷新'}
        </p>
      )}
      <div aria-label="数据库微信消息记录" className="space-y-4">
        {state?.messages.map((message) => (
          <article key={message.id} className="rounded-control bg-page p-4">
            <p className="mb-2 text-xs text-ink-3">
              {message.sender || '发送者未提供'} ·{' '}
              {message.sentAt ? new Date(message.sentAt).toLocaleString() : '时间未提供'}
            </p>
            <p className="whitespace-pre-wrap break-words text-13 leading-relaxed [overflow-wrap:anywhere]">
              {message.kind === 'text' ? message.text : (media[message.kind] ?? '[其他消息]')}
            </p>
          </article>
        ))}
        {state?.phase === 'ready' && !state.messages.length && (
          <p className="text-13 text-ink-3">群已匹配，本机消息库中暂未读到消息。</p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-3">
        每 5 秒读取本机最新最多 200 条，工作台最多保留 500
        条去重缓存。离开此群页会停止刷新。图片和文件当前显示类型提示；不会使用通知预览替代聊天记录。
      </p>
    </section>
  );
}
