'use client';

import { ExternalLink, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

import { collectiveXRunDasharray } from './data';
import type { CollectiveXRunSummary } from './types';

interface CollectiveXRunsTableProps {
  runs: CollectiveXRunSummary[];
  selectedRunIndexById: ReadonlyMap<string, number>;
  visibleRunIds: ReadonlySet<string>;
  loadingRunIds: ReadonlySet<string>;
  deletingRunIds: ReadonlySet<string>;
  onVisibleChange: (runId: string, visible: boolean) => void;
  onDelete: (runId: string) => void;
}

const STRINGS = {
  en: {
    shown: 'Shown',
    run: 'Run',
    result: 'Result',
    suites: 'Suites',
    cases: 'Measured cases',
    points: 'Terminal points',
    skus: 'SKUs',
    published: 'Published (UTC)',
    actions: 'Actions',
    pending: 'pending',
    showRun: (id: string) => `Show run #${id}`,
    lineStyle: (id: string) => `Line style for run #${id}`,
    openRun: (id: string) => `Open GitHub Actions run #${id}`,
    deleteRun: (id: string) => `Delete run #${id}`,
    empty: 'No runs match this benchmark version.',
  },
  // English placeholders per the repository's temporary language override.
  zh: {
    shown: 'Shown',
    run: 'Run',
    result: 'Result',
    suites: 'Suites',
    cases: 'Measured cases',
    points: 'Terminal points',
    skus: 'SKUs',
    published: 'Published (UTC)',
    actions: 'Actions',
    pending: 'pending',
    showRun: (id: string) => `Show run #${id}`,
    lineStyle: (id: string) => `Line style for run #${id}`,
    openRun: (id: string) => `Open GitHub Actions run #${id}`,
    deleteRun: (id: string) => `Delete run #${id}`,
    empty: 'No runs match this benchmark version.',
  },
} as const;

const SUITE_BADGE_CLASSES = {
  ep: 'border-sky-600/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  kv: 'border-violet-600/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
} as const;

const CONCLUSION_CLASSES: Record<string, string> = {
  success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failure: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
};
const CONCLUSION_FALLBACK_CLASS =
  'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';

function formatDate(value: string, locale: 'en' | 'zh'): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function CollectiveXRunsTable({
  runs,
  selectedRunIndexById,
  visibleRunIds,
  loadingRunIds,
  deletingRunIds,
  onVisibleChange,
  onDelete,
}: CollectiveXRunsTableProps) {
  const locale = useLocale();
  const t = STRINGS[locale];

  if (runs.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.empty}</p>;
  }

  return (
    <div
      data-testid="collectivex-runs-table"
      className="mt-2 max-h-[28rem] overflow-auto rounded-md border"
    >
      <table className="w-full min-w-[940px] text-sm">
        <thead className="sticky top-0 z-1 bg-background">
          <tr className="border-b-2 border-border text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">{t.shown}</th>
            <th className="px-3 py-1.5 font-medium">{t.run}</th>
            <th className="px-3 py-1.5 font-medium">{t.result}</th>
            <th className="px-3 py-1.5 font-medium">{t.suites}</th>
            <th className="px-3 py-1.5 text-right font-medium">{t.cases}</th>
            <th className="px-3 py-1.5 text-right font-medium">{t.points}</th>
            <th className="px-3 py-1.5 font-medium">{t.skus}</th>
            <th className="px-3 py-1.5 font-medium">{t.published}</th>
            <th className="px-3 py-1.5 text-right font-medium">{t.actions}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const visible = visibleRunIds.has(run.run_id);
            const loading = loadingRunIds.has(run.run_id);
            const deleting = deletingRunIds.has(run.run_id);
            const conclusion = run.conclusion ?? t.pending;
            const selectedRunIndex = selectedRunIndexById.get(run.run_id);
            // Summaries stored before the kv suite carry no kv_cases: EP-only.
            const kvRequested = run.kv_cases?.requested ?? 0;
            const kvMeasured = run.kv_cases?.measured ?? 0;
            const epRequested = run.requested_cases - kvRequested;
            const epMeasured = run.measured_cases - kvMeasured;
            const lineDasharray =
              selectedRunIndex === undefined ? null : collectiveXRunDasharray(selectedRunIndex);
            return (
              <tr
                key={run.run_id}
                data-testid={`collectivex-run-row-${run.run_id}`}
                className={cn(
                  'border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/30',
                  visible && 'bg-primary/5',
                )}
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={deletingRunIds.size > 0}
                      aria-label={t.showRun(run.run_id)}
                      data-testid={`collectivex-run-visible-${run.run_id}`}
                      onChange={(event) => {
                        const next = event.target.checked;
                        onVisibleChange(run.run_id, next);
                        track('collectivex_run_visibility_toggled', {
                          run: run.run_id,
                          visible: next,
                        });
                      }}
                      className="size-4 accent-primary"
                    />
                    {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    {lineDasharray === null ? (
                      <span aria-hidden className="block h-[10px] w-6 shrink-0" />
                    ) : (
                      <svg
                        width="24"
                        height="10"
                        viewBox="0 0 24 10"
                        aria-label={t.lineStyle(run.run_id)}
                        data-testid={`collectivex-run-line-style-${run.run_id}`}
                        className="shrink-0 text-foreground"
                      >
                        <line
                          x1="1"
                          y1="5"
                          x2="23"
                          y2="5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={lineDasharray === 'none' ? undefined : lineDasharray}
                        />
                      </svg>
                    )}
                    <a
                      href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run.run_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t.openRun(run.run_id)}
                      onClick={() => track('collectivex_run_source_opened', { run: run.run_id })}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      #{run.run_id}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium',
                      CONCLUSION_CLASSES[conclusion] ?? CONCLUSION_FALLBACK_CLASS,
                    )}
                  >
                    {conclusion}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1">
                    {epRequested > 0 && (
                      <span
                        title={`EP: ${epMeasured}/${epRequested} measured`}
                        data-testid={`collectivex-run-suite-ep-${run.run_id}`}
                        className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium',
                          SUITE_BADGE_CLASSES.ep,
                        )}
                      >
                        EP
                      </span>
                    )}
                    {kvRequested > 0 && (
                      <span
                        title={`KV transfer: ${kvMeasured}/${kvRequested} measured`}
                        data-testid={`collectivex-run-suite-kv-${run.run_id}`}
                        className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium',
                          SUITE_BADGE_CLASSES.kv,
                        )}
                      >
                        KV
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {run.measured_cases}/{run.requested_cases}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {run.terminal_points}/{run.requested_points}
                </td>
                <td className="px-3 py-1.5">
                  {run.covered_skus.length > 0
                    ? run.covered_skus.map((sku) => sku.toUpperCase()).join(', ')
                    : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                  {formatDate(run.generated_at, locale)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.deleteRun(run.run_id)}
                    data-testid={`collectivex-delete-run-${run.run_id}`}
                    disabled={deletingRunIds.size > 0}
                    onClick={() => onDelete(run.run_id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {deleting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
