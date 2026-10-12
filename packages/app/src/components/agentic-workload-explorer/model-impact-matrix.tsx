'use client';

import { useMemo, useState } from 'react';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import type { ErrorData } from '@/lib/agentic-workload-explorer/api-types';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

type SortKey = 'model' | 'totalCount' | 'errorCount' | 'errorRate' | 'severity';
type SortDirection = 'ascending' | 'descending';
type ModelSeverity = 'nominal' | 'watch' | 'elevated' | 'critical' | 'no-traffic';

type ModelRow = ErrorData['byModel'][number] & {
  errorRate: number;
  severity: ModelSeverity;
};

const SEVERITY_META: Record<ModelSeverity, { rank: number; badge: string; marker: string }> = {
  critical: {
    rank: 4,
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
    marker: 'bg-rose-500',
  },
  elevated: {
    rank: 3,
    badge: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
    marker: 'bg-orange-500',
  },
  watch: {
    rank: 2,
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    marker: 'bg-amber-500',
  },
  nominal: {
    rank: 1,
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    marker: 'bg-emerald-500',
  },
  'no-traffic': {
    rank: 0,
    badge: 'border-border bg-surface-hover text-muted-foreground',
    marker: 'bg-muted-foreground',
  },
};

const STRINGS = {
  en: {
    emptyState: 'No model impact data is available for this trace version.',
    modelsRanked: (n: number) => `${formatNumber(n)} models ranked by all-time error burden`,
    peakSeverity: 'Peak severity',
    caption:
      'Sortable all-time model impact matrix showing request volume, errors, error rate, and explicit severity for every model.',
    severityBands:
      'Severity bands: Critical ≥10% · Elevated ≥5% · Watch ≥1% · Nominal <1% error rate.',
    sortByLabel: (col: string, dir?: string) => `Sort by ${col}${dir ? `, currently ${dir}` : ''}`,
    columns: {
      model: 'Model',
      totalCount: 'Request volume',
      errorCount: 'Errors',
      errorRate: 'Error rate',
      severity: 'Severity',
    } as Record<SortKey, string>,
    severity: {
      critical: 'Critical',
      elevated: 'Elevated',
      watch: 'Watch',
      nominal: 'Nominal',
      'no-traffic': 'No traffic',
    } as Record<ModelSeverity, string>,
  },
  zh: {
    emptyState: '该 trace 版本暂无模型影响数据。',
    modelsRanked: (n: number) => `${formatNumber(n)} 个模型，按累计错误量排序`,
    peakSeverity: '最高严重度',
    caption: '可排序的模型影响矩阵，展示各模型的请求量、错误数、错误率及严重度。',
    severityBands: '严重度区间：严重 ≥10% · 偏高 ≥5% · 关注 ≥1% · 正常 <1% 错误率。',
    sortByLabel: (col: string, dir?: string) => `按${col}排序${dir ? `，当前为${dir}` : ''}`,
    columns: {
      model: '模型',
      totalCount: '请求量',
      errorCount: '错误数',
      errorRate: '错误率',
      severity: '严重度',
    } as Record<SortKey, string>,
    severity: {
      critical: '严重',
      elevated: '偏高',
      watch: '关注',
      nominal: '正常',
      'no-traffic': '无流量',
    } as Record<ModelSeverity, string>,
  },
};

function getSeverity(errorRate: number, totalCount: number): ModelSeverity {
  if (totalCount === 0) return 'no-traffic';
  if (errorRate >= 10) return 'critical';
  if (errorRate >= 5) return 'elevated';
  if (errorRate >= 1) return 'watch';
  return 'nominal';
}

export function ModelImpactMatrix({ data }: { data: ErrorData['byModel'] }) {
  const t = STRINGS[useLocale()];
  const [sortKey, setSortKey] = useState<SortKey>('errorCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');

  const rows = useMemo<ModelRow[]>(() => {
    const nextRows = data.map((model) => {
      const errorRate = model.totalCount > 0 ? (model.errorCount / model.totalCount) * 100 : 0;
      return {
        ...model,
        errorRate,
        severity: getSeverity(errorRate, model.totalCount),
      };
    });

    nextRows.sort((left, right) => {
      let comparison: number;
      if (sortKey === 'model') {
        comparison = left.model.localeCompare(right.model);
      } else if (sortKey === 'severity') {
        comparison = SEVERITY_META[left.severity].rank - SEVERITY_META[right.severity].rank;
      } else {
        comparison = left[sortKey] - right[sortKey];
      }

      if (comparison === 0) comparison = left.model.localeCompare(right.model);
      return sortDirection === 'ascending' ? comparison : -comparison;
    });

    return nextRows;
  }, [data, sortDirection, sortKey]);

  if (rows.length === 0) {
    return (
      <div
        role="status"
        className="flex min-h-32 items-center justify-center px-4 text-center text-2xs font-mono text-muted-foreground"
      >
        {t.emptyState}
      </div>
    );
  }

  const changeSort = (nextKey: SortKey) => {
    track('agentic_workload_model_impact_sort_changed', { column: nextKey });
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'model' ? 'ascending' : 'descending');
  };

  const highestSeverity = rows.reduce<ModelSeverity>(
    (highest, row) =>
      SEVERITY_META[row.severity].rank > SEVERITY_META[highest].rank ? row.severity : highest,
    'no-traffic',
  );

  const columnKeys: SortKey[] = ['model', 'totalCount', 'errorCount', 'errorRate', 'severity'];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-3xs font-mono text-muted-foreground">
        <span>{t.modelsRanked(rows.length)}</span>
        <span className="inline-flex items-center gap-1.5">
          {t.peakSeverity}
          <span
            className={`inline-flex border px-1.5 py-0.5 text-3xs font-bold uppercase tracking-eyebrow ${SEVERITY_META[highestSeverity].badge}`}
          >
            {t.severity[highestSeverity]}
          </span>
        </span>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-2xs font-mono">
          <caption className="sr-only">{t.caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-hover/50">
              {columnKeys.map((key) => {
                const numeric = key === 'totalCount' || key === 'errorCount' || key === 'errorRate';
                const sortIndicator =
                  key === sortKey ? (sortDirection === 'ascending' ? '↑' : '↓') : '↕';
                return (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={key === sortKey ? sortDirection : 'none'}
                    className={`${numeric ? 'text-right' : 'text-left'} px-3 py-2`}
                  >
                    <button
                      type="button"
                      onClick={() => changeSort(key)}
                      className={`inline-flex w-full items-center gap-1.5 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 ${numeric ? 'justify-end' : 'justify-start'}`}
                      aria-label={t.sortByLabel(
                        t.columns[key],
                        key === sortKey ? sortDirection : undefined,
                      )}
                    >
                      {t.columns[key]}
                      <span aria-hidden="true" className="text-3xs tracking-normal">
                        {sortIndicator}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.model}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-hover/70"
              >
                <th
                  scope="row"
                  className="max-w-[280px] break-all px-3 py-2.5 text-left font-medium text-foreground"
                >
                  {row.model}
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.totalCount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-foreground">
                  {formatNumber(row.errorCount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="font-bold">
                    {row.errorRate.toFixed(row.errorRate < 1 ? 2 : 1)}%
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-3xs font-bold uppercase tracking-eyebrow ${SEVERITY_META[row.severity].badge}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-1.5 ${SEVERITY_META[row.severity].marker}`}
                    />
                    {t.severity[row.severity]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-3xs font-mono text-muted-foreground">{t.severityBands}</p>
    </div>
  );
}
