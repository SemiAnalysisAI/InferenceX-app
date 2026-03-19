'use client';

import React, { useMemo, useState } from 'react';

import { track } from '@/lib/analytics';

import type { GpuMetricKey, GpuMetricRow, GpuStats } from './types';
import { computeGpuStats, ALL_METRIC_OPTIONS } from './types';

interface GpuStatsTableProps {
  data: GpuMetricRow[];
  metricKey: GpuMetricKey;
}

type SortCol = keyof GpuStats;

const GpuStatsTable = React.memo(({ data, metricKey }: GpuStatsTableProps) => {
  const [sortCol, setSortCol] = useState<SortCol>('gpuIndex');
  const [sortAsc, setSortAsc] = useState(true);

  const stats = useMemo(() => computeGpuStats(data, metricKey), [data, metricKey]);
  const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === metricKey)!;

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [stats, sortCol, sortAsc]);

  const handleSort = (col: SortCol) => {
    const newAsc = sortCol === col ? !sortAsc : true;
    track('gpu_power_table_sorted', { column: col, ascending: newAsc });
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  if (stats.length === 0) return null;

  const fmt = (v: number) => (v >= 1000 ? v.toFixed(0) : v.toFixed(1));

  const cols: { key: SortCol; label: string }[] = [
    { key: 'gpuIndex', label: 'GPU' },
    { key: 'count', label: 'Samples' },
    { key: 'min', label: 'Min' },
    { key: 'max', label: 'Max' },
    { key: 'mean', label: 'Mean' },
    { key: 'median', label: 'Median' },
    { key: 'p95', label: 'P95' },
    { key: 'p99', label: 'P99' },
    { key: 'stddev', label: 'StdDev' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-2 py-1.5 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                onClick={() => handleSort(c.key)}
              >
                {c.label}
                {c.key !== 'gpuIndex' && c.key !== 'count' ? ` (${metricConfig.unit})` : ''}
                {sortCol === c.key && (sortAsc ? ' \u2191' : ' \u2193')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.gpuIndex} className="border-b border-border/50 hover:bg-muted/50">
              <td className="px-2 py-1 font-medium">{s.gpuIndex}</td>
              <td className="px-2 py-1">{s.count.toLocaleString()}</td>
              <td className="px-2 py-1">{fmt(s.min)}</td>
              <td className="px-2 py-1">{fmt(s.max)}</td>
              <td className="px-2 py-1">{fmt(s.mean)}</td>
              <td className="px-2 py-1">{fmt(s.median)}</td>
              <td className="px-2 py-1">{fmt(s.p95)}</td>
              <td className="px-2 py-1">{fmt(s.p99)}</td>
              <td className="px-2 py-1">{fmt(s.stddev)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

GpuStatsTable.displayName = 'GpuStatsTable';

export default GpuStatsTable;
