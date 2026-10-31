import { create } from 'zustand';
import type { WebTabState } from '../../../shared/web-tabs';
export const useWebTabs = create<{
  states: Record<string, WebTabState>;
  put(state: WebTabState): void;
}>((set) => ({
  states: {},
  put: (state) => set((current) => ({ states: { ...current.states, [state.tabId]: state } })),
}));
