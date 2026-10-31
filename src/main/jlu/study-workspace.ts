import { z } from 'zod';
import { newSession } from '../agent/session';
import { getDatabase } from '../database';
import { createWorkspaceEntry } from '../workspace/api';
import { safeFileName } from '../vsjtu/transcript';
import { getRecordings } from './api';

export function studyWorkspace(courseId: string, recordingId: string) {
  const recording = getRecordings(courseId)?.items.find((row) => row.id === recordingId);
  if (!recording) throw new Error('请先同步并选择自己的课程录像');
  const key = `study-workspace:${courseId}:${recordingId}`;
  const db = getDatabase();
  const cached = db.prepare('SELECT data FROM jlu_platform_cache WHERE key=?').get(key) as
    { data: string } | undefined;
  if (cached)
    return z
      .object({ noteId: z.string(), sessionId: z.string().uuid() })
      .parse(JSON.parse(cached.data));
  const note = createWorkspaceEntry({
    parentId: null,
    kind: 'file',
    name: `学习笔记/${safeFileName(recording.name).slice(0, 80)}-${recordingId.slice(-8)}.md`,
    text: `# ${recording.name}\n\n${recording.date} ${recording.time}\n\n`,
  });
  const chat = newSession(null, 'chat', false);
  const data = { noteId: note.id, sessionId: chat.sessionId! };
  db.prepare('INSERT OR REPLACE INTO jlu_platform_cache (key,data) VALUES (?,?)').run(
    key,
    JSON.stringify(data),
  );
  return data;
}
