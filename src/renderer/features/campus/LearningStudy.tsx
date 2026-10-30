import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, MessageSquare, Quote, RefreshCw, Search } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import type { JluCourse, JluRecording, JluStudyMedia } from '../../../shared/jlu-platforms';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { SegmentedControl } from '../../components/ui/beautifului/atoms/SegmentedControl';
import { MarkdownEditor } from '../../content/note/MarkdownEditor';
import { useNoteDrafts } from '../../content/note/drafts';
import { ChatTab } from '../../content/chat/ChatTab';
import { ChatTabSourceProvider } from '../../content/chat/chat-source';
import { useChatDrafts } from '../../content/chat/drafts';
import { errorText } from '../../workspace/store';
import { cn } from '../../lib/utils';
import { formatTime } from '../classroom/player-format';
import {
  clearPlaybackProgress,
  readPlaybackProgress,
  resumePlaybackTime,
  savePlaybackProgress,
} from '../classroom/progress';

export function studyQuestion(title: string, time: number, excerpt: string, source = '课堂字幕') {
  return `我正在学习《${title}》，播放位置 ${formatTime(time)}。\n${
    excerpt
      ? `参考${source}（内容可能不完整）：\n${excerpt
          .slice(0, 6000)
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')}`
      : '当前没有提供字幕，请不要推测视频中讲了什么。'
  }\n\n我的问题：`;
}
const noteExtensions = [EditorView.lineWrapping];

export function LearningStudy({
  course,
  recording,
  onBack,
}: {
  course: JluCourse;
  recording: JluRecording;
  onBack: () => void;
}) {
  const api = window.dela!.jluPlatforms;
  const [media, setMedia] = useState<JluStudyMedia | null>(null);
  const [tools, setTools] = useState<{ noteId: string; sessionId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<'笔记' | 'AI'>('笔记');
  const [time, setTime] = useState(0);
  const [stream, setStream] = useState(0);
  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState<{ text: string; time: number } | null>(null);
  const [follow, setFollow] = useState(true);
  const [playError, setPlayError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const captionList = useRef<HTMLDivElement>(null);
  const activeCaption = useRef<HTMLDivElement>(null);
  const positionKey = `jlu:${course.id}:${recording.id}`;
  const savedAt = useRef(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPlayError(false);
    void api
      .studyMedia(course.id, recording.id)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setMedia(result.data);
          setStream(0);
        } else setError(result.error);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, course.id, recording.id, retry]);
  useEffect(() => {
    let active = true;
    void api
      .studyWorkspace(course.id, recording.id)
      .then((value) => {
        if (active) setTools(value);
      })
      .catch((cause) => {
        if (active) setWorkspaceError(errorText(cause));
      });
    return () => {
      active = false;
    };
  }, [api, course.id, recording.id]);
  const chatSource = useMemo(
    () => ({
      onSaveNote: (text: string) => {
        if (!tools) return;
        const draft = useNoteDrafts.getState().drafts[tools.noteId];
        if (draft) useNoteDrafts.getState().edit(tools.noteId, `${draft.text}\n\n${text}\n`);
      },
    }),
    [tools],
  );
  const current = media?.subtitles.find(
    (row) => row.startMs <= time * 1000 && row.endMs > time * 1000,
  );
  const subtitles =
    media?.subtitles.filter((row) =>
      row.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [];
  useEffect(() => {
    const panel = captionList.current,
      row = activeCaption.current;
    if (follow && !query && panel && row)
      panel.scrollTo({
        top: panel.scrollTop + row.getBoundingClientRect().top - panel.getBoundingClientRect().top,
        behavior: 'smooth',
      });
  }, [current?.startMs, follow, query]);
  useEffect(() => {
    const element = video.current;
    if (!element || !media || loading || !media.subtitles.length) return;
    const track = element.addTextTrack('subtitles', '学校字幕', 'zh-CN');
    for (const row of media.subtitles)
      track.addCue(new VTTCue(row.startMs / 1000, row.endMs / 1000, row.text));
    track.mode = 'showing';
    return () => {
      track.mode = 'disabled';
      while (track.cues?.length) track.removeCue(track.cues[0]!);
    };
  }, [media, stream, loading]);
  function seek(seconds: number) {
    if (!video.current) return;
    video.current.currentTime = seconds;
    setTime(seconds);
  }
  function ask(notes = false) {
    if (!tools) return;
    const drafts = useChatDrafts.getState();
    const previous = drafts.drafts[tools.sessionId]?.prompt ?? '';
    const excerpt = notes
      ? (useNoteDrafts.getState().drafts[tools.noteId]?.text ?? '')
      : quote?.text || current?.text || '';
    const context = studyQuestion(
      recording.name,
      notes ? time : (quote?.time ?? time),
      excerpt,
      notes ? '我的笔记' : '课堂字幕',
    );
    drafts.update(tools.sessionId, { prompt: previous ? `${previous}\n\n${context}` : context });
    setView('AI');
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-surface">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          返回目录
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-ink">
            {course.courseName || course.name}
          </h1>
          <p className="truncate text-xs text-ink-3">{recording.name}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => setRetry((value) => value + 1)}
          aria-label="重新加载录像"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </header>
      <div className="grid shrink-0 gap-4 px-4 pb-4 md:px-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="视频与字幕" className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black">
            {media && !loading && (
              <video
                key={media.streams[stream]?.playbackUrl}
                ref={video}
                className="size-full"
                controls
                playsInline
                preload="metadata"
                aria-label="课程录像"
                src={media.streams[stream]?.playbackUrl}
                onLoadedMetadata={(event) => {
                  const element = event.currentTarget;
                  const resume = resumePlaybackTime(
                    readPlaybackProgress(positionKey),
                    element.duration,
                  );
                  if (resume !== null) {
                    element.currentTime = resume;
                    setTime(resume);
                  }
                }}
                onTimeUpdate={(event) => {
                  const seconds = event.currentTarget.currentTime;
                  setTime(seconds);
                  if (Math.abs(seconds - savedAt.current) >= 5) {
                    savePlaybackProgress(positionKey, seconds);
                    savedAt.current = seconds;
                  }
                }}
                onPause={(event) =>
                  savePlaybackProgress(positionKey, event.currentTarget.currentTime)
                }
                onEnded={() => clearPlaybackProgress(positionKey)}
                onError={() => setPlayError(true)}
              />
            )}
            {loading && <p className="text-sm text-white">正在载入录像…</p>}
            {!loading && error && (
              <p role="alert" className="max-w-md px-6 text-center text-sm text-white">
                {error}
              </p>
            )}
            {!loading && !error && playError && (
              <div className="absolute inset-0 grid place-items-center bg-black/80 px-6 text-center text-sm text-white">
                视频暂时无法播放，请点击右上角重新加载。
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {media?.streams.map((item, index) => (
                <Button
                  key={item.playbackUrl}
                  size="sm"
                  variant={index === stream ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setStream(index);
                    setPlayError(false);
                  }}
                >
                  {item.name}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" disabled={!tools} onClick={() => ask()}>
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
          <section
            className="flex min-h-0 flex-1 flex-col rounded-xl bg-field"
            aria-label="课堂字幕"
          >
            <div className="flex flex-wrap items-center gap-3 p-3">
              <h2 className="text-13 font-medium text-ink">字幕</h2>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={follow}
                onClick={() => setFollow((value) => !value)}
              >
                {follow ? '正在跟随' : '跟随播放'}
              </Button>
              <div className="relative ml-auto w-full sm:w-auto">
                <Search className="absolute left-2 top-2 size-3.5 text-ink-3" />
                <Input
                  aria-label="搜索课堂字幕"
                  className="pl-7"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索字幕"
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
              {media?.subtitleError && (
                <p role="status" className="py-4 text-13 text-ink-3">
                  {media.subtitleError}
                </p>
              )}
              {!loading && media && !media.subtitleError && !media.subtitles.length && (
                <p className="py-4 text-13 text-ink-3">
                  学校暂未提供该录像的字幕。你仍可以记笔记，并按时间点提问。
                </p>
              )}
              {subtitles.map((row, index) => (
                <div
                  key={`${row.startMs}-${index}`}
                  ref={row === current ? activeCaption : undefined}
                  className={cn('mb-1 rounded-control p-3', row === current && 'bg-hover-2')}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      className="text-xs tabular-nums text-ink-3 hover:text-ink"
                      onClick={() => seek(row.startMs / 1000)}
                      aria-label={`跳转到 ${formatTime(row.startMs / 1000)}`}
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
                  <p
                    className="whitespace-pre-wrap break-words text-13 leading-relaxed text-ink-2"
                    onMouseUp={() => {
                      const selection = window.getSelection()?.toString().trim();
                      if (selection) setQuote({ text: selection, time: row.startMs / 1000 });
                    }}
                  >
                    {row.text}
                  </p>
                </div>
              ))}
              {!!media?.subtitles.length && !subtitles.length && (
                <p className="py-4 text-13 text-ink-3">没有匹配的字幕。</p>
              )}
            </div>
          </section>
        </section>
        <aside
          aria-label="学习笔记与 AI"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-field"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-2 text-13 font-medium text-ink">
              <BookOpen className="size-4" />
              学习空间
            </div>
            <SegmentedControl options={['笔记', 'AI'] as const} value={view} onChange={setView} />
          </div>
          {workspaceError && (
            <p role="alert" className="p-4 text-13 text-ink-3">
              {workspaceError}
            </p>
          )}
          {!tools && !workspaceError && <p className="p-4 text-13 text-ink-3">正在打开学习笔记…</p>}
          {tools && (
            <>
              <div
                className={cn(
                  'flex min-h-96 flex-1 flex-col xl:min-h-0',
                  view !== '笔记' && 'hidden',
                )}
              >
                <StudyNote noteId={tools.noteId} time={time} />
              </div>
              <div
                className={cn(
                  'flex min-h-96 flex-1 flex-col xl:min-h-0',
                  view !== 'AI' && 'hidden',
                )}
              >
                <p className="px-4 pb-2 text-xs text-ink-3">
                  {quote
                    ? '已选中字幕片段。点击「引用当前片段」加入提问。'
                    : '引用字幕或笔记后提问；内容在发送时交给你配置的模型。'}
                </p>
                <div className="px-4 pb-2">
                  <Button size="sm" variant="ghost" onClick={() => ask(true)}>
                    引用我的笔记
                  </Button>
                </div>
                <ChatTabSourceProvider source={chatSource}>
                  <ChatTab tabId={`chat:${tools.sessionId}`} groupId="jlu-study" embedded />
                </ChatTabSourceProvider>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function StudyNote({ noteId, time }: { noteId: string; time: number }) {
  const draft = useNoteDrafts((state) => state.drafts[noteId]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void useNoteDrafts
      .getState()
      .acquire(noteId)
      .catch((cause) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
      void useNoteDrafts.getState().release(noteId);
    };
  }, [noteId]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <span role="status" className="text-xs text-ink-3">
          {error ||
            draft?.error ||
            (draft?.saving
              ? '保存中…'
              : draft && draft.text !== draft.saved
                ? '尚未保存'
                : '自动保存到学习笔记')}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!draft}
          onClick={() => {
            const current = useNoteDrafts.getState().drafts[noteId];
            if (current)
              useNoteDrafts.getState().edit(noteId, `${current.text}\n\n[${formatTime(time)}] \n`);
          }}
        >
          插入时间点
        </Button>
      </div>
      {draft && (
        <MarkdownEditor
          ariaLabel="课程学习笔记"
          value={draft.text}
          onChange={(text) => useNoteDrafts.getState().edit(noteId, text)}
          onSave={() => void useNoteDrafts.getState().save(noteId)}
          onScroll={() => {}}
          scroll={0}
          lineNumbers={false}
          editorStateKey={`jlu-study:${noteId}`}
          livePreview={(src) => src}
          extensions={noteExtensions}
        />
      )}
    </>
  );
}
