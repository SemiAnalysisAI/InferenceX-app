'use client';

import { AlertTriangle, ExternalLink, X } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const STRINGS = {
  en: {
    label: 'Non-official',
    viewingBranch: 'Viewing data from branch',
    viewingRuns: (count: number) => `Viewing ${count} runs`,
    dismissAll: 'Dismiss all',
    dismissAllAria: 'Dismiss all unofficial runs',
    viewRunAria: (branch: string) => `View workflow run for ${branch}`,
    dismissRunAria: (branch: string) => `Dismiss ${branch}`,
  },
  zh: {
    label: '非官方',
    viewingBranch: '正在查看分支数据',
    viewingRuns: (count: number) => `正在查看 ${count} 个运行`,
    dismissAll: '全部关闭',
    dismissAllAria: '关闭所有非官方运行',
    viewRunAria: (branch: string) => `查看 ${branch} 的工作流运行`,
    dismissRunAria: (branch: string) => `关闭 ${branch}`,
  },
} as const;

interface RunInfo {
  id: number;
  name: string;
  branch: string;
  sha: string;
  createdAt: string;
  url: string;
}

interface UnofficialBannerProps {
  runs: RunInfo[];
  attached?: boolean;
  onDismissRun?: (runId: string) => void;
  onDismissAll?: () => void;
}

export function UnofficialBanner({
  runs,
  attached = false,
  onDismissRun,
  onDismissAll,
}: UnofficialBannerProps) {
  const t = STRINGS[useLocale()];
  if (runs.length === 0) return null;
  const multiple = runs.length > 1;

  const banner = (
    <div
      data-slot="unofficial-banner"
      className={cn(
        'min-w-0 border-destructive/60 bg-destructive/15 px-4 py-3 text-foreground md:px-6',
        attached ? 'mt-3 rounded-lg border' : 'rounded-xl border',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-red-600 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
            <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
            {t.label}
          </span>
          <span className="text-xs text-foreground">
            {multiple ? t.viewingRuns(runs.length) : t.viewingBranch}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:basis-auto">
          {runs.map((run, idx) => (
            <RunChip
              key={run.id}
              run={run}
              color={overlayRunColor(idx)}
              labels={t}
              onDismiss={onDismissRun ? () => onDismissRun(String(run.id)) : undefined}
            />
          ))}
        </div>
        {multiple && onDismissAll && (
          <button
            type="button"
            onClick={() => {
              track('unofficial_banner_dismissed_all', { count: runs.length });
              onDismissAll();
            }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:ml-auto sm:min-h-8"
            aria-label={t.dismissAllAria}
          >
            <X className="size-3" />
            {t.dismissAll}
          </button>
        )}
      </div>
    </div>
  );

  return attached ? banner : <div className="container mx-auto mb-4 px-4 lg:px-8">{banner}</div>;
}

function RunChip({
  run,
  color,
  labels,
  onDismiss,
}: {
  run: RunInfo;
  color: string;
  labels: (typeof STRINGS)[keyof typeof STRINGS];
  onDismiss?: () => void;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border/40 bg-card pl-2 text-xs font-mono">
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <a
        href={run.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('unofficial_banner_view_run', { branch: run.branch })}
        className="inline-flex min-h-11 min-w-0 items-center gap-1.5 py-1 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:min-h-7"
        aria-label={labels.viewRunAria(run.branch)}
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{run.branch}</span>
        <ExternalLink aria-hidden className="size-3 shrink-0 opacity-70" />
      </a>
      {onDismiss && (
        <button
          type="button"
          onClick={() => {
            track('unofficial_banner_run_dismissed', { branch: run.branch });
            onDismiss();
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:size-7"
          aria-label={labels.dismissRunAria(run.branch)}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
