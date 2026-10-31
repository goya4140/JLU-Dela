import type { ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

export function LearningStudyFrame({
  course,
  recording,
  onBack,
  loading,
  onReload,
  children,
}: {
  course: string;
  recording: string;
  onBack: () => void;
  loading: boolean;
  onReload: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-surface">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          返回目录
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-ink">{course}</h1>
          <p className="truncate text-xs text-ink-3">{recording}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={onReload}
          aria-label="重新加载录像"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </header>
      <div className="grid shrink-0 gap-4 px-4 pb-4 md:px-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {children}
      </div>
    </div>
  );
}
