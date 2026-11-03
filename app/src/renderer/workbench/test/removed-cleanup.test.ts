import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ closeTab: vi.fn() }));
vi.mock('../layout-store', () => ({
  useWorkbenchLayout: {
    getState: () => ({
      root: {
        type: 'group',
        id: 'g1',
        tabs: ['qq:7/100', 'wechat:window', 'note:removed-file'],
        active: 'qq:7/100',
      },
      closeTab: mocks.closeTab,
    }),
  },
}));
vi.mock('../../navigation/view', () => ({
  useNavigationStore: { getState: () => ({ projectId: null }), setState: vi.fn() },
}));
import { purgeRemovedEntries } from '../removed-cleanup';

it('删除资料条目时保留独立的 QQ 与微信窗口标签', () => {
  purgeRemovedEntries(new Set());
  expect(mocks.closeTab.mock.calls).toEqual([['note:removed-file', 'g1']]);
});
