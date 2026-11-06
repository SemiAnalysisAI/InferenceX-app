'use client';

import { MessageSquareText } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import EvalSamplesDrawer from '@/components/evaluation/ui/EvalSamplesDrawer';
import type { EvaluationChartData } from '@/components/evaluation/types';
import { type ParallelismPill, parallelismPills } from '@/components/evaluation/chart-data';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { Button } from '@/components/ui/button';
import { ConfigPill } from '@/components/ui/config-pill';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { track } from '@/lib/analytics/analytics';
import { notifyClientSearchChange } from '@/lib/routing/client-navigation';
import { overlayRunColor, overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { useLocale } from '@/lib/i18n/use-locale';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { formatEvaluationDate } from './BarChartD3';

export const EVALUATION_TABLE_STRINGS = {
  en: {
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
    prefill: 'Prefill',
    decode: 'Decode',
    aggregated: 'aggregated',
    workers: (n: number) => `${n} ${n === 1 ? 'worker' : 'workers'}`,
    chip: 'Chip',
    physicalChips: 'Physical chips',
  },
  zh: {
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
    aggregated: '聚合',
    workers: (n: number) => `${n} 个 worker`,
    chip: '芯片',
    physicalChips: '物理芯片数',
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('inferencex:eval-samples-opened'));
    }
    track('evaluation_samples_open', {
      eval_result_id: row.evalResultId,
      task: row.benchmark,
      gpu: row.hwKey,
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
      gpu: sharedRow.hwKey,
      source: 'shared_link',
    });
  }, [sharedRow, sharedTarget?.evalResultId]);

  const columns = useMemo<DataTableColumn<EvaluationChartData>[]>(() => {
    const parallelism = (pills: ParallelismPill[], suffix: ReactNode) => (
      <span className="inline-flex items-center gap-1">
        {pills.map((pill) => (
          <ConfigPill key={pill.label} {...pill} />
        ))}
        {suffix}
      </span>
    );
    const workers = (n: number) => (
      <span className="text-muted-foreground" title={t.workers(n)}>
        ×{n}
      </span>
    );
    return [
      {
        header: t.chip,
        cell: (row) => {
          const isUnofficial = row.evalResultId <= 0;
          const runIdx = isUnofficial ? overlayRunIndex(row.runUrl, runIndexByUrl) : 0;
          return (
            <span className="flex max-w-80 items-center gap-1.5 sm:w-max">
              <span
                className="min-w-0 sm:truncate"
                title={row.engineLabel ? `${row.hwLabel} ${row.engineLabel}` : undefined}
              >
                <span className="font-medium">{row.hwLabel}</span>
                {row.engineLabel && (
                  <span className="text-muted-foreground"> {row.engineLabel}</span>
                )}
              </span>
              {isUnofficial && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-2xs font-medium text-destructive"
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
        sortValue: (row) => `${row.hwLabel} ${row.engineLabel}`,
        className: 'w-px whitespace-nowrap',
        importance: 'key',
        pinned: true,
      },
      {
        header: t.precision,
        cell: (row) => row.precision.toUpperCase(),
        sortValue: (row) => row.precision,
        className: 'w-px whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.score,
        align: 'right',
        cell: (row) => row.score.toFixed(2),
        sortValue: (row) => row.score,
        className: 'w-px whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.min,
        align: 'right',
        cell: (row) => row.minScore?.toFixed(2) ?? '-',
        sortValue: (row) => row.minScore ?? 0,
        className: 'w-px whitespace-nowrap',
        importance: 'secondary',
      },
      {
        header: t.max,
        align: 'right',
        cell: (row) => row.maxScore?.toFixed(2) ?? '-',
        sortValue: (row) => row.maxScore ?? 0,
        className: 'w-px whitespace-nowrap',
        importance: 'secondary',
      },
      {
        header: t.conc,
        align: 'right',
        cell: (row) => row.conc,
        sortValue: (row) => row.conc,
        className: 'w-px whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.prefill,
        cell: (row) =>
          row.disagg
            ? parallelism(
                parallelismPills(row.prefillTp, row.prefillEp, row.prefillDpAttention),
                workers(row.prefillNumWorkers || 1),
              )
            : parallelism(
                parallelismPills(row.tp, row.ep, row.dp_attention, row.dp),
                <span className="ml-1 text-muted-foreground">{t.aggregated}</span>,
              ),
        sortValue: (row) => (row.disagg ? row.prefillTp * (row.prefillNumWorkers || 1) : row.tp),
        colSpan: (row) => (row.disagg ? 1 : 2),
        className: 'whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.decode,
        cell: (row) =>
          parallelism(
            parallelismPills(row.tp, row.ep, row.dp_attention),
            workers(row.decodeNumWorkers || 1),
          ),
        sortValue: (row) => (row.disagg ? row.tp * (row.decodeNumWorkers || 1) : row.tp),
        className: 'whitespace-nowrap',
        importance: 'key',
      },
      {
        header: t.physicalChips,
        align: 'right',
        cell: (row) => row.physicalChips ?? '—',
        sortValue: (row) => row.physicalChips ?? 0,
        className: 'w-px whitespace-nowrap',
        importance: 'secondary',
      },
      {
        header: t.benchmark,
        cell: (row) => row.benchmark,
        sortValue: (row) => row.benchmark,
        className: 'w-px whitespace-nowrap',
        importance: 'secondary',
      },
      {
        header: t.date,
        cell: (row) => formatEvaluationDate(row.date, locale),
        sortValue: (row) => row.date,
        className: 'w-px whitespace-nowrap tabular-nums',
        importance: 'secondary',
      },
      {
        header: '',
        cell: (row) => {
          const canOpen = row.evalResultId > 0 || (row.evalResultId <= 0 && Boolean(row.runUrl));
          return canOpen ? (
            <Button
              type="button"
              variant="outline"
              size="icon-2xs"
              onClick={() => openDrawer(row)}
              aria-label={t.promptsAriaLabel(row.configLabel)}
              title={t.promptsTitle}
            >
              <MessageSquareText />
            </Button>
          ) : null;
        },
        className: 'w-px',
        importance: 'key',
      },
    ];
  }, [locale, runIndexByUrl]);

  return (
    <>
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
