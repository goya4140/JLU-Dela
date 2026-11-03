export interface WechatMirrorSupport {
  supported: boolean;
  reason: string;
}

export interface WechatMirrorApi {
  getSupport(): Promise<WechatMirrorSupport>;
  prepare(): Promise<void>;
  stop(): Promise<void>;
  openWechat(): Promise<void>;
  onStop(listener: () => void): () => void;
}
