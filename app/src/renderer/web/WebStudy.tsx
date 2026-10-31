import { useEffect, useRef, useState } from 'react';
import { BookOpen, MessageSquare, Quote, Search } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import type {
  JluCourse,
  JluRecording,
  JluStudyMedia,
  JluPlatformResult,
} from '../../shared/jlu-platforms';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SegmentedControl } from '../components/ui/beautifului/atoms/SegmentedControl';
import { MarkdownEditor } from '../content/note/MarkdownEditor';
import { LearningStudyFrame } from '../features/campus/LearningStudyFrame';
import { studyQuestion } from '../features/campus/LearningStudy';
import { formatTime } from '../features/classroom/player-format';
import {
  readPlaybackProgress,
  resumePlaybackTime,
  savePlaybackProgress,
  clearPlaybackProgress,
} from '../features/classroom/progress';
import { cn } from '../lib/utils';
import { webCall } from './api';
import { WebChat } from './WebChat';

type StudyNote = { id: string; title: string; text: string; revision: string };
const noteExtensions = [EditorView.lineWrapping];
export function WebStudy({
  course,
  recording,
  onBack,
  onDirty,
  draft,
  onDraft,
}: {
  course: JluCourse;
  recording: JluRecording;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  draft: string;
  onDraft: (text: string) => void;
}) {
  const [media, setMedia] = useState<JluStudyMedia | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [note, setNote] = useState<StudyNote | null>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<'笔记' | 'AI'>('笔记');
  const [stream, setStream] = useState(0);
  const [time, setTime] = useState(0);
  const [quote, setQuote] = useState<{ text: string; time: number } | null>(null);
  const [follow, setFollow] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const captionList = useRef<HTMLDivElement>(null);
  const activeCaption = useRef<HTMLDivElement>(null);
  const positionKey = `jlu:${course.id}:${recording.id}`;
  const position = useRef(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void webCall<JluPlatformResult<JluStudyMedia>>('learning.media', [course.id, recording.id])
      .then((value) => {
        if (!active) return;
        if (!value.ok) throw new Error(value.error);
        setMedia(value.data);
        setStream(0);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course.id, recording.id, retry]);
  useEffect(() => {
    let active = true;
    void webCall<StudyNote>('learning.note', [course.id, recording.id])
      .then((value) => {
        if (active) {
          setNote(value);
          setText(value.text);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [course.id, recording.id]);
  useEffect(() => {
    if (!note || text === note.text) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [note, text]);
  const current = media?.subtitles.find(
    (row) => row.startMs <= time * 1000 && row.endMs > time * 1000,
  );
  useEffect(() => {
    const panel = captionList.current,
      row = activeCaption.current;
    if (follow && !query && panel && row)
      panel.scrollTo({
        top: panel.scrollTop + row.getBoundingClientRect().top - panel.getBoundingClientRect().top,
        behavior: 'smooth',
      });
  }, [current?.startMs, follow, query]);
  async function save() {
    if (!note || saving) return;
    setSaving(true);
    setError('');
    try {
      const value = await webCall<StudyNote>('learning.saveNote', [note.id, text, note.revision]);
      setNote(value);
      setSaved(true);
      onDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }
  function seek(seconds: number) {
    if (video.current) video.current.currentTime = seconds;
    setTime(seconds);
    savePlaybackProgress(positionKey, seconds);
  }
  function ask(notes = false) {
    onDraft(
      studyQuestion(
        recording.name,
        notes ? time : (quote?.time ?? time),
        notes ? text : quote?.text || current?.text || '',
        notes ? '我的笔记' : '课堂字幕',
      ),
    );
    setView('AI');
  }
  const subtitles =
    media?.subtitles.filter((row) =>
      row.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [];
  return (
    <LearningStudyFrame
      course={course.courseName || course.name}
      recording={recording.name}
      onBack={onBack}
      loading={loading}
      onReload={() => setRetry((value) => value + 1)}
    >
      <section aria-label="视频与字幕" className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black">
          {loading ? (
            <p className="text-sm text-white">正在载入录像…</p>
          ) : (
            media?.streams[stream] && (
              <video
                ref={video}
                key={media.streams[stream].playbackUrl}
                className="size-full"
                controls
                playsInline
                preload="metadata"
                aria-label="课程录像"
                src={media.streams[stream].playbackUrl}
                onLoadedMetadata={(event) => {
                  const seconds = resumePlaybackTime(
                    readPlaybackProgress(positionKey),
                    event.currentTarget.duration,
                  );
                  if (seconds !== null) {
                    event.currentTarget.currentTime = seconds;
                    setTime(seconds);
                  }
                }}
                onTimeUpdate={(event) => {
                  const seconds = event.currentTarget.currentTime;
                  setTime(seconds);
                  if (Math.abs(seconds - position.current) >= 5) {
                    savePlaybackProgress(positionKey, seconds);
                    position.current = seconds;
                  }
                }}
                onPause={(event) =>
                  savePlaybackProgress(positionKey, event.currentTarget.currentTime)
                }
                onEnded={() => clearPlaybackProgress(positionKey)}
                onError={() => setError('视频暂时无法播放，请重新加载录像。')}
              />
            )
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-control bg-red-tint p-3 text-13 text-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {media?.streams.map((item, index) => (
              <Button
                key={item.playbackUrl}
                size="sm"
                variant={index === stream ? 'secondary' : 'ghost'}
                onClick={() => {
                  savePlaybackProgress(positionKey, time);
                  setStream(index);
                }}
              >
                {item.name}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={!media} onClick={() => ask()}>
            <MessageSquare className="size-3.5" />
            引用当前片段
          </Button>
        </div>
        {quote && (
          <div className="flex items-start gap-2 rounded-control bg-field p-3 text-xs text-ink-2">
            <span className="min-w-0 flex-1 break-words">
              已选片段 · {formatTime(quote.time)} · {quote.text.slice(0, 160)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setQuote(null)}>
              取消引用
            </Button>
          </div>
        )}
        <section aria-label="课堂字幕" className="flex min-h-0 flex-1 flex-col rounded-xl bg-field">
          <div className="flex flex-wrap items-center gap-3 p-3">
            <h2 className="text-13 font-medium">字幕</h2>
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={follow}
              onClick={() => setFollow(!follow)}
            >
              {follow ? '正在跟随' : '跟随播放'}
            </Button>
            <div className="relative ml-auto w-full sm:w-auto">
              <Search className="absolute left-2 top-2 size-3.5 text-ink-3" />
              <Input
                aria-label="搜索课堂字幕"
                placeholder="搜索字幕"
                className="pl-7"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          {!!media?.subtitles.length && (
            <p className="px-3 pb-2 text-xs text-ink-3">学校提供的字幕，可能含识别错误。</p>
          )}
          <div
            ref={captionList}
            onWheel={() => setFollow(false)}
            className="max-h-80 min-h-32 flex-1 overflow-y-auto px-3 pb-3 xl:max-h-none"
          >
            {subtitles.map((row, index) => (
              <div
                key={row.startMs + ':' + index}
                ref={row === current ? activeCaption : undefined}
                className={cn('mb-1 rounded-control p-3', row === current && 'bg-hover-2')}
              >
                <div className="mb-1 flex items-center justify-between">
                  <button
                    className="text-xs tabular-nums text-ink-3 hover:text-ink"
                    aria-label={`跳转到 ${formatTime(row.startMs / 1000)}`}
                    onClick={() => seek(row.startMs / 1000)}
                  >
                    {formatTime(row.startMs / 1000)}
                  </button>
                  <button
                    className="text-ink-3 hover:text-ink"
                    aria-label={`引用 ${formatTime(row.startMs / 1000)} 字幕`}
                    onClick={() => {
                      setQuote({ text: row.text, time: row.startMs / 1000 });
                      seek(row.startMs / 1000);
                    }}
                  >
                    <Quote className="size-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words text-13 leading-relaxed text-ink-2">
                  {row.text}
                </p>
              </div>
            ))}
            {media && !subtitles.length && (
              <p className="py-4 text-13 text-ink-3">
                {media.subtitleError ||
                  (media.subtitles.length ? '没有匹配的字幕。' : '学校暂未提供该录像的字幕。')}
              </p>
            )}
          </div>
        </section>
      </section>
      <aside
        aria-label="学习笔记与 AI"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-field"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 text-13 font-medium">
            <BookOpen className="size-4" />
            学习空间
          </div>
          <SegmentedControl options={['笔记', 'AI'] as const} value={view} onChange={setView} />
        </div>
        <div
          className={cn('flex min-h-96 flex-1 flex-col xl:min-h-0', view !== '笔记' && 'hidden')}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span role="status" className="text-xs text-ink-3">
              {saving
                ? '保存中…'
                : saved
                  ? '已保存'
                  : note && text !== note.text
                    ? '尚未保存'
                    : '与本机录像笔记共用'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!note || saving}
              onClick={() => void save()}
            >
              保存笔记
            </Button>
          </div>
          <div className="min-h-80 flex-1 overflow-hidden">
            <MarkdownEditor
              value={text}
              onChange={(value) => {
                setText(value);
                setSaved(false);
                onDirty(value !== note?.text);
              }}
              onSave={() => void save()}
              onScroll={() => {}}
              scroll={0}
              ariaLabel="录像学习笔记"
              lineNumbers={false}
              saveOnBlur={false}
              readOnly={!note || saving}
              extensions={noteExtensions}
            />
          </div>
        </div>
        <div className={cn('flex min-h-96 flex-1 flex-col xl:min-h-0', view !== 'AI' && 'hidden')}>
          <div className="px-4 pb-2">
            <Button size="sm" variant="ghost" onClick={() => ask(true)}>
              引用我的笔记
            </Button>
          </div>
          <WebChat embedded draft={draft} onDraft={onDraft} />
        </div>
      </aside>
    </LearningStudyFrame>
  );
}
