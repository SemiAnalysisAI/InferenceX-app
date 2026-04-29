'use client';

import { MessageSquareText } from 'lucide-react';
import { useMemo, useState } from 'react';

import EvalSamplesDrawer from '@/components/evaluation/ui/EvalSamplesDrawer';
import type { EvaluationChartData } from '@/components/evaluation/types';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { track } from '@/lib/analytics';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';

interface EvaluationTableProps {
  data: EvaluationChartData[];
}

export default function EvaluationTable({ data }: EvaluationTableProps) {
  const { runIndexByUrl } = useUnofficialRun();
  const sorted = useMemo(() => [...data].toSorted((a, b) => b.score - a.score), [data]);
  const hasDisaggConfigs = useMemo(() => data.some((d) => d.disagg), [data]);
  const [drawerRow, setDrawerRow] = useState<EvaluationChartData | null>(null);

  const openDrawer = (row: EvaluationChartData) => {
    setDrawerRow(row);
    // Notify the first-visit nudge to dismiss itself once the user has
    // discovered the affordance on their own.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('inferencex:eval-samples-opened'));
    }
    track('evaluation_samples_open', {
      eval_result_id: row.evalResultId,
      task: row.benchmark,
      hw_key: row.hwKey,
    });
  };

  const columns = useMemo<DataTableColumn<EvaluationChartData>[]>(
    () => [
      {
        header: '',
        cell: (row) => {
          // Official rows have a real eval_results.id; unofficial rows ship -1 but can
          // still be served live as long as we have a workflow URL to fetch the artifact from.
          const canOpen = row.evalResultId > 0 || (row.evalResultId <= 0 && Boolean(row.runUrl));
          return canOpen ? (
            <button
              type="button"
              onClick={() => openDrawer(row)}
              className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-medium text-brand hover:border-brand/50 hover:bg-brand/20 transition-colors whitespace-nowrap"
              aria-label={`View per-sample prompts and responses for ${row.configLabel}`}
              title="View per-sample prompts and responses"
            >
              <MessageSquareText className="size-3.5" />
              <span className="hidden sm:inline">Prompts</span>
            </button>
          ) : null;
        },
        className: 'whitespace-nowrap',
      },
      {
        header: 'GPU',
        cell: (row) => {
          const isUnofficial = row.evalResultId <= 0;
          // Inset a per-run colored dot — same palette the unofficial banner and
          // overlay chart points use, so a row, its banner chip, and its bar in
          // the bar chart all share the same color.
          const runIdx = isUnofficial ? overlayRunIndex(row.runUrl, runIndexByUrl) : 0;
          return (
            <span className="inline-flex items-center gap-1.5">
              {row.configLabel}
              {isUnofficial && (
                <span
                  className="inline-flex items-center gap-1 rounded-sm border border-red-600/50 bg-red-600/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400"
                  title="Data from an unofficial / un-ingested workflow run"
                >
                  <span
                    aria-hidden
                    className="inline-block size-1.5 rounded-full"
                    style={{ backgroundColor: overlayRunColor(runIdx) }}
                  />
                  Unofficial
                </span>
              )}
            </span>
          );
        },
        sortValue: (row) => row.configLabel,
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: 'Precision',
        cell: (row) => row.precision.toUpperCase(),
        sortValue: (row) => row.precision,
        className: 'whitespace-nowrap',
      },
      {
        header: 'Score',
        align: 'right',
        cell: (row) => row.score.toFixed(2),
        sortValue: (row) => row.score,
        className: 'tabular-nums',
      },
      {
        header: 'Min',
        align: 'right',
        cell: (row) => row.minScore?.toFixed(2) ?? '-',
        sortValue: (row) => row.minScore ?? 0,
        className: 'tabular-nums',
      },
      {
        header: 'Max',
        align: 'right',
        cell: (row) => row.maxScore?.toFixed(2) ?? '-',
        sortValue: (row) => row.maxScore ?? 0,
        className: 'tabular-nums',
      },
      {
        header: 'TP',
        align: 'right',
        cell: (row) => row.tp,
        sortValue: (row) => row.tp,
        className: 'tabular-nums',
      },
      {
        header: 'Conc',
        align: 'right',
        cell: (row) => row.conc,
        sortValue: (row) => row.conc,
        className: 'tabular-nums',
      },
      {
        header: 'Benchmark',
        cell: (row) => row.benchmark,
        sortValue: (row) => row.benchmark,
        className: 'whitespace-nowrap',
      },
      {
        header: 'Date',
        cell: (row) => row.date,
        sortValue: (row) => row.date,
        className: 'whitespace-nowrap',
      },
    ],
    [runIndexByUrl],
  );

  return (
    <>
      {hasDisaggConfigs && (
        <div className="mt-2 mb-2 text-[11px] text-muted-foreground/80 leading-tight">
          <div>
            <span className="font-mono">P(·/·/·/·)</span> prefill
            <span className="mx-1">·</span>
            <span className="font-mono">D(·/·/·/·)</span> decode
          </div>
          <div>
            slots: <span className="font-mono">tp/ep/dpa/nw</span>
            <span className="mx-1">·</span>
            <span className="font-mono">T</span>/<span className="font-mono">F</span> = DPA
            true/false
          </div>
        </div>
      )}
      <DataTable
        data={sorted}
        columns={columns}
        testId="evaluation-results-table"
        analyticsPrefix="evaluation_table"
      />
      <EvalSamplesDrawer row={drawerRow} onClose={() => setDrawerRow(null)} />
    </>
  );
}
