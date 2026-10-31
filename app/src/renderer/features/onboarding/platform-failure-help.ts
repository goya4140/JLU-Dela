import type { PlatformProgress } from './platform-setup';

export function platformFailureHelp(status: Pick<PlatformProgress, 'error' | 'reason'>) {
  if (status.reason === 'auth')
    return {
      title: '需要完成平台认证',
      steps: [
        '点击重试，在 Dela 打开的平台窗口中完成登录或验证码。',
        '完成后等待同步结果；在外部浏览器登录不会直接更新 Dela 的会话。',
      ],
      checkWebsite: true,
    };
  if (/\b403\b/.test(status.error ?? ''))
    return {
      title: '访问被拒绝（403）',
      steps: [
        '先在浏览器打开平台，检查当前网络下是否能正常访问。',
        '网页也无法访问时，按学校要求连接校园网或 VPN，再回到这里重试。',
        '网页可以访问但 Dela 仍报 403 时，请保留错误详情反馈，核对接口权限或适配问题；重复登录未必能解决。',
      ],
      checkWebsite: true,
    };
  if (/超时|网络|无法连接|断网|ERR_(?:NETWORK|INTERNET|CONNECTION)|ECONN/i.test(status.error ?? ''))
    return {
      title: '暂时无法连接平台',
      steps: [
        '在浏览器检查平台是否可访问；校外按学校要求连接 VPN。',
        '网络恢复后点击重试；若平台本身不可用，请稍后再试，无需清除登录记录。',
      ],
      checkWebsite: true,
    };
  if (/结构|格式|解析|无法识别|JSON/i.test(status.error ?? ''))
    return {
      title: '平台数据暂时无法读取',
      steps: [
        '先打开平台查看当前课表或课程，确认学校页面可以正常使用。',
        '稍后重试；若持续失败，请附上错误详情反馈，可能需要更新平台适配。无需反复登录。',
      ],
      checkWebsite: true,
    };
  if (/读取本机同步记录/.test(status.error ?? ''))
    return {
      title: '无法读取本机记录',
      steps: ['退出并重新打开 Dela 后重试；仍失败时请反馈错误详情，不要删除资料或登录记录。'],
      checkWebsite: false,
    };
  return {
    title: '连接未完成',
    steps: [
      '点击重试；若仍失败，可在浏览器打开平台先继续使用。',
      '反馈时附上下方错误详情和发生步骤，不要发送密码、Cookie 或验证码。',
    ],
    checkWebsite: true,
  };
}
