import { useActionState, useEffect, useState } from 'react';
import type { WechatApi } from '../../../shared/wechat';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { errorText } from '../../workspace/store';

export function ManualWechatReply({
  api,
  chat,
  text,
  onTextChange,
  onLockChange,
}: {
  api: WechatApi;
  chat: { id: string; name: string };
  text: string;
  onTextChange(text: string): void;
  onLockChange(locked: boolean): void;
}) {
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  useEffect(
    () => () => {
      void api.cancelManualReply().catch(console.error);
    },
    [api],
  );
  const [error, action, pending] = useActionState(
    async () => {
      onLockChange(true);
      try {
        if (token) {
          const current = token;
          setToken(null);
          setVerified(false);
          setAwaitingReceipt(true);
          await api.submitManualReply({ chatId: chat.id, token: current });
        } else {
          const value = await api.prepareManualReply({ chatId: chat.id, text });
          setToken(value.token);
          setReady(false);
        }
        return null;
      } catch (cause) {
        if (!token) onLockChange(false);
        return errorText(cause);
      }
    },
    null as string | null,
  );
  return (
    <section
      aria-label={`${chat.name}兼容发送`}
      className="w-full max-w-2xl space-y-4 rounded-card bg-page p-5 text-left"
    >
      <div className="space-y-2">
        <h2 className="break-words text-base font-semibold">{chat.name}</h2>
        <p className="text-13 leading-relaxed text-ink-3">
          手动核对模式 · 当前无法自动读取接收方、草稿和发送结果。
        </p>
      </div>
      <form action={action} className="space-y-3">
        <Textarea
          aria-label={`${chat.name}消息内容`}
          placeholder="输入单行文字"
          maxLength={1000}
          value={text}
          disabled={pending || Boolean(token) || awaitingReceipt}
          onChange={(event) => {
            onTextChange(event.target.value);
            setReady(false);
          }}
        />
        {awaitingReceipt ? (
          <p role="status" className="text-13 leading-relaxed">
            发送操作已结束，结果尚未确认。请在原微信检查是否收到这条消息。
          </p>
        ) : token ? (
          <>
            <p role="status" className="text-13">
              已提交文字输入操作，请在原微信核对后再发送。
            </p>
            <label className="flex items-start gap-2 text-13 leading-relaxed">
              <input
                type="checkbox"
                className="mt-1"
                checked={verified}
                disabled={pending}
                onChange={(event) => setVerified(event.target.checked)}
              />
              我已核对：接收方为「{chat.name}」，完整草稿与上文一致，且没有附件。
            </label>
          </>
        ) : (
          <label className="flex items-start gap-2 text-13 leading-relaxed">
            <input
              type="checkbox"
              className="mt-1"
              checked={ready}
              disabled={pending}
              onChange={(event) => setReady(event.target.checked)}
            />
            我已在原微信打开「{chat.name}」，并点击空白输入框。
          </label>
        )}
        {error && (
          <p role="alert" className="break-words text-13 text-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {token && (
            <Button
              variant="ghost"
              type="button"
              disabled={pending}
              onClick={() => {
                void api.cancelManualReply().catch(console.error);
                setToken(null);
                setVerified(false);
                onLockChange(false);
              }}
            >
              取消确认
            </Button>
          )}
          {awaitingReceipt ? (
            <>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => {
                  setAwaitingReceipt(false);
                  setReady(false);
                  onLockChange(false);
                }}
              >
                结束核对，保留草稿
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setAwaitingReceipt(false);
                  onTextChange('');
                  setReady(false);
                  onLockChange(false);
                }}
              >
                已在微信确认收到
              </Button>
            </>
          ) : (
            <Button
              type="submit"
              className="h-auto min-h-8 whitespace-normal break-words"
              disabled={pending || !text.trim() || (token ? !verified : !ready)}
            >
              {pending ? '处理中…' : token ? `确认并发送到${chat.name}` : '填入微信草稿'}
            </Button>
          )}
        </div>
      </form>
      <p className="text-xs leading-relaxed text-ink-3">
        填入草稿会临时使用并恢复剪贴板，操作会短暂激活原微信。取消或离开只取消发送确认，原微信中的草稿请手动处理。发送失败或结果不明时不会自动重试。
      </p>
    </section>
  );
}
