import type { WebTabsApi, WebTabBounds, WebTabCommand, WebTabState } from '../shared/web-tabs';
import { invoke, on } from './lib';
export const webTabs = {
  place: (id: string, bounds: WebTabBounds) => invoke('web-tabs:place', id, bounds),
  hide: (id: string) => invoke('web-tabs:hide', id),
  command: (id: string, command: WebTabCommand) => invoke('web-tabs:command', id, command),
  close: (id: string) => invoke('web-tabs:close', id),
  selection: (id: string) => invoke('web-tabs:selection', id),
  onState: (listener: (state: WebTabState) => void) => on('web-tabs:state', listener),
  onFocus: (listener: (id: string) => void) => on('web-tabs:focus', listener),
  onCloseShortcut: (listener: (id: string) => void) => on('web-tabs:close-shortcut', listener),
} satisfies WebTabsApi;
