import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TodoView } from '../features/todo/TodoView';
import { CampusView } from '../features/campus/CampusView';
import { ToastHost } from '../app/toasts';
import { LearningView } from '../features/campus/LearningView';
import { ChaoxingView } from '../features/campus/ChaoxingView';
import { SchoolNoticesView } from '../features/campus/SchoolNoticesView';
import { DesktopOnlyNotice } from '../components/ui/desktop-only-notice';
import { Button } from '../components/ui/button';
import { connectWeb, webCall } from './api';
import {
  appearanceApi,
  learningApi,
  chaoxingApi,
  noticesApi,
  todoApi,
  calendarApi,
} from './platforms';
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
          <ToastHost />
          {page === 'home' && <WebChat draft={draft} onDraft={setDraft} />}
          {page === 'timetable' && <WebTimetable />}
          {page === 'chaoxing' && <ChaoxingView api={chaoxingApi} onOpenWork={null} />}
          {page === 'todo' && (
            <TodoView
              api={todoApi}
              calendarApi={calendarApi}
              onOpenTimetable={() => navigate('timetable')}
              onOpenWork={null}
              onOpenLink={(url) => {
                if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
              }}
            />
          )}
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
            <CampusView
              onNavigate={navigate}
              onOpenGuide={() => navigate('settings')}
              onOpenSources={() => navigate('sources')}
            />
          )}
          {page === 'mail' && (
            <DesktopOnlyNotice
              title="吉大邮箱"
              description="邮箱账户与邮件暂时请在本机 Dela 中管理。"
            />
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
