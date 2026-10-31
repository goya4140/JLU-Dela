import { z } from 'zod';
import type { TabId } from './layout';

const platformId = z.string().regex(/^[A-Za-z0-9:_-]{1,180}$/);
export const workTargetSchema = z.object({ courseId: platformId, workId: platformId }).strict();
export type WorkTarget = z.infer<typeof workTargetSchema>;
export function workTabId(target: WorkTarget): TabId {
  return `web:chaoxing/${target.courseId}/${target.workId}`;
}
export function workTargetOf(tabId: string): WorkTarget | null {
  const match = /^web:chaoxing\/([A-Za-z0-9:_-]{1,180})\/([A-Za-z0-9:_-]{1,180})$/.exec(tabId);
  return match ? { courseId: match[1]!, workId: match[2]! } : null;
}
export const webTabIdSchema = z.string().refine((value) => workTargetOf(value) !== null);
export const webTabBoundsSchema = z
  .object({
    x: z.number().finite().min(0).max(100000),
    y: z.number().finite().min(0).max(100000),
    width: z.number().finite().min(0).max(100000),
    height: z.number().finite().min(0).max(100000),
  })
  .strict();
export type WebTabBounds = z.infer<typeof webTabBoundsSchema>;
export const webTabCommandSchema = z.enum([
  'back',
  'forward',
  'reload',
  'recover',
  'external',
  'timing',
]);
export type WebTabCommand = z.infer<typeof webTabCommandSchema>;
export interface WebTabState {
  tabId: string;
  title: string;
  origin: string;
  loading: boolean;
  back: boolean;
  forward: boolean;
  error: string | null;
  timing: string | null;
}
export interface WebTabsApi {
  place(tabId: string, bounds: WebTabBounds): Promise<WebTabState>;
  hide(tabId: string): Promise<void>;
  command(tabId: string, command: WebTabCommand): Promise<WebTabState>;
  close(tabId: string): Promise<boolean>;
  selection(tabId: string): Promise<string>;
  onState(listener: (state: WebTabState) => void): () => void;
  onFocus(listener: (tabId: string) => void): () => void;
  onCloseShortcut(listener: (tabId: string) => void): () => void;
}
