import type { WechatMirrorApi } from '../shared/wechat';
import { invoke, on } from './lib';

export const wechatMirror = {
  getSupport: () => invoke('wechat:get-support'),
  prepare: () => invoke('wechat:prepare'),
  stop: () => invoke('wechat:stop'),
  openWechat: () => invoke('wechat:open-native'),
  onStop: (listener) => on('wechat:stop', listener),
} satisfies WechatMirrorApi;
