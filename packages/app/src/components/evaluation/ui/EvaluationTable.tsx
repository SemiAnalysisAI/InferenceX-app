'use client';

import { MessageSquareText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import EvalSamplesDrawer from '@/components/evaluation/ui/EvalSamplesDrawer';
import type { EvaluationChartData } from '@/components/evaluation/types';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { track } from '@/lib/analytics';
import { notifyClientSearchChange } from '@/lib/client-navigation';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { formatEvaluationDate } from './BarChartD3';

export const EVALUATION_TABLE_STRINGS = {
  en: {
    prompts: 'Prompts',
    promptsTitle: 'View per-sample prompts and responses',
    promptsAriaLabel: (configLabel: string) =>
      `View per-sample prompts and responses for ${configLabel}`,
    precision: 'Precision',
    score: 'Score',
    min: 'Min',
    max: 'Max',
    conc: 'Conc',
    benchmark: 'Benchmark',
    date: 'Date',
    unofficial: 'Unofficial',
    unofficialTitle: 'Data from an unofficial / un-ingested workflow run',
    prefill: 'prefill',
    decode: 'decode',
    chip: 'Chip',
    slots: 'slots',
    dpaValues: 'DPA true/false',
  },
  zh: {
    prompts: '提示词',
    promptsTitle: '查看逐样本提示词与模型响应',
    promptsAriaLabel: (configLabel: string) => `查看 ${configLabel} 的逐样本提示词与模型响应`,
    precision: '精度',
    score: '得分',
    min: '最低',
    max: '最高',
    conc: '并发数',
    benchmark: '基准测试',
    date: '日期',
    unofficial: '非官方',
    unofficialTitle: '数据来自尚未入库的非官方工作流运行',
    prefill: '预填充',
    decode: '解码',
    chip: '芯片',
    slots: '字段顺序',
    dpaValues: 'DPA 是/否',
  },
} as const;

interface EvaluationTableProps {
  data: EvaluationChartData[];
}

export default function EvaluationTable({ data }: EvaluationTableProps) {
  const { runIndexByUrl } = useUnofficialRun();
  const locale = useLocale();
  const t = EVALUATION_TABLE_STRINGS[locale];
  const sorted = useMemo(() => [...data].toSorted((a, b) => b.score - a.score), [data]);
  const hasDisaggConfigs = useMemo(() => data.some((d) => d.disagg), [data]);
  const [drawerRow, setDrawerRow] = useState<EvaluationChartData | null>(null);
  const searchParams = useClientSearchParams();
  const sharedTarget = useMemo(() => {
    const evalParam = searchParams.get('eval');
    if (evalParam === null) return null;
    const evalResultId = Number(evalParam);
    if (!Number.isInteger(evalResultId) || evalResultId <= 0) return null;

    const sampleParam = searchParams.get('sample');
    const docId = sampleParam === null ? undefined : Number(sampleParam);
    return {
      evalResultId,
      ...(docId !== undefined && Number.isInteger(docId) && docId >= 0 ? { docId } : {}),
    };
  }, [searchParams]);
  const trackedSharedEvalId = useRef<number | null>(null);

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

  const closeDrawer = () => {
    setDrawerRow(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('eval');
    url.searchParams.delete('sample');
    window.history.replaceState(window.history.state, '', url);
    notifyClientSearchChange(url.href);
  };

  const sharedRow = sharedTarget
    ? (data.find((row) => Number(row.evalResultId) === sharedTarget.evalResultId) ?? null)
    : null;
  const activeDrawerRow = drawerRow ?? sharedRow;

  useEffect(() => {
    if (!sharedRow || trackedSharedEvalId.current === sharedTarget?.evalResultId) return;
    trackedSharedEvalId.current = sharedTarget?.evalResultId ?? null;
    window.dispatchEvent(new CustomEvent('inferencex:eval-samples-opened'));
    track('evaluation_samples_open', {
      eval_result_id: sharedRow.evalResultId,
      task: sharedRow.benchmark,
      hw_key: sharedRow.hwKey,
      source: 'shared_link',
    });
  }, [sharedRow, sharedTarget?.evalResultId]);

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
              aria-label={t.promptsAriaLabel(row.configLabel)}
              title={t.promptsTitle}
            >
              <MessageSquareText className="size-3.5" />
              <span className="hidden sm:inline">{t.prompts}</span>
            </button>
          ) : null;
        },
        className: 'whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.chip,
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
                  title={t.unofficialTitle}
                >
                  <span
                    aria-hidden
                    className="inline-block size-1.5 rounded-full"
                    style={{ backgroundColor: overlayRunColor(runIdx) }}
                  />
                  {t.unofficial}
                </span>
              )}
            </span>
          );
        },
        sortValue: (row) => row.configLabel,
        className: 'font-medium whitespace-nowrap',
        importance: 'key',
        pinned: true,
      },
      {
        header: t.precision,
        cell: (row) => row.precision.toUpperCase(),
        sortValue: (row) => row.precision,
        className: 'whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.score,
        align: 'right',
        cell: (row) => row.score.toFixed(2),
        sortValue: (row) => row.score,
        className: 'tabular-nums',
        importance: 'key',
      },
      {
        header: t.min,
        align: 'right',
        cell: (row) => row.minScore?.toFixed(2) ?? '-',
        sortValue: (row) => row.minScore ?? 0,
        className: 'tabular-nums',
        importance: 'secondary',
      },
      {
        header: t.max,
        align: 'right',
        cell: (row) => row.maxScore?.toFixed(2) ?? '-',
        sortValue: (row) => row.maxScore ?? 0,
        className: 'tabular-nums',
        importance: 'secondary',
      },
      {
        header: 'TP',
        align: 'right',
        cell: (row) => row.tp,
        sortValue: (row) => row.tp,
        className: 'tabular-nums',
        importance: 'key',
      },
      {
        header: t.conc,
        align: 'right',
        cell: (row) => row.conc,
        sortValue: (row) => row.conc,
        className: 'tabular-nums',
        importance: 'key',
      },
      {
        header: t.benchmark,
        cell: (row) => row.benchmark,
        sortValue: (row) => row.benchmark,
        className: 'whitespace-nowrap',
        importance: 'secondary',
      },
      {
        header: t.date,
        cell: (row) => formatEvaluationDate(row.date, locale),
        sortValue: (row) => row.date,
        className: 'whitespace-nowrap',
        importance: 'secondary',
      },
    ],
    [locale, runIndexByUrl],
  );

  return (
    <>
      {hasDisaggConfigs && (
        <div className="mt-2 mb-2 text-2xs text-muted-foreground/80 leading-tight">
          <div>
            <span className="font-mono">P(·/·/·/·)</span> {t.prefill}
            <span className="mx-1">·</span>
            <span className="font-mono">D(·/·/·/·)</span> {t.decode}
          </div>
          <div>
            {t.slots}: <span className="font-mono">tp/ep/dpa/nw</span>
            <span className="mx-1">·</span>
            <span className="font-mono">T</span>/<span className="font-mono">F</span> ={' '}
            {t.dpaValues}
          </div>
        </div>
      )}
      <DataTable
        data={sorted}
        columns={columns}
        testId="evaluation-results-table"
        analyticsPrefix="evaluation_table"
      />
      <EvalSamplesDrawer
        row={activeDrawerRow}
        initialDocId={drawerRow === null ? (sharedTarget?.docId ?? null) : null}
        onClose={closeDrawer}
      />
    </>
  );
}
