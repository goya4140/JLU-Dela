// 课堂课件：用户在观课时手动导入的 PPT / PDF，登记在 jlu_platform_cache，
// 文件复制进工作区「课堂课件/<录像名>」目录，可随时打开或交给 AI 讲解。
import { existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { getDatabase } from '../database';
import { createWorkspaceEntry, getWorkspaceState, importWorkspaceFiles } from '../workspace/api';
import { safeFileName } from '../vsjtu/transcript';
import type { JluStudyMaterial } from '../../shared/jlu-platforms';
import { getRecordings } from './api';

/** 观课时可导入的课件类型：能预览的办公文档与讲义 PDF。 */
export const studyMaterialExtensions = ['.pdf', '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls'];

const materialsSchema = z.array(
  z.object({ entryId: z.string().min(1), name: z.string().min(1), addedAt: z.string() }),
);

const cacheKey = (courseId: string, recordingId: string) =>
  `study-materials:${courseId}:${recordingId}`;

export function studyMaterials(courseId: string, recordingId: string): JluStudyMaterial[] {
  const row = getDatabase()
    .prepare('SELECT data FROM jlu_platform_cache WHERE key=?')
    .get(cacheKey(courseId, recordingId)) as { data: string } | undefined;
  if (!row) return [];
  try {
    return materialsSchema.parse(JSON.parse(row.data));
  } catch {
    // 缓存损坏按空处理，不影响观课；重新导入会覆盖。
    return [];
  }
}

/** 工作区里的「课堂课件/<录像名>」目录 id；不存在时创建。 */
function materialFolder(courseId: string, recordingId: string): string {
  const recording = getRecordings(courseId)?.items.find((row) => row.id === recordingId);
  if (!recording) throw new Error('请先同步并选择自己的课程录像');
  const entries = getWorkspaceState().entries;
  const rootName = '课堂课件';
  const root =
    entries.find(
      (row) => row.parentId === null && row.kind === 'folder' && row.name === rootName,
    ) ?? createWorkspaceEntry({ parentId: null, kind: 'folder', name: rootName });
  const name = safeFileName(recording.name).slice(0, 60) || recordingId.slice(-8);
  const folderName = `${name}-${recordingId.slice(-8)}`;
  const child =
    entries.find(
      (row) => row.parentId === root.id && row.kind === 'folder' && row.name === folderName,
    ) ?? createWorkspaceEntry({ parentId: root.id, kind: 'folder', name: folderName });
  return child.id;
}

export function importStudyMaterials(
  courseId: string,
  recordingId: string,
  paths: readonly string[],
): JluStudyMaterial[] {
  if (!paths.length) return studyMaterials(courseId, recordingId);
  for (const source of paths) {
    if (!studyMaterialExtensions.includes(extname(source).toLowerCase()))
      throw new Error('只支持 PDF、PowerPoint、Word 与 Excel 课件');
    if (!existsSync(source)) throw new Error('课件文件已不存在，请重新选择');
  }
  const folderId = materialFolder(courseId, recordingId);
  const added = importWorkspaceFiles(folderId, [...paths]).map((entry, index) => ({
    entryId: entry.id,
    name: basename(paths[index]!),
    addedAt: new Date().toISOString(),
  }));
  const materials = [...studyMaterials(courseId, recordingId), ...added];
  getDatabase()
    .prepare('INSERT OR REPLACE INTO jlu_platform_cache (key,data) VALUES (?,?)')
    .run(cacheKey(courseId, recordingId), JSON.stringify(materials));
  return materials;
}

/** 只取消登记，工作区里的文件保留，避免误删用户自己的课件。 */
export function removeStudyMaterial(
  courseId: string,
  recordingId: string,
  entryId: string,
): JluStudyMaterial[] {
  const materials = studyMaterials(courseId, recordingId).filter((row) => row.entryId !== entryId);
  getDatabase()
    .prepare('INSERT OR REPLACE INTO jlu_platform_cache (key,data) VALUES (?,?)')
    .run(cacheKey(courseId, recordingId), JSON.stringify(materials));
  return materials;
}
