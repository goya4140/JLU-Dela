// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CampusView } from './CampusView';
import { jluServices, jluStudentMail } from '../../../shared/jlu';

const openProject = vi.hoisted(() => vi.fn());
vi.mock('../../navigation/view', () => ({
  useNavigationStore: { getState: () => ({ openProject }) },
}));

it('shows platform integration states and opens the local library', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<CampusView />));
    expect([...host.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      ...jluServices.map((service) => service.url),
      jluStudentMail.url,
    ]);
    expect(
      [...host.querySelectorAll('span')].filter((node) => node.textContent === '同步待接入'),
    ).toHaveLength(0);
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.includes('打开课程资料'))!
        .click(),
    );
    expect(openProject).toHaveBeenCalledWith('');
    await act(async () => root.render(<CampusView title="学校通知" serviceIds={['notices']} />));
    expect(host.querySelector('h1')?.textContent).toBe('学校通知');
    expect([...host.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      jluServices[1].url,
    ]);
    expect([...host.querySelectorAll('span')].some((node) => node.textContent === '已同步')).toBe(
      false,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
