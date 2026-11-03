import { beforeEach, expect, it, vi } from 'vitest';

const values = new Map<string, string>();
vi.stubGlobal('window', {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});
const { useManualWechat } = await import('./manual-store');

beforeEach(() => {
  values.clear();
  useManualWechat.setState({ groups: [], drafts: {} });
});

it('同名群入口去重，各群草稿在切换和重新加载后保持独立', async () => {
  const first = useManualWechat.getState().addGroups([' JLU-Dela ', '课程群', 'JLU-Dela']);
  const groups = useManualWechat.getState().groups;
  expect(groups.map((group) => group.name)).toEqual(['JLU-Dela', '课程群']);
  expect(useManualWechat.getState().addGroups(['JLU-Dela'])).toBe(first);
  useManualWechat.getState().draft(first, '第一群草稿');
  useManualWechat.getState().draft(groups[1]!.id, '另一群草稿');
  const stored = values.get('dela.wechat.manual')!;
  useManualWechat.setState({ groups: [], drafts: {} });
  values.set('dela.wechat.manual', stored);
  await useManualWechat.persist.rehydrate();
  expect(useManualWechat.getState().groups).toEqual(groups);
  expect(useManualWechat.getState().drafts).toEqual({
    [first]: '第一群草稿',
    [groups[1]!.id]: '另一群草稿',
  });
});
