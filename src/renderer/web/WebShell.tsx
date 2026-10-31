import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  House,
  PanelLeft,
  PanelLeftClose,
  Settings,
  X,
  CircleCheck,
  SquareCheckBig,
} from 'lucide-react';
import { appFrame, appMain, chromeIconButton, navIcon, navRow } from '../navigation/nav-styles';
import { navEntries } from '../navigation/entries';
import { useViewportWidth } from '../workbench/explorer-state';
import { Resizer } from '../components/ui/resizer';
import { cn } from '../lib/utils';

export type WebPage =
  | 'home'
  | 'todo'
  | 'mail'
  | 'campus'
  | 'timetable'
  | 'classroom'
  | 'chaoxing'
  | 'notifications'
  | 'knowledge'
  | 'sources'
  | 'settings';
const available = new Set(['campus', 'timetable', 'classroom', 'chaoxing', 'notifications']);
export function WebShell({
  page,
  onNavigate,
  connected,
  onBack,
  onForward,
  canBack,
  canForward,
  children,
}: {
  page: WebPage;
  onNavigate: (page: WebPage) => void;
  connected: boolean;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [width, setWidth] = useState(200);
  const viewport = useViewportWidth();
  const narrow = viewport < 768;
  const hidden = narrow ? !mobileOpen : collapsed;
  function navigate(next: WebPage) {
    onNavigate(next);
    setMobileOpen(false);
  }
  const entries = navEntries.filter((entry) => entry.id !== 'shuiyuan');
  return (
    <div
      className={appFrame}
      style={
        {
          height: 'calc(100dvh / var(--dela-web-zoom, 1))',
          '--sidebar-width':
            narrow || collapsed
              ? '0px'
              : `${Math.min(width, Math.max(200, Math.round(viewport * 0.28)))}px`,
        } as CSSProperties
      }
    >
      <header className="col-span-full flex items-center justify-between bg-page px-2">
        <div className="flex items-center gap-1">
          <button
            aria-label={hidden ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!hidden}
            aria-controls="main-nav"
            className={chromeIconButton}
            onClick={() => (narrow ? setMobileOpen(!mobileOpen) : setCollapsed(!collapsed))}
          >
            {hidden ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <button
            aria-label="后退"
            className={chromeIconButton}
            disabled={!canBack}
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            aria-label="前进"
            className={chromeIconButton}
            disabled={!canForward}
            onClick={onForward}
          >
            <ArrowRight className="size-4" />
          </button>
          {!narrow && collapsed && (
            <>
              <button
                aria-label="首页"
                title="首页"
                className={chromeIconButton}
                onClick={() => navigate('home')}
              >
                <House className="size-4" />
              </button>
              {entries
                .filter((entry) => available.has(entry.id))
                .map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-label={label}
                    title={label}
                    aria-current={page === id ? 'page' : undefined}
                    className={chromeIconButton}
                    onClick={() => navigate(id as WebPage)}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
            </>
          )}
        </div>
        <span className="px-2 text-xs text-ink-3">
          {import.meta.env.VITE_DELA_DEMO === 'true' ? '交互演示 · 全部为示例数据' : '网页端'}
        </span>
      </header>
      {narrow && mobileOpen && (
        <button
          aria-label="关闭导航"
          className="absolute inset-x-0 bottom-0 top-10 z-30 bg-black/30"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="main-nav"
        aria-label="主导航"
        className={cn(
          'flex min-h-0 flex-col overflow-hidden bg-page px-2 pb-3',
          narrow
            ? 'absolute bottom-0 left-0 top-10 z-40 w-[17.5rem] max-w-[85vw] shadow-overlay'
            : 'col-start-1 row-start-2',
          hidden && 'hidden',
        )}
      >
        <div className="flex h-11 shrink-0 items-center justify-between px-2">
          <span className="text-13 font-semibold tracking-tight">JLU Dela</span>
          <button
            aria-label="学习日历"
            title="学习日历"
            className={chromeIconButton}
            onClick={() => navigate('todo')}
            disabled={!connected}
          >
            <SquareCheckBig className="size-4" />
          </button>
          {narrow && (
            <button
              aria-label="关闭侧边栏"
              className={chromeIconButton}
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <nav aria-label="功能入口" className="grid gap-0.5">
          <button
            aria-current={page === 'home' ? 'page' : undefined}
            className={navRow(page === 'home')}
            disabled={!connected}
            onClick={() => navigate('home')}
          >
            <House className={navIcon(page === 'home')} strokeWidth={1.8} />
            首页
          </button>
          {entries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={page === id ? 'page' : undefined}
              className={navRow(page === id)}
              disabled={!connected}
              onClick={() => navigate(id as WebPage)}
            >
              <Icon className={navIcon(page === id)} strokeWidth={1.8} />
              <span className="truncate">{label}</span>
              {!available.has(id) && <span className="ml-auto text-2xs text-ink-3">桌面端</span>}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1" />
        <p role="status" className="flex items-center gap-2 px-2 py-3 text-xs text-ink-3">
          <CircleCheck className="size-3.5" />
          {import.meta.env.VITE_DELA_DEMO === 'true'
            ? '公开演示 · 刷新后重置'
            : connected
              ? '已连接本机 Dela'
              : '等待本机连接'}
        </p>
        {import.meta.env.VITE_DELA_DEMO === 'true' && (
          <a
            className={navRow(false)}
            href="https://github.com/goya4140/JLU-Dela/releases"
            target="_blank"
            rel="noreferrer"
          >
            下载桌面端
          </a>
        )}
        <button
          aria-current={page === 'settings' ? 'page' : undefined}
          className={navRow(page === 'settings')}
          onClick={() => navigate('settings')}
        >
          <Settings className={navIcon(page === 'settings')} strokeWidth={1.8} />
          设置
        </button>
      </aside>
      {!narrow && !collapsed && (
        <Resizer
          className="col-start-3 row-start-2 bg-transparent"
          label="调整侧边栏宽度"
          min={200}
          max={360}
          value={width}
          onChange={setWidth}
        />
      )}
      <main id="app-main" className={appMain}>
        {children}
      </main>
    </div>
  );
}
