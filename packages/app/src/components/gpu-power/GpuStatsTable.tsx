'use client';

import React, { useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import {
  type GpuMetricKey,
  type GpuMetricRow,
  type GpuStats,
  computeGpuStats,
  ALL_METRIC_OPTIONS,
} from './types';

interface GpuStatsTableProps {
  data: GpuMetricRow[];
  metricKey: GpuMetricKey;
}

type SortCol = keyof GpuStats;

const fmtStat = (v: number) => (v >= 1000 ? v.toFixed(0) : v.toFixed(1));

const GpuStatsTable = React.memo(({ data, metricKey }: GpuStatsTableProps) => {
  const locale = useLocale();
  const [sortCol, setSortCol] = useState<SortCol>('gpuIndex');
  const [sortAsc, setSortAsc] = useState(true);

  const stats = useMemo(() => computeGpuStats(data, metricKey), [data, metricKey]);
  const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === metricKey)!;

  const sorted = useMemo(
    () =>
      [...stats].toSorted((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
      }),
    [stats, sortCol, sortAsc],
  );

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

  const cols: { key: SortCol; label: string }[] = [
    { key: 'gpuIndex', label: locale === 'zh' ? '芯片' : 'Chip' },
    { key: 'count', label: locale === 'zh' ? '样本数' : 'Samples' },
    { key: 'min', label: locale === 'zh' ? '最小值' : 'Min' },
    { key: 'max', label: locale === 'zh' ? '最大值' : 'Max' },
    { key: 'mean', label: locale === 'zh' ? '平均值' : 'Mean' },
    { key: 'median', label: locale === 'zh' ? '中位数' : 'Median' },
    { key: 'p95', label: 'P95' },
    { key: 'p99', label: 'P99' },
    { key: 'stddev', label: locale === 'zh' ? '标准差' : 'StdDev' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                aria-sort={sortCol === c.key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort(c.key)}
                >
                  {c.label}
                  {c.key !== 'gpuIndex' && c.key !== 'count' ? ` (${metricConfig.unit})` : ''}
                  {sortCol === c.key && (sortAsc ? ' \u2191' : ' \u2193')}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.gpuIndex} className="border-b border-border/50 hover:bg-muted/50">
              <td className="px-2 py-1 font-medium">{s.gpuIndex}</td>
              <td className="px-2 py-1">
                {locale === 'zh' ? s.count.toLocaleString('zh-CN') : s.count.toLocaleString()}
              </td>
              <td className="px-2 py-1">{fmtStat(s.min)}</td>
              <td className="px-2 py-1">{fmtStat(s.max)}</td>
              <td className="px-2 py-1">{fmtStat(s.mean)}</td>
              <td className="px-2 py-1">{fmtStat(s.median)}</td>
              <td className="px-2 py-1">{fmtStat(s.p95)}</td>
              <td className="px-2 py-1">{fmtStat(s.p99)}</td>
              <td className="px-2 py-1">{fmtStat(s.stddev)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

GpuStatsTable.displayName = 'GpuStatsTable';

export default GpuStatsTable;
