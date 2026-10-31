import { useState } from 'react';
import type { MailConfigureInput } from '../../../../shared/mail';
import { DesktopOnlyNotice } from '../../../components/ui/desktop-only-notice';
import { MailAccountForm } from '../../mail/MailAccountForm';
import { errorText } from '../../../workspace/store';
import { StepButton, type StepButtonState } from './step-controls';

export function MailStep({
  onDone,
  onBusyChange,
}: {
  onDone: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [state, setState] = useState<StepButtonState>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!window.dela) {
    return (
      <DesktopOnlyNotice
        description="邮箱凭据不会暴露给浏览器。"
        title="邮箱仅在 Dela 桌面端可用"
      />
    );
  }

  const submit = async (input: MailConfigureInput) => {
    if (state === 'success') return onDone();
    if (state === 'busy') return;
    const dela = window.dela;
    if (!dela) return;
    setState('busy');
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await dela.mail.configure(input);
      if (!result.ok) {
        setError(result.error);
        setState('idle');
        return;
      }
      // 同步进度由 mail:sync-status 事件展示，向导里不等它完成。
      void dela.mail.syncNow().catch(() => {});
      setState('success');
    } catch (cause) {
      setError(errorText(cause));
      setState('idle');
    } finally {
      onBusyChange?.(false);
    }
  };

  return (
    <div className="grid gap-7">
      <h2 className="text-2xl font-semibold tracking-tight">连接吉大邮箱</h2>
      <fieldset disabled={state === 'busy'}>
        <MailAccountForm
          error={error}
          onSubmit={(input) => void submit(input)}
          submit={
            <StepButton
              busyLabel="正在连接…"
              idleLabel="连接并同步"
              state={state}
              successLabel="已连接，返回校园连接"
            />
          }
          variant="wizard"
        />
      </fieldset>
    </div>
  );
}
