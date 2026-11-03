import { useActionState, useState, type ReactNode } from 'react';
import { ArrowLeft, Plus, Users } from 'lucide-react';
import type { WechatApi } from '../../../shared/wechat';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { ManualWechatReply } from './ManualWechatReply';
import { fileTransferChat, useManualWechat } from './manual-store';

export function ManualWechatWorkspace({
  api,
  diagnostics,
}: {
  api: WechatApi;
  diagnostics: ReactNode;
}) {
  const groups = useManualWechat((state) => state.groups);
  const drafts = useManualWechat((state) => state.drafts);
  const [selected, setSelected] = useState(fileTransferChat.id);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState('');
  const [showList, setShowList] = useState(true);
  const [locked, setLocked] = useState(false);
  const chats = [fileTransferChat, ...groups];
  const current = chats.find((chat) => chat.id === selected) ?? fileTransferChat;
  const filtered = chats.filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase()));
  const [addError, addAction, addingPending] = useActionState(
    async () => {
      const values = names
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean);
      if (!values.length) return '请输入至少一个群名。';
      if (values.some((name) => name.length > 100) || values.length > 100)
        return '每个群名最多 100 字，每次最多添加 100 个群。';
      const id = useManualWechat.getState().addGroups(values);
      setSelected(id);
      setAdding(false);
      setNames('');
      setSearch('');
      setShowList(false);
      return null;
    },
    null as string | null,
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1" aria-label="微信手动群聊工作台">
      <aside
        className={cn(
          'flex w-64 shrink-0 flex-col gap-3 bg-page p-3 max-md:w-full',
          !showList && 'max-md:hidden',
        )}
      >
        <Input
          aria-label="搜索已添加微信群"
          placeholder="搜索会话名称"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex items-center justify-between gap-2 px-2">
          <p className="text-xs text-ink-3">本地群聊 · {groups.length} 个</p>
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => setAdding(!adding)}>
            <Plus />
            添加群聊
          </Button>
        </div>
        {adding && (
          <form action={addAction} className="space-y-2 rounded-control bg-surface p-3">
            <Textarea
              aria-label="要添加的微信群名"
              placeholder="输入原微信中的完整群名，每行一个"
              value={names}
              maxLength={10000}
              onChange={(event) => setNames(event.target.value)}
            />
            <p className="text-xs leading-relaxed text-ink-3">
              同名群请先在原微信核对成员。这里只保存本地入口，不会加入或绑定微信群。
            </p>
            {addError && (
              <p role="alert" className="text-xs text-red">
                {addError}
              </p>
            )}
            <Button type="submit" disabled={locked || addingPending}>
              保存并进入
            </Button>
          </form>
        )}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {filtered.map((chat) => (
            <button
              key={chat.id}
              aria-label={`选择本地微信会话 ${chat.name}`}
              aria-pressed={current.id === chat.id}
              disabled={locked}
              className={cn(
                'w-full min-w-0 rounded-control px-3 py-3 text-left disabled:opacity-50',
                current.id === chat.id ? 'bg-hover-2' : 'hover:bg-hover',
              )}
              onClick={() => {
                setSelected(chat.id);
                setShowList(false);
              }}
            >
              <span className="block truncate text-13 font-medium">{chat.name}</span>
              <span className="block truncate text-xs text-ink-3">
                {drafts[chat.id]
                  ? '有本地草稿'
                  : chat.id === fileTransferChat.id
                    ? '单人会话'
                    : '手动核对发送'}
              </span>
            </button>
          ))}
          {!filtered.length && <p className="p-2 text-13 text-ink-3">没有匹配的会话</p>}
        </div>
        <p className="px-2 text-xs leading-relaxed text-ink-3">
          群名和各群草稿保存在本机。当前不自动读取群列表或聊天记录。
        </p>
      </aside>
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', showList && 'max-md:hidden')}>
        <header className="flex min-w-0 items-center gap-2 px-4 py-3">
          <Button
            className="md:hidden"
            variant="ghost"
            size="icon"
            aria-label="返回本地微信群列表"
            disabled={locked}
            onClick={() => setShowList(true)}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{current.name}</h2>
            <p className="text-xs text-ink-3">手动核对模式</p>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto p-5">
          <div className="flex w-full max-w-2xl gap-3 py-3 text-13 leading-relaxed text-ink-3">
            <Users className="mt-1 size-5 shrink-0" />
            <p>
              先在原微信打开「{current.name}
              」并点击空白输入框，再在这里填入草稿。核对接收方、完整文字和附件后发送；切换群聊也需要在原微信完成。
            </p>
          </div>
          <ManualWechatReply
            key={current.id}
            api={api}
            chat={current}
            text={drafts[current.id] ?? ''}
            onTextChange={(text) => useManualWechat.getState().draft(current.id, text)}
            onLockChange={setLocked}
          />
          {locked && (
            <p role="status" className="w-full max-w-2xl text-xs text-ink-3">
              先完成或取消当前发送确认，再切换会话。提交后请核对结果；结果不明时不要重发。
            </p>
          )}
          {diagnostics}
        </div>
      </div>
    </div>
  );
}
