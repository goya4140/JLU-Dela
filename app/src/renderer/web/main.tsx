import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GraduationCap } from 'lucide-react';
import { LearningView } from '../features/campus/LearningView';
import { ChaoxingView } from '../features/campus/ChaoxingView';
import { SchoolNoticesView } from '../features/campus/SchoolNoticesView';
import { DesktopOnlyNotice } from '../components/ui/desktop-only-notice';
import { navEntries } from '../navigation/entries';
import { Button } from '../components/ui/button';
import { connectWeb, webCall } from './api';
import { appearanceApi, learningApi, chaoxingApi, noticesApi } from './platforms';
import { useAppearance } from '../app/theme';
import { WebShell, type WebPage } from './WebShell';
import { WebTimetable } from './WebTimetable';
import { WebStudy } from './WebStudy';
import { WebChat } from './WebChat';
import '../styles/globals.css';

function WebAppearance() {
  useAppearance(appearanceApi);
  return null;
}

function WebApp() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<WebPage[]>(['home']);
  const [position, setPosition] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState('');
  const page = history[position]!;
  useEffect(() => {
    let active = true;
    void connectWeb()
      .then(() => webCall('schedule.state'))
      .then(() => {
        if (active) setConnected(true);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  function leave() {
    if (dirty && !confirm('笔记尚未保存，仍要离开吗？')) return false;
    setDirty(false);
    return true;
  }
  function navigate(next: WebPage) {
    if (next === page || !leave()) return;
    setHistory([...history.slice(0, position + 1), next]);
    setPosition(position + 1);
  }
  return (
    <WebShell
      page={page}
      connected={connected}
      onNavigate={navigate}
      canBack={position > 0}
      canForward={position < history.length - 1}
      onBack={() => {
        if (leave()) setPosition(position - 1);
      }}
      onForward={() => {
        if (leave()) setPosition(position + 1);
      }}
    >
      {!connected ? (
        <div className="mx-auto grid w-full max-w-3xl gap-4 px-6 py-16">
          <h1 className="text-xl font-semibold">连接本机 Dela</h1>
          <p className="text-sm text-ink-3">请使用本机服务提供的连接链接打开网页。</p>
          {error && (
            <p role="alert" className="text-13 text-red">
              {error}
            </p>
          )}
          <Button className="justify-self-start" onClick={() => location.reload()}>
            重新连接
          </Button>
        </div>
      ) : (
        <>
          <WebAppearance />
          {page === 'home' && <WebChat draft={draft} onDraft={setDraft} />}
          {page === 'timetable' && <WebTimetable />}
          {page === 'chaoxing' && <ChaoxingView api={chaoxingApi} />}
          {page === 'notifications' && <SchoolNoticesView api={noticesApi} />}
          {page === 'classroom' && (
            <LearningView
              api={learningApi}
              renderStudy={({ course, recording, onBack }) => (
                <WebStudy
                  key={`${course.id}:${recording.id}`}
                  course={course}
                  recording={recording}
                  onBack={() => {
                    if (leave()) onBack();
                  }}
                  onDirty={setDirty}
                  draft={draft}
                  onDraft={setDraft}
                />
              )}
            />
          )}
          {page === 'campus' && (
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
              <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-8 md:px-10">
                <header>
                  <div className="flex items-center gap-2">
                    <GraduationCap className="size-5 text-ink-3" />
                    <h1 className="text-xl font-semibold">吉大校园</h1>
                  </div>
                  <p className="mt-1 text-xs text-ink-3">课程、资料与学校通知</p>
                </header>
                <div className="grid gap-3 md:grid-cols-2">
                  {navEntries
                    .filter((entry) =>
                      ['timetable', 'classroom', 'chaoxing', 'notifications'].includes(entry.id),
                    )
                    .map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        className="grid min-w-0 gap-3 rounded-xl bg-field p-5 text-left hover:bg-hover"
                        onClick={() => navigate(id as WebPage)}
                      >
                        <Icon className="size-5 text-ink-3" />
                        <h2 className="text-base font-semibold">{label}</h2>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
          {(page === 'knowledge' || page === 'sources') && (
            <DesktopOnlyNotice
              title={page === 'knowledge' ? '知识库' : '课程资料'}
              description="本地文件与项目请在本机 Dela 中管理。网页可在学习通查看资料目录。"
            />
          )}
          {page === 'settings' && (
            <DesktopOnlyNotice
              title="设置"
              description="模型、登录和本地工作区设置请在本机 Dela 中管理。网页主题、字号和缩放沿用桌面设置，刷新网页后更新。"
            />
          )}
        </>
      )}
    </WebShell>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebApp />
  </StrictMode>,
);
