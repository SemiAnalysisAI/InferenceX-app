'use client';

import { useMemo } from 'react';

import type { EvaluationChartData } from '@/components/evaluation/types';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';

interface EvaluationTableProps {
  data: EvaluationChartData[];
}

export default function EvaluationTable({ data }: EvaluationTableProps) {
  const sorted = useMemo(() => [...data].toSorted((a, b) => b.score - a.score), [data]);
  const hasDisaggConfigs = useMemo(() => data.some((d) => d.disagg), [data]);

  const columns = useMemo<DataTableColumn<EvaluationChartData>[]>(
    () => [
      {
        header: 'GPU',
        cell: (row) => row.configLabel,
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
    [],
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
    </>
  );
}
