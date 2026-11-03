import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  SquareCheckBig,
} from 'lucide-react';
import type { WechatMessage, WechatSnapshot } from '../../../shared/wechat';
import { wechatSummaryPrompt } from '../../../shared/wechat';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { errorText } from '../../workspace/store';
import { useNavigationStore } from '../../navigation/view';
import { useChatDrafts } from '../../content/chat/drafts';
import { useSessions } from '../../sessions/store';
import { showToast } from '../../app/toasts';

const phaseLabels = {
  permission: '等待辅助功能授权',
  closed: '微信未运行',
  unavailable: '未找到可读取的微信聊天窗口',
  inaccessible: '微信未提供可识别的聊天控件',
  online: '已连接原微信',
};

export function WechatView() {
  const api = window.dela?.wechat;
  const [availability, setAvailability] = useState<{ available: boolean; reason: string } | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<WechatSnapshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [managing, setManaging] = useState(true);
  const [showList, setShowList] = useState(false);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<string[]>([]);
  const [todo, setTodo] = useState<WechatMessage | null>(null);
  const [todoTitle, setTodoTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const polling = useRef(false);
  const lifetime = useRef(0);
  const nativeApi = window.dela?.wechatMirror;
  const online = connected && snapshot?.phase === 'online';
  const chats = snapshot?.chats ?? [];
  const connectedChats = chats.filter((chat) => selectedIds.includes(chat.id));
  const currentChat = connectedChats.find((chat) => chat.id === selected) ?? connectedChats[0];
  const current = snapshot?.current?.id === currentChat?.id ? snapshot?.current : null;
  const messages = current?.messages ?? [];
  const draft = currentChat ? (drafts[currentChat.id] ?? '') : '';
  const filtered = chats.filter(
    (chat) =>
      (managing || selectedIds.includes(chat.id)) &&
      chat.name.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    let active = true;
    void api
      ?.getSupport()
      .then((value) => {
        if (active) setAvailability(value);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    const currentLifetime = ++lifetime.current;
    if (!connected || !api || snapshot?.phase === 'inaccessible') return;
    const timer = setInterval(() => {
      if (pending.current || polling.current) return;
      polling.current = true;
      void api
        .snapshot(selectedIds)
        .then((value) => {
          if (currentLifetime === lifetime.current && !pending.current) {
            setSnapshot(value);
          }
        })
        .catch((cause) => {
          if (currentLifetime === lifetime.current) setError(errorText(cause));
        })
        .finally(() => {
          polling.current = false;
        });
    }, 2000);
    return () => {
      clearInterval(timer);
      lifetime.current++;
    };
  }, [api, connected, selectedIds, snapshot?.phase]);

  async function perform(task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function openChat(id: string) {
    if (!api) return;
    setSelected(id);
    setChosen([]);
    setTodo(null);
    setShowList(false);
    await api.select(id);
    setSnapshot(await api.snapshot(selectedIds));
  }
  async function summarize() {
    if (!window.dela || !current) return;
    const selectedMessages = chosen.length
      ? messages.filter((message) => chosen.includes(message.id))
      : messages;
    const prompt = wechatSummaryPrompt(current.name, selectedMessages);
    if (prompt.length > 100_000) throw new Error('所选内容过长，请减少选择后重试。');
    const chat = await window.dela.session.create(null, 'chat');
    if (!chat.sessionId) throw new Error('未能创建 AI 会话，请重试。');
    useSessions.getState().putChat(chat.sessionId, chat);
    useChatDrafts.getState().update(chat.sessionId, { prompt });
    useNavigationStore.getState().openChat(chat.sessionId, null);
    showToast({
      variant: 'neutral',
      title: '已准备微信总结草稿',
      description: '检查后发送给你选择的 AI。',
    });
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="微信聊天">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">微信聊天</h1>
          <p role="status" className="mt-1 text-xs text-ink-3">
            {availability && !availability.available
              ? '微信接入已暂停'
              : connected && snapshot
                ? phaseLabels[snapshot.phase]
                : '尚未连接'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!nativeApi || busy}
            onClick={() => void perform(() => nativeApi!.openWechat())}
          >
            打开原微信
          </Button>
          {connected ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="刷新微信会话"
                disabled={busy}
                onClick={() =>
                  void perform(async () => setSnapshot(await api!.snapshot(selectedIds)))
                }
              >
                <RefreshCw />
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  lifetime.current++;
                  setConnected(false);
                  setSnapshot(null);
                  setSelectedIds([]);
                  setDrafts({});
                  setChosen([]);
                  setTodo(null);
                  setError(null);
                }}
              >
                断开
              </Button>
            </>
          ) : (
            <Button
              disabled={!api || !availability?.available || busy}
              onClick={() =>
                void perform(async () => {
                  const value = await api!.authorize();
                  setSnapshot(value);
                  setConnected(true);
                })
              }
            >
              {busy ? '正在连接…' : '连接微信'}
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="mx-5 mb-3 break-words text-13 text-red">
          {error}
        </p>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          aria-label="选择接入微信会话"
          className={cn(
            'flex w-64 shrink-0 flex-col gap-3 bg-page p-3 max-md:w-full',
            !online && 'max-md:hidden',
            !managing && currentChat && !showList && 'max-md:hidden',
          )}
        >
          <Input
            aria-label="搜索微信会话"
            placeholder="搜索会话名称"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2 px-2">
            <p className="text-xs text-ink-3">
              {managing ? '勾选要接入的会话' : '已接入的会话'} · {connectedChats.length} 个
            </p>
            {!managing && (
              <Button variant="ghost" size="sm" onClick={() => setManaging(true)}>
                管理会话
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {filtered.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  'flex items-center gap-2 rounded-control px-2 py-1',
                  currentChat?.id === chat.id && 'bg-hover-2',
                )}
              >
                {managing && (
                  <input
                    type="checkbox"
                    aria-label={`接入 ${chat.name}`}
                    checked={selectedIds.includes(chat.id)}
                    disabled={!online || busy}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedIds((ids) =>
                        checked ? [...ids, chat.id] : ids.filter((id) => id !== chat.id),
                      );
                    }}
                  />
                )}
                <button
                  aria-label={`打开微信会话 ${chat.name}`}
                  disabled={!online || busy || !selectedIds.includes(chat.id)}
                  className="min-w-0 flex-1 rounded-control py-2 text-left disabled:opacity-50"
                  onClick={() => {
                    setManaging(false);
                    void perform(() => openChat(chat.id));
                  }}
                >
                  <span className="block truncate text-13 font-medium">{chat.name}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {chat.preview
                      .split('\n')
                      .filter((line) => line !== chat.name && line !== '已置顶')[0] ?? ''}
                  </span>
                </button>
              </div>
            ))}
            {!filtered.length && (
              <p className="p-2 text-13 leading-relaxed text-ink-3">
                {search
                  ? '没有匹配的会话'
                  : online
                    ? '原微信列表暂无可读取的会话，请在微信中打开聊天后刷新。'
                    : '连接微信后显示原窗口中的会话列表。'}
              </p>
            )}
          </div>
          <p className="px-2 text-xs leading-relaxed text-ink-3">
            仅列出原微信已加载的会话。请先在原微信打开要回复的会话。
          </p>
          {managing && (
            <Button
              disabled={!online || busy || !connectedChats.length}
              onClick={() => {
                setManaging(false);
                setSearch('');
                void perform(() =>
                  openChat(
                    (
                      connectedChats.find((chat) => chat.id === snapshot?.current?.id) ??
                      connectedChats[0]!
                    ).id,
                  ),
                );
              }}
            >
              完成并进入聊天
            </Button>
          )}
        </aside>
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            online && (managing || showList) && 'max-md:hidden',
          )}
        >
          {!online ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
              <MessageCircle className="size-10 text-ink-3" />
              <div className="max-w-md space-y-2">
                <h2 className="text-base font-medium">
                  {availability && !availability.available
                    ? '微信接入已暂停'
                    : snapshot?.phase === 'permission'
                      ? '允许 Dela 访问微信窗口控件'
                      : snapshot?.phase === 'inaccessible'
                        ? '暂时无法在 Dela 读取和回复'
                        : snapshot?.phase === 'unavailable'
                          ? '请在原微信中打开聊天窗口'
                          : '把微信聊天带进工作台'}
                </h2>
                <p className="text-13 leading-relaxed text-ink-3">
                  {availability && !availability.available
                    ? availability.reason
                    : snapshot?.phase === 'inaccessible'
                      ? snapshot.detail
                      : snapshot?.phase === 'permission'
                        ? '在系统设置 → 隐私与安全性 → 辅助功能中允许当前预览程序，然后返回这里。'
                        : '使用已登录的原微信。连接后选择会话，在这里查看消息和回复。'}
                </p>
                <p className="text-xs leading-relaxed text-ink-3">
                  通过系统辅助功能接入，不修改微信客户端。离开此页面会停止读取；断开不会退出微信。
                </p>
              </div>
              {snapshot?.phase === 'permission' && (
                <Button onClick={() => void perform(() => api!.openSettings())}>
                  打开辅助功能设置
                </Button>
              )}
            </div>
          ) : !currentChat || managing ? (
            <div className="flex flex-1 items-center justify-center p-6 text-13 text-ink-3">
              {connectedChats.length
                ? '选好会话后，点击“完成并进入聊天”'
                : '勾选要接入的会话，然后进入聊天'}
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    className="md:hidden"
                    variant="ghost"
                    size="icon"
                    aria-label="返回微信会话列表"
                    onClick={() => setShowList(true)}
                  >
                    <ArrowLeft />
                  </Button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{currentChat.name}</h2>
                    <p className="text-xs text-ink-3">
                      {current
                        ? '显示原微信已加载的可见内容 · 每 2 秒刷新'
                        : '请在原微信中打开此会话，或点击会话名称重试'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || !messages.length}
                    onClick={() => void perform(summarize)}
                  >
                    <Sparkles />
                    {chosen.length ? `总结所选 ${chosen.length} 条` : 'AI 总结'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void perform(() => nativeApi!.openWechat())}
                  >
                    <ExternalLink />
                    图片与文件
                  </Button>
                </div>
              </header>
              <div
                aria-label="微信消息记录"
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3"
              >
                {!messages.length && (
                  <p className="py-8 text-center text-13 text-ink-3">
                    {current ? '当前没有可读取的消息。' : '等待原微信切换到此会话。'}
                  </p>
                )}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className="flex min-w-0 gap-2"
                    data-message-id={message.id}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0 self-start"
                      aria-label={`选择微信消息 ${message.id}`}
                      checked={chosen.includes(message.id)}
                      onChange={(event) =>
                        setChosen((ids) =>
                          event.target.checked
                            ? [...ids, message.id]
                            : ids.filter((id) => id !== message.id),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-13 leading-relaxed [overflow-wrap:anywhere]">
                        {message.text}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTodo(message);
                          setTodoTitle(message.text.slice(0, 200));
                        }}
                      >
                        <SquareCheckBig />
                        设为待办
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              {todo && (
                <form
                  className="space-y-2 bg-page p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform(async () => {
                      await window.dela!.todo.save({
                        title: todoTitle,
                        notes:
                          `微信会话：${currentChat.name}\n读取时间：${snapshot!.capturedAt}（不是发送时间）\n\n${todo.text}`.slice(
                            0,
                            10000,
                          ),
                      });
                      setTodo(null);
                      setError(null);
                      showToast({ variant: 'success', title: '已创建个人待办' });
                    });
                  }}
                >
                  <label className="block space-y-2 text-13">
                    <span>待办内容</span>
                    <Input
                      aria-label="微信待办内容"
                      required
                      maxLength={200}
                      value={todoTitle}
                      onChange={(event) => setTodoTitle(event.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setTodo(null)}>
                      取消
                    </Button>
                    <Button type="submit" disabled={busy || !todoTitle.trim()}>
                      保存待办
                    </Button>
                  </div>
                </form>
              )}
              <form
                className="space-y-2 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void perform(async () => {
                    await api!.send({ chatId: currentChat.id, text: draft });
                    setDrafts((values) => ({ ...values, [currentChat.id]: '' }));
                    setSnapshot(await api!.snapshot(selectedIds));
                  });
                }}
              >
                <Textarea
                  aria-label="微信消息内容"
                  placeholder={current ? '输入消息' : '先在原微信中打开此会话'}
                  maxLength={4500}
                  disabled={!current?.canSend || busy}
                  value={draft}
                  onChange={(event) =>
                    setDrafts((values) => ({ ...values, [currentChat.id]: event.target.value }))
                  }
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-3">
                    发送时会短暂激活原微信。图片和文件在原微信处理。
                  </p>
                  <Button type="submit" disabled={!current?.canSend || busy || !draft.trim()}>
                    <Send />
                    {busy ? '处理中…' : '发送'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
