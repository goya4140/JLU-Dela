import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Play, RefreshCw } from 'lucide-react';
import type {
  JluCourse,
  JluLearning,
  JluRecording,
  JluRecordings,
  JluPlatformsApi,
} from '../../../shared/jlu-platforms';
import { LearningStudy } from './LearningStudy';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { DesktopOnlyNotice } from '../../components/ui/desktop-only-notice';
import { errorText } from '../../workspace/store';

export type LearningPageApi = Pick<
  JluPlatformsApi,
  'getLearning' | 'syncLearning' | 'getRecordings' | 'syncRecordings'
>;
type LearningProps = {
  api?: LearningPageApi;
  renderStudy?: (props: {
    course: JluCourse;
    recording: JluRecording;
    onBack: () => void;
  }) => ReactNode;
};
export function LearningView({ api = window.dela?.jluPlatforms, renderStudy }: LearningProps = {}) {
  if (!api)
    return <DesktopOnlyNotice title="学在吉大" description="请在桌面应用中登录并同步课程。" />;
  return <LearningPage api={api} renderStudy={renderStudy} />;
}
function LearningPage({ api, renderStudy }: LearningProps & { api: LearningPageApi }) {
  const [data, setData] = useState<JluLearning | null>(null);
  const [course, setCourse] = useState<JluCourse | null>(null);
  const [recordings, setRecordings] = useState<JluRecordings | null>(null);
  const [recording, setRecording] = useState<JluRecording | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api
      .getLearning()
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
  async function sync(termId?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.syncLearning(termId);
      if (result.ok) {
        setData(result.data);
        setCourse(null);
        setRecordings(null);
      } else setError(result.error);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  async function read(next: JluCourse, refresh = true) {
    setBusy(true);
    setError(null);
    setCourse(next);
    setRecordings(null);
    try {
      const cached = await api.getRecordings(next.id);
      setRecordings(cached);
      if (cached && !refresh) return;
      const result = await api.syncRecordings(next.id);
      if (result.ok) setRecordings(result.data);
      else setError(result.error);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  if (course && recording && renderStudy)
    return renderStudy({ course, recording, onBack: () => setRecording(null) });
  if (course && recording)
    return (
      <LearningStudy
        key={`${course.id}:${recording.id}`}
        course={course}
        recording={recording}
        onBack={() => setRecording(null)}
      />
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-8 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">学在吉大</h1>
            <p className="mt-1 text-xs text-ink-3">
              {data
                ? `课程更新于 ${new Date(data.syncedAt).toLocaleString('zh-CN')}`
                : '尚未同步课程'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void sync(data?.termId ?? undefined)}>
              <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
              {busy ? '正在读取…' : data ? '同步课程' : '登录并同步'}
            </Button>
          </div>
        </header>
        {error && (
          <p role="alert" className="rounded-control bg-field p-3 text-13 text-ink">
            {error}
          </p>
        )}
        {data && (
          <Select
            disabled={busy}
            value={data.termId ?? undefined}
            onValueChange={(value) => void sync(value)}
          >
            <SelectTrigger aria-label="学在吉大学期" className="w-full md:w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.year} 学年 · {term.name || `第 ${term.num} 学期`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!data && (
          <p className="py-8 text-13 leading-relaxed text-ink-3">
            同步课程及回放目录。需要验证时会显示学校登录窗口。
          </p>
        )}
        {course ? (
          <section className="grid gap-4">
            <div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setCourse(null);
                  setRecordings(null);
                }}
              >
                <ArrowLeft className="size-4" />
                返回课程
              </Button>
            </div>
            <h2 className="break-words text-lg font-semibold text-ink">
              {course.courseName || course.name}
            </h2>
            <div>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void read(course)}>
                同步录像
              </Button>
            </div>
            <p className="text-xs text-ink-3">
              {course.teacher} · 回放目录{recordings ? ` · ${recordings.items.length} 条` : ''}
            </p>
            {recordings?.items.map((item) => (
              <button
                key={item.id}
                disabled={busy || item.resourceId === ''}
                onClick={() => setRecording(item)}
                className="grid gap-1 rounded-control bg-field p-4 text-left hover:bg-hover disabled:opacity-50"
              >
                <h3 className="break-words text-sm text-ink">{item.name}</h3>
                <p className="text-xs text-ink-3">
                  {[item.date, item.time, item.room].filter(Boolean).join(' · ')}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3">
                  <Play className="size-3.5" />
                  {item.resourceId === '' ? '尚未提供录像' : '进入学习'}
                </span>
              </button>
            ))}
            {recordings && !recordings.items.length && (
              <p className="text-13 text-ink-3">该课程暂未返回回放记录。</p>
            )}
            <p className="text-xs leading-relaxed text-ink-3">
              选择录像开始学习。需要人工验证时才显示学校登录窗口。
            </p>
          </section>
        ) : (
          data && (
            <section className="grid gap-3 md:grid-cols-2">
              {data.courses.map((item) => (
                <button
                  disabled={busy}
                  key={item.id}
                  className="grid min-w-0 gap-2 rounded-xl bg-field p-5 text-left hover:bg-hover disabled:opacity-50"
                  onClick={() => void read(item, !renderStudy)}
                >
                  <h2 className="break-words text-base font-semibold text-ink">
                    {item.courseName || item.name}
                  </h2>
                  {item.name !== item.courseName && (
                    <p className="break-words text-xs text-ink-3">{item.name}</p>
                  )}
                  <p className="text-13 text-ink-3">{item.teacher}</p>
                  <span className="text-xs text-ink-3">{item.status || '查看回放目录'}</span>
                </button>
              ))}
              {!data.courses.length && (
                <p className="text-13 text-ink-3">学校未返回本学期课程，可切换其他学期查看。</p>
              )}
            </section>
          )
        )}
      </div>
    </div>
  );
}
