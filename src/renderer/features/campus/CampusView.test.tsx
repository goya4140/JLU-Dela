// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CampusView } from './CampusView';
import { jluServices } from '../../../shared/jlu';

const openProject = vi.hoisted(() => vi.fn());
vi.mock('../../navigation/view', () => ({
  useNavigationStore: { getState: () => ({ openProject }) },
}));

it('shows verified platform links with pending status and opens the local library', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<CampusView />));
    expect([...host.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(
      jluServices.map((service) => service.url),
    );
    expect(
      [...host.querySelectorAll('span')].filter((node) => node.textContent === '同步待接入'),
    ).toHaveLength(3);
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(openProject).toHaveBeenCalledWith('');
    await act(async () => root.render(<CampusView title="学校通知" serviceIds={['notices']} />));
    expect(host.querySelector('h1')?.textContent).toBe('学校通知');
    expect([...host.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      jluServices[1].url,
    ]);
    expect(host.textContent).not.toContain('已同步');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
