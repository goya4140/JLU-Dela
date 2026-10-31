import { useState } from 'react';
import { PlatformConnections } from '../PlatformConnections';
import { MailStep } from './MailStep';
import { Button } from '../../../components/ui/button';
import { StepButton } from './step-controls';

export function CampusStep({
  onDone,
  onBusyChange,
}: {
  onDone: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const changeBusy = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };
  if (mailOpen)
    return (
      <div className="grid gap-7">
        <Button
          size="sm"
          variant="ghost"
          className="justify-self-start"
          disabled={busy}
          onClick={() => setMailOpen(false)}
        >
          返回校园连接
        </Button>
        <MailStep onDone={() => setMailOpen(false)} onBusyChange={changeBusy} />
      </div>
    );
  return (
    <div className="grid gap-7">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">校园连接</h2>
        <p className="text-13 leading-relaxed text-ink-3">
          按需同步课表、通知与课程。可以先跳过，之后在使用指南继续连接。
        </p>
      </header>
      <PlatformConnections onConnectMail={() => setMailOpen(true)} onBusyChange={changeBusy} />
      <StepButton
        state="idle"
        disabled={busy}
        idleLabel="下一步"
        busyLabel="下一步"
        successLabel="下一步"
        type="button"
        onClick={onDone}
      />
    </div>
  );
}
