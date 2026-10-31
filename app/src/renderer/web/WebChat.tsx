import { useEffect, useState } from 'react';
import { ArrowUp, History, SquarePen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../components/ui/button';
import { chromeIconButton } from '../navigation/nav-styles';
import type { WorkspaceChat, LlmProviderView } from '../../shared/api';
import { webCall } from './api';
import { cn } from '../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
export function WebChat({
  draft: text,
  onDraft: setText,
  embedded = false,
}: {
  draft: string;
  onDraft: (text: string) => void;
  embedded?: boolean;
}) {
  const [chat, setChat] = useState<WorkspaceChat | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [models, setModels] = useState<LlmProviderView[]>([]);
  useEffect(() => {
    let active = true;
    void webCall<LlmProviderView[]>('model.list')
      .then((rows) => {
        if (active) setModels(rows);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    let active = true;
    void webCall<{ id: string; title: string }[]>('chat.list')
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!chat?.sessionId || !chat.running) return;
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const id = chat.sessionId;
    async function poll() {
      try {
        const value = await webCall<WorkspaceChat>('chat.open', [id]);
        if (active) {
          setChat(value);
          if (value.running) timer = setTimeout(() => void poll(), 1500);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '连接已中断');
      }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [chat?.sessionId, chat?.running]);
  async function open(id?: string) {
    setError('');
    try {
      const value = await webCall<WorkspaceChat>(id ? 'chat.open' : 'chat.create', id ? [id] : []);
      setChat(value);
      setHistory(await webCall('chat.list'));
      setModels(await webCall('model.list'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开对话');
    }
  }
  async function send() {
    if (!chat?.sessionId || !text.trim()) return;
    const value = text;
    setSending(true);
    setError('');
    try {
      await webCall('chat.ask', [chat.sessionId, value]);
      setText('');
      setChat(await webCall<WorkspaceChat>('chat.open', [chat.sessionId]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送失败');
    } finally {
      setSending(false);
    }
  }
  const conversation = !!chat?.messages.length;
  return (
    <section
      className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="AI 对话"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-3 py-2">
        <h1 className="sr-only">AI 对话</h1>
        <Select value={chat?.sessionId ?? ''} onValueChange={(id) => void open(id)}>
          <SelectTrigger aria-label="历史对话" className="max-w-48">
            <History className="size-3.5 text-ink-3" />
            <SelectValue placeholder="历史对话" />
          </SelectTrigger>
          <SelectContent>
            {history.length ? (
              history.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.title || '未命名对话'}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="empty" disabled>
                暂无历史对话
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <button
          aria-label="新建对话"
          title="新建对话"
          className={chromeIconButton}
          onClick={() => void open()}
        >
          <SquarePen className="size-4" />
        </button>
      </header>
      {error && (
        <p role="alert" className="mx-4 rounded-control bg-red-tint p-3 text-13 text-red">
          {error}
        </p>
      )}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto px-3',
          !conversation && 'justify-center pb-10',
        )}
      >
        {conversation ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-6">
            {chat.messages.map((message, index) => (
              <article
                key={index}
                className={cn(
                  'min-w-0 text-sm leading-relaxed',
                  message.role === 'user' && 'ml-auto max-w-full rounded-xl bg-field px-4 py-3',
                )}
              >
                <p className="mb-2 text-xs text-ink-3">{message.role === 'user' ? '你' : 'Dela'}</p>
                <div className="min-w-0 break-words [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-page [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <h2 className="mb-6 text-center text-3xl font-semibold tracking-tight @max-[400px]:text-2xl">
            {embedded ? '这节课有什么疑问？' : '现在想聊些什么？'}
          </h2>
        )}
        {!conversation && composer()}
      </div>
      {conversation && composer()}
    </section>
  );
  function composer() {
    return (
      <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-4">
        {!chat?.configured && (
          <p className="mb-3 text-center text-xs text-ink-3">请先在本机 Dela 设置中配置模型。</p>
        )}
        <div className="rounded-xl bg-field p-3 shadow-hairline">
          <textarea
            aria-label="发送给助手"
            disabled={!chat}
            className="min-h-24 w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={60000}
            placeholder="向 Dela 提问…"
          />
          <div className="mt-2 flex min-w-0 items-center justify-end gap-2">
            {chat && (
              <Select
                value={JSON.stringify([chat.providerId, chat.model])}
                onValueChange={(value) => {
                  const [provider, model] = JSON.parse(value) as [string, string];
                  void webCall('chat.model', [chat.sessionId, provider, model])
                    .then(() => webCall<WorkspaceChat>('chat.open', [chat.sessionId]))
                    .then(setChat)
                    .catch((cause) => setError(cause.message));
                }}
              >
                <SelectTrigger
                  aria-label="对话模型"
                  className="min-w-0 max-w-48 border-0 bg-transparent"
                >
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={JSON.stringify([chat.providerId, chat.model])} disabled>
                    {chat.model || '选择本机已配置的模型'}
                  </SelectItem>
                  {models
                    .filter((provider) => provider.enabled)
                    .flatMap((provider) =>
                      provider.models.map((model) => (
                        <SelectItem
                          key={provider.id + model}
                          value={JSON.stringify([provider.id, model])}
                        >
                          {provider.name} · {model}
                        </SelectItem>
                      )),
                    )}
                </SelectContent>
              </Select>
            )}
            {chat?.running ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void webCall('chat.cancel', [chat.sessionId]).catch((cause) =>
                    setError(cause.message),
                  )
                }
              >
                停止
              </Button>
            ) : (
              <Button
                aria-label="发送"
                size="icon-sm"
                disabled={!chat?.configured || sending || !text.trim()}
                onClick={() => void send()}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
