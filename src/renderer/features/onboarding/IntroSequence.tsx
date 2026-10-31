import { Button } from '../../components/ui/button';
import { DelaBrand } from '../../components/ui/dela-brand';
import { OnboardingWindowBar } from './onboarding-window-bar';

export function IntroSequence({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-surface text-ink" data-onboarding-intro="">
      <OnboardingWindowBar />
      <main className="grid place-items-center p-8">
        <div className="grid max-w-lg justify-items-center gap-5 text-center">
          <DelaBrand alt="Dela 上游标识" className="size-28" />
          <p className="text-xs text-ink-3">基于开源 Dela · macOS 开发预览</p>
          <h1 className="text-4xl font-semibold tracking-tight">JLU Dela</h1>
          <p className="text-base text-ink-2">吉大本科生的本地学习工作台</p>
          <p className="text-13 leading-relaxed text-ink-3">
            连接本地课程资料，同步课表、通知与平台课程，在阅读中记笔记并向 AI 提问。
          </p>
          <Button onClick={onStart}>开始使用</Button>
        </div>
      </main>
    </div>
  );
}
