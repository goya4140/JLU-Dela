import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Download, FileText, Folder, RefreshCw, Search } from 'lucide-react';
import type {
  ChaoxingCourse,
  ChaoxingCourses,
  ChaoxingFolder,
  ChaoxingWorks,
  ChaoxingApi,
} from '../../../shared/chaoxing';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { SegmentedControl } from '../../components/ui/beautifului/atoms/SegmentedControl';
import { DesktopOnlyNotice } from '../../components/ui/desktop-only-notice';
import { useNavigationStore } from '../../navigation/view';
import { errorText } from '../../workspace/store';

export type ChaoxingPageApi = Omit<ChaoxingApi, 'importFile' | 'calendar' | 'syncCalendar'> &
  Partial<Pick<ChaoxingApi, 'importFile'>>;
export function ChaoxingView({ api = window.dela?.chaoxing }: { api?: ChaoxingPageApi } = {}) {
  return api ? (
    <ChaoxingPage api={api} />
  ) : (
    <DesktopOnlyNotice title="学习通" description="请在桌面应用中登录并同步课程资料与作业。" />
  );
}
function ChaoxingPage({ api }: { api: ChaoxingPageApi }) {
  const [data, setData] = useState<ChaoxingCourses | null>(null);
  const [course, setCourse] = useState<ChaoxingCourse | null>(null);
  const [files, setFiles] = useState<ChaoxingFolder | null>(null);
  const [works, setWorks] = useState<ChaoxingWorks | null>(null);
  const [tab, setTab] = useState<'资料' | '作业'>('资料');
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api
      .courses()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
    };
  }, [api]);
  async function syncCourses() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.syncCourses();
      if (result.ok) setData(result.data);
      else setError(result.error);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function loadFiles(next: ChaoxingCourse, nextPath: { id: string; name: string }[]) {
    setBusy(true);
    setError(null);
    setPath(nextPath);
    const folderId = nextPath.at(-1)?.id;
    try {
      setFiles(await api.files(next.id, folderId));
      const result = await api.syncFiles(next.id, folderId);
      if (result.ok) setFiles(result.data);
      else setError(result.error);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function loadWorks(next: ChaoxingCourse) {
    setBusy(true);
    setError(null);
    try {
      setWorks(await api.works(next.id));
      const result = await api.syncWorks(next.id);
      if (result.ok) setWorks(result.data);
      else setError(result.error);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(fileId: string) {
    if (!course || !api.importFile) return;
    setBusy(true);
    setError(null);
    try {
      const file = await api.importFile(course.id, path.at(-1)?.id ?? '', fileId);
      useNavigationStore.getState().openDocument(file.id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const filtered =
    data?.items.filter((row) =>
      `${row.name} ${row.teacher}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [];
  const snapshot = course ? (tab === '资料' ? files : works) : data;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-8 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-ink-3" />
              <h1 className="text-xl font-semibold text-ink">学习通</h1>
            </div>
            <p className="mt-1 text-xs text-ink-3">
              {snapshot
                ? `更新于 ${new Date(snapshot.syncedAt).toLocaleString('zh-CN')}`
                : '尚未同步'}
            </p>
          </div>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void (course
                ? tab === '资料'
                  ? loadFiles(course, path)
                  : loadWorks(course)
                : syncCourses())
            }
          >
            <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
            {busy ? '正在读取…' : data ? '刷新' : '登录并同步'}
          </Button>
        </header>
        {error && (
          <p role="alert" className="rounded-control bg-field p-3 text-13 text-ink">
            {error}
          </p>
        )}
        {!course ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-2 size-4 text-ink-3" />
              <Input
                aria-label="筛选学习通课程"
                placeholder="搜索课程或教师"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            {!data && (
              <p className="py-12 text-center text-sm text-ink-3">
                登录学习通，读取课程中的资料和作业。需要验证时会显示学习通登录窗口。
              </p>
            )}
            {data && (
              <>
                <p className="text-xs text-ink-3">当前课程列表 · {data.items.length} 门</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {filtered.map((row) => (
                    <button
                      key={row.id}
                      disabled={busy}
                      className="grid min-w-0 gap-2 rounded-xl bg-field p-5 text-left hover:bg-hover disabled:opacity-50"
                      onClick={() => {
                        setCourse(row);
                        setFiles(null);
                        setWorks(null);
                        setTab('资料');
                        void loadFiles(row, []);
                      }}
                    >
                      <h2 className="break-words text-base font-semibold text-ink">{row.name}</h2>
                      <p className="break-words text-13 text-ink-3">{row.teacher}</p>
                      <span className="text-xs text-ink-3">
                        {row.ended ? '已结束课程' : '查看资料与作业'}
                      </span>
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <p className="text-13 text-ink-3">
                    {data.items.length ? '没有匹配的课程。' : '学校当前列表未返回课程。'}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setCourse(null);
                  setPath([]);
                  setError(null);
                }}
              >
                <ArrowLeft className="size-4" />
                返回课程
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold text-ink">{course.name}</h2>
                <p className="mt-1 text-xs text-ink-3">{course.teacher}</p>
              </div>
              <fieldset disabled={busy}>
                <SegmentedControl
                  options={['资料', '作业'] as const}
                  value={tab}
                  onChange={(value) => {
                    setTab(value);
                    void (value === '资料' ? loadFiles(course, []) : loadWorks(course));
                  }}
                />
              </fieldset>
            </div>
            {tab === '资料' ? (
              <>
                <nav
                  aria-label="学习通资料目录"
                  className="flex flex-wrap items-center gap-1 text-xs text-ink-3"
                >
                  <button
                    disabled={busy}
                    className="rounded-control px-2 py-1 hover:bg-hover"
                    onClick={() => void loadFiles(course, [])}
                  >
                    课程资料
                  </button>
                  {path.map((part, index) => (
                    <span key={part.id}>
                      /{' '}
                      <button
                        disabled={busy}
                        className="rounded-control px-2 py-1 hover:bg-hover"
                        onClick={() => void loadFiles(course, path.slice(0, index + 1))}
                      >
                        {part.name}
                      </button>
                    </span>
                  ))}
                </nav>
                {files?.items.map((row) => (
                  <div
                    key={row.id}
                    className="flex min-w-0 flex-wrap items-center gap-3 rounded-control bg-field p-4"
                  >
                    {row.type === 'afolder' ? (
                      <Folder className="size-5 shrink-0 text-ink-3" />
                    ) : (
                      <FileText className="size-5 shrink-0 text-ink-3" />
                    )}
                    <div className="min-w-0 flex-1">
                      {row.type === 'afolder' ? (
                        <button
                          className="break-words text-left text-sm font-medium text-ink hover:underline"
                          disabled={busy}
                          onClick={() =>
                            void loadFiles(course, [...path, { id: row.id, name: row.name }])
                          }
                        >
                          {row.name}
                        </button>
                      ) : (
                        <h3 className="break-words text-sm font-medium text-ink">{row.name}</h3>
                      )}
                      <p className="mt-1 text-xs text-ink-3">
                        {row.type === 'tch-courseware'
                          ? '特殊教师课件入口，暂未适配'
                          : [row.size, row.creator, row.date].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {row.type !== 'afolder' && row.type !== 'tch-courseware' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || !row.downloadable || !api.importFile}
                        onClick={() => void importFile(row.id)}
                      >
                        <Download className="size-3.5" />
                        {!api.importFile
                          ? '在桌面端导入'
                          : row.downloadable
                            ? '导入并打开'
                            : '未开放下载'}
                      </Button>
                    )}
                  </div>
                ))}
                {files && !files.items.length && (
                  <p className="py-8 text-13 text-ink-3">当前目录暂无资料。</p>
                )}
                <p className="text-xs leading-relaxed text-ink-3">
                  {api.importFile
                    ? '按需读取当前目录。导入的文件保存在本机「学习通资料」，可在资料工作台阅读和引用。'
                    : '资料下载与导入请使用本机 Dela。'}
                </p>
              </>
            ) : (
              <>
                {works?.items.map((row) => (
                  <article key={row.id} className="grid gap-2 rounded-control bg-field p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 break-words text-sm font-medium text-ink">
                        {row.title}
                      </h3>
                      <span className="text-xs text-ink-3">{row.status}</span>
                    </div>
                    {row.timing && <p className="text-xs text-ink-3">{row.timing}</p>}
                  </article>
                ))}
                {works && !works.items.length && (
                  <p className="py-8 text-13 text-ink-3">当前列表暂无作业。</p>
                )}
                <p className="text-xs leading-relaxed text-ink-3">
                  作业状态与时间提示来自同步时的学校页面。作答和提交请使用学习通。
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
