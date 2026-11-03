import type { WechatApi, WechatMirrorApi } from '../shared/wechat';
import { invoke, on } from './lib';

export const wechatMirror = {
  getSupport: () => invoke('wechat:get-support'),
  prepare: () => invoke('wechat:prepare'),
  stop: () => invoke('wechat:stop'),
  openWechat: () => invoke('wechat:open-native'),
  onStop: (listener) => on('wechat:stop', listener),
} satisfies WechatMirrorApi;

export const wechat = {
  getSupport: () => invoke('wechat-chat:get-support'),
  snapshot: (chatIds) => invoke('wechat-chat:snapshot', chatIds),
  authorize: () => invoke('wechat-chat:authorize'),
  select: (chatId) => invoke('wechat-chat:select', chatId),
  send: (input) => invoke('wechat-chat:send', input),
  openSettings: () => invoke('wechat-chat:open-settings'),
} satisfies WechatApi;
