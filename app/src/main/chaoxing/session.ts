import { createCampusSessionStore } from '../campus-session';
export const chaoxingSession = {
  partition: 'persist:chaoxing',
  ...createCampusSessionStore({
    partition: 'persist:chaoxing',
    filename: 'chaoxing-session.bin',
    domain: 'chaoxing.com',
  }),
};
export function isChaoxingLoginUrl(value: string): boolean {
  const url = URL.parse(value);
  return (
    !!url &&
    url.protocol === 'https:' &&
    url.hostname === 'passport2.chaoxing.com' &&
    /^\/(login|mlogin|fanyalogin)/.test(url.pathname)
  );
}
