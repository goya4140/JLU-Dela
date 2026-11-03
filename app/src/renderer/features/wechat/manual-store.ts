import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';

export const fileTransferChat = { id: 'file-transfer', name: '文件传输助手' };
const saved = z.object({
  groups: z.array(z.object({ id: z.string(), name: z.string() })),
  drafts: z.record(z.string(), z.string()),
});

export const useManualWechat = create<{
  groups: { id: string; name: string }[];
  drafts: Record<string, string>;
  addGroups(names: string[]): string;
  draft(id: string, text: string): void;
}>()(
  persist(
    (set, get) => ({
      groups: [],
      drafts: {},
      addGroups: (names) => {
        const values = z.array(z.string().trim().min(1).max(100)).min(1).max(100).parse(names);
        const groups = [...get().groups];
        let first = '';
        for (const name of values) {
          let group = groups.find((item) => item.name === name);
          if (!group) {
            group = { id: `group:${crypto.randomUUID()}`, name };
            groups.push(group);
          }
          first ||= group.id;
        }
        set({ groups });
        return first;
      },
      draft: (id, text) => set((state) => ({ drafts: { ...state.drafts, [id]: text } })),
    }),
    {
      name: 'dela.wechat.manual',
      partialize: ({ groups, drafts }) => ({ groups, drafts }),
      merge: (value, state) => {
        const result = saved.safeParse(value);
        return result.success ? { ...state, ...result.data } : state;
      },
    },
  ),
);
