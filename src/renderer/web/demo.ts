import type { WebMethod } from '../../shared/web';
import type { TodoItem, TodoSaveInput } from '../../shared/todo';
import type { WorkspaceChat } from '../../shared/api';

const stamp = '2026-10-26T00:00:00.000Z';
const today = new Date();
const monday = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate() - ((today.getDay() + 6) % 7),
);
const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
const course = {
  id: 'demo-course',
  name: '计算机网络 · 示例课程',
  courseName: '计算机网络 · 示例课程',
  teacher: '示例教师',
  status: '查看回放目录',
  ended: false,
};
const work = {
  id: 'demo-work',
  title: '网络协议分析 · 示例作业',
  status: '待完成',
  timing: '截止时间以学校平台为准',
  detailTiming: '',
  syncedAt: stamp,
  courseId: course.id,
  courseName: course.name,
  deadline: null,
};
let todos: TodoItem[] = [];
let note =
  '# 计算机网络学习笔记\n\n这是示例笔记，可以试着编辑。\n\n- 协议分层的作用\n- 记录需要进一步理解的问题\n';
let revision = 'a'.repeat(64);
const chats = new Map<string, WorkspaceChat>();
const todoState = () => ({
  items: todos,
  connected: false,
  syncing: false,
  syncedAt: stamp,
  error: null,
});
const calendar = () => ({
  courses: [{ id: course.id, name: course.name, syncedAt: stamp }],
  works: [work],
  coursesSyncedAt: stamp,
});
const folder = {
  courseId: course.id,
  folderId: '',
  name: '课程资料',
  syncedAt: stamp,
  items: [
    {
      id: 'demo-file',
      name: '网络分层与协议.pdf（示例目录）',
      type: 'file',
      size: '1.2 MB',
      creator: '示例教师',
      date: '2026-10-26',
      downloadable: false,
    },
  ],
};
export async function demoCall(method: WebMethod, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'appearance.theme':
      return 'system';
    case 'appearance.fontSize':
      return 16;
    case 'appearance.zoom':
      return 1;
    case 'schedule.state':
      return { semester: '2026-2027-1', semesterStart: date, lastSyncedAt: stamp, totalWeeks: 16 };
    case 'schedule.lessons':
      return [1, 3, 5].map((weekday, index) => ({
        id: index + 1,
        semester: '2026-2027-1',
        courseCode: 'demo-network',
        courseName: course.name,
        className: '示例教学班',
        teacher: course.teacher,
        campus: '示例校区',
        classroom: '示例教室',
        weekday,
        startPeriod: 1,
        endPeriod: 2,
        startMinute: 480,
        endMinute: 575,
        periodsText: '1–2 节',
        weeksText: '1–16 周',
        weekNumbers: Array.from({ length: 16 }, (_, i) => i + 1),
        credits: 3,
        note: null,
      }));
    case 'schedule.sync':
      return { ok: false, error: '公开演示使用示例课表；真实同步请使用本机 Dela。' };
    case 'todo.state':
    case 'todo.refresh':
    case 'todo.read':
      return todoState();
    case 'todo.save': {
      const input = args[0] as TodoSaveInput;
      const previous = todos.find((row) => row.id === input.id);
      const item = {
        ...previous,
        id: input.id ?? crypto.randomUUID(),
        source: 'personal' as const,
        createdAt: previous?.createdAt ?? stamp,
        title: input.title,
        notes: input.notes ?? previous?.notes ?? '',
        dueAt: input.dueAt === undefined ? (previous?.dueAt ?? null) : input.dueAt,
        status:
          input.completed === undefined
            ? (previous?.status ?? 'pending')
            : input.completed
              ? ('completed' as const)
              : ('pending' as const),
        calendar: input.calendar ?? previous?.calendar ?? false,
        color: input.color ?? previous?.color ?? 'slate',
        readAt: stamp,
      };
      todos = [...todos.filter((row) => row.id !== item.id), item];
      return todoState();
    }
    case 'todo.remove':
      todos = todos.filter((row) => row.id !== args[0]);
      return todoState();
    case 'chaoxing.calendar':
      return calendar();
    case 'chaoxing.syncCalendar':
      return { data: calendar(), failures: [] };
    case 'chaoxing.courses':
      return { items: [course], syncedAt: stamp };
    case 'chaoxing.sync':
      return { ok: true, data: { items: [course], syncedAt: stamp } };
    case 'chaoxing.files':
      return folder;
    case 'chaoxing.syncFiles':
      return { ok: true, data: folder };
    case 'chaoxing.works':
      return { courseId: course.id, syncedAt: stamp, items: [work] };
    case 'chaoxing.syncWorks':
      return { ok: true, data: { courseId: course.id, syncedAt: stamp, items: [work] } };
    case 'notices.list':
      return {
        channel: '179577',
        page: 1,
        totalPages: 1,
        syncedAt: stamp,
        items: [
          {
            id: '1',
            channel: '179577',
            title: '图书馆学习空间开放安排（示例通知）',
            department: '示例发布单位',
            published: '2026-10-26',
            pinned: false,
            url: '',
          },
        ],
      };
    case 'notices.sync':
      return { ok: true, data: await demoCall('notices.list', []) };
    case 'notices.cached':
      return null;
    case 'notices.read':
      return {
        ok: true,
        data: {
          id: '1',
          channel: '179577',
          title: '图书馆学习空间开放安排（示例通知）',
          metadata: '合成示例 · 非学校实际通知',
          text: '这里展示通知正文的阅读方式。所有内容均为演示，不代表学校实际安排。',
          attachments: [],
          url: '',
          syncedAt: stamp,
        },
      };
    case 'learning.courses':
      return {
        termId: 'demo-term',
        terms: [
          { id: 'demo-term', year: '2026-2027', num: '1', name: '秋季（示例）', selected: true },
        ],
        courses: [course],
        syncedAt: stamp,
      };
    case 'learning.sync':
      return { ok: true, data: await demoCall('learning.courses', []) };
    case 'learning.recordings':
      return {
        courseId: course.id,
        items: [
          {
            id: 'demo-video',
            resourceId: 'demo',
            name: '课程学习演示 · 非真实教学录像',
            date: '2026-10-26',
            time: '08:00',
            room: '示例教室',
            status: '可播放',
          },
        ],
        syncedAt: stamp,
      };
    case 'learning.syncRecordings':
      return { ok: true, data: await demoCall('learning.recordings', []) };
    case 'learning.media':
      return {
        ok: true,
        data: {
          streams: [
            { name: '演示画面', playbackUrl: new URL('demo-video.webm', location.href).href },
          ],
          subtitles: [
            { startMs: 0, endMs: 4000, text: '示例字幕：用分层结构理解网络协议。' },
            {
              startMs: 4000,
              endMs: 9000,
              text: '示例字幕：可以选择片段、记笔记，再整理自己的问题。',
            },
          ],
          subtitleError: '演示字幕与替代视频均为展示用途，非真实课堂内容。',
        },
      };
    case 'learning.note':
      return { id: 'a'.repeat(48), title: '示例学习笔记', text: note, revision };
    case 'learning.saveNote':
      if (args[2] !== revision) throw new Error('笔记已变化，请重新打开演示录像');
      note = String(args[1]);
      revision = crypto.randomUUID().replaceAll('-', '').repeat(2);
      return { id: 'a'.repeat(48), title: '示例学习笔记', text: note, revision };
    case 'model.list':
      return [];
    case 'chat.list':
      return [...chats.values()].map((chat) => ({ id: chat.sessionId, title: '演示对话' }));
    case 'chat.create': {
      const id = crypto.randomUUID();
      const chat = {
        sessionId: id,
        projectId: null,
        cwd: null,
        configured: false,
        model: '',
        providerName: null,
        running: false,
        messages: [],
      } as unknown as WorkspaceChat;
      chats.set(id, chat);
      return chat;
    }
    case 'chat.open': {
      const chat = chats.get(String(args[0]));
      if (!chat) throw new Error('演示对话不存在');
      return chat;
    }
    case 'chat.ask':
    case 'chat.model':
      throw new Error('公开演示不调用 AI 服务。请在本机 Dela 中配置模型。');
    case 'chat.cancel':
      return;
    default:
      throw new Error('此功能需要本机 Dela，公开演示暂不提供。');
  }
}
