import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Columns2,
  MessageSquare,
} from 'lucide-react';
import type { TabComponentProps } from '../../workbench/registry';
import type { WebTabCommand } from '../../../shared/web-tabs';
import { Button } from '../../components/ui/button';
import { useWorkbenchLayout } from '../../workbench/layout-store';
import { useNavigationStore } from '../../navigation/view';
import { useChatDrafts } from '../chat/drafts';
import { showToast } from '../../app/toasts';
import { errorText } from '../../workspace/store';
import { useWebTabs } from './store';

export function WebTab({ tabId, groupId }: TabComponentProps) {
  const slot = useRef<HTMLDivElement>(null);
  const state = useWebTabs((s) => s.states[tabId]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const api = window.dela?.webTabs;
    const element = slot.current;
    if (!api || !element) return;
    let disposed = false;
    let dragging = false;
    let previous = '';
    const off = api.onState((value) => useWebTabs.getState().put(value));
    const update = () => {
      if (disposed) return;
      const overlay = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]',
        ),
      ].some((node) => node.getClientRects().length > 0);
      const mobileDrawer = document.querySelector('[data-mobile-drawer]');
      const rect = element.getBoundingClientRect();
      const bounds = {
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: rect.width,
        height: rect.height,
      };
      const hidden =
        dragging ||
        overlay ||
        !!mobileDrawer ||
        document.hidden ||
        rect.width < 1 ||
        rect.height < 1;
      const key = hidden ? 'hidden' : JSON.stringify(bounds);
      if (key === previous) return;
      previous = key;
      const result = hidden
        ? api.hide(tabId)
        : api.place(tabId, bounds).then((value) => {
            if (!disposed) useWebTabs.getState().put(value);
          });
      void result.catch((cause) => {
        if (!disposed) setError(errorText(cause));
      });
    };
    const start = () => {
      dragging = true;
      update();
    };
    const end = () => {
      dragging = false;
      update();
    };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const mutations = new MutationObserver(update);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-state'],
    });
    const timer = window.setInterval(update, 200);
    document.addEventListener('dragstart', start, true);
    document.addEventListener('dragend', end, true);
    document.addEventListener('drop', end, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      disposed = true;
      off();
      resize.disconnect();
      mutations.disconnect();
      clearInterval(timer);
      document.removeEventListener('dragstart', start, true);
      document.removeEventListener('dragend', end, true);
      document.removeEventListener('drop', end, true);
      window.removeEventListener('resize', update);
      void api.hide(tabId).catch(() => {});
    };
  }, [tabId]);
  async function command(value: WebTabCommand) {
    setError(null);
    if (!window.dela) return;
    try {
      useWebTabs.getState().put(await window.dela.webTabs.command(tabId, value));
    } catch (cause) {
      setError(errorText(cause));
    }
  }
  async function ask() {
    if (busy || !window.dela) return;
    setBusy(true);
    try {
      const selection = await window.dela.webTabs.selection(tabId);
      if (!selection.trim()) {
        showToast({ variant: 'neutral', title: '请先在网页中选中要讨论的文字' });
        return;
      }
      const layout = useWorkbenchLayout.getState();
      layout.splitGroup(groupId, 'vertical', true);
      if (useWorkbenchLayout.getState().focus === groupId) return;
      const sessionId = await useNavigationStore.getState().newChat(layout.projectId);
      if (sessionId) {
        const drafts = useChatDrafts.getState();
        const previous = drafts.drafts[sessionId]?.prompt ?? '';
        drafts.update(sessionId, {
          prompt: `${previous}${previous ? '\n\n' : ''}来自学习通作业「${state?.title ?? '作业'}」的选中文字：\n\n${selection}\n\n请帮我理解这段内容。`,
        });
        showToast({
          variant: 'success',
          title: '选中文字已放入 AI 草稿',
          description: '可修改问题，确认后发送。',
        });
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="网页后退"
          disabled={!state?.back}
          onClick={() => void command('back')}
        >
          <ArrowLeft />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="网页前进"
          disabled={!state?.forward}
          onClick={() => void command('forward')}
        >
          <ArrowRight />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="重新加载网页"
          onClick={() => void command('reload')}
        >
          <RefreshCw className={state?.loading ? 'animate-spin' : ''} />
        </Button>
        <span className="mr-auto truncate text-xs text-ink-3">
          {state?.origin || '学习通原网页'}
          {state?.loading ? ' · 加载中' : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void command('recover')}>
          恢复作业入口
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void command('timing')}>
          更新作业时间
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="分屏后可打开笔记或新建对话"
          onClick={() => useWorkbenchLayout.getState().splitGroup(groupId, 'vertical', true)}
        >
          <Columns2 />
          分屏
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void ask()}>
          <MessageSquare />
          选中文字问 AI
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="浏览器打开作业"
          onClick={() => void command('external')}
        >
          <ExternalLink />
        </Button>
      </div>
      {(error || state?.error || state?.timing) && (
        <p
          role={error || state?.error ? 'alert' : 'status'}
          className="shrink-0 whitespace-pre-wrap border-b px-4 py-2 text-xs text-ink-2"
        >
          {error || state?.error || `已读取作业时间：${state?.timing}`}
        </p>
      )}
      <div ref={slot} className="min-h-0 flex-1 bg-white" aria-label="学习通原网页区域" />
      <p className="shrink-0 border-t px-4 py-1.5 text-2xs text-ink-3">
        作答、保存和提交由学习通原网页处理。AI 仅接收你选中并确认发送的文字。
      </p>
    </div>
  );
}
