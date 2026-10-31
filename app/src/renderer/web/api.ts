import type { WebMethod } from '../../shared/web';
export async function connectWeb() {
  const token = new URLSearchParams(location.hash.slice(1)).get('connect');
  if (!token) return;
  const response = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? '连接失败');
  history.replaceState(null, '', location.pathname);
}
export async function webCall<T>(method: WebMethod, args: unknown[] = []): Promise<T> {
  const response = await fetch('/api/invoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? '本机服务请求失败');
  return value.data as T;
}
