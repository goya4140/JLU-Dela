import { describe, expect, it } from 'vitest';
import { platformFailureHelp } from './platform-failure-help';

describe('platform failure recovery guidance', () => {
  it('explains 403 with network and website checks rather than claiming expired login', () => {
    const help = platformFailureHelp({
      error: '吉大教务拒绝访问（403），请确认账号权限或校园网/VPN',
    });
    expect(help.title).toBe('访问被拒绝（403）');
    expect(help.steps.join('')).toContain('网页可以访问但 Dela 仍报 403');
    expect(help.steps.join('')).not.toContain('完成登录');
    expect(help.checkWebsite).toBe(true);
  });
  it('only directs platform authentication after a confirmed auth result', () => {
    expect(platformFailureHelp({ reason: 'auth', error: '未完成认证' }).title).toBe(
      '需要完成平台认证',
    );
    expect(platformFailureHelp({ error: '未知接口错误' }).title).toBe('连接未完成');
  });
  it('offers recovery for network, schema and local cache failures', () => {
    expect(platformFailureHelp({ error: '请求超时' }).steps.join('')).toContain('无需清除登录记录');
    expect(platformFailureHelp({ error: '响应结构无法识别' }).steps.join('')).toContain(
      '更新平台适配',
    );
    expect(platformFailureHelp({ error: '无法读取本机同步记录，请重试' }).checkWebsite).toBe(false);
  });
});
