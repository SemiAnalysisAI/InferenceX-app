'use client';

import { useCallback, useMemo, useState } from 'react';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';
import { Input } from '@/components/ui/input';
import { useScrollFade } from '@/hooks/useScrollFade';
import { fmtCost, fmtTput } from '@/lib/compare/compare-table-view';

const STRINGS = {
  en: {
    hint: 'Interpolated from real benchmark data. Edit target interactivity values below to compare at different operating points.',
    metric: 'Metric',
    interactivity: 'Interactivity (tok/s/user)',
    table: 'Interpolated benchmark comparison',
    target: (n: number) => `Target interactivity ${n} (tok/s/user)`,
    scrollHint: (n: number) => `Swipe sideways to see all ${n} interactivity targets →`,
  },
  zh: {
    hint: '数据由真实基准测试结果插值得出。调整下方的目标交互性数值，即可比较不同运行点。',
    metric: '指标',
    interactivity: '交互性（tok/s/user）',
    table: '基准测试结果插值对比',
    target: (n: number) => `目标交互性 ${n}（tok/s/user）`,
    scrollHint: (n: number) => `左右滑动查看全部 ${n} 个交互性目标 →`,
  },
} as const;

const METRIC_LABELS_ZH: Record<string, string> = {
  'Throughput (tok/s/chip)': '吞吐量（tok/s/chip）',
  'Cost ($/M tok)': '成本（$/M tok）',
  'Dollars per million tokens': '每百万 token 成本（美元）',
  Concurrency: '并发数',
};

export function isInteractivityInputOutOfRange(
  inputValue: string,
  min: number,
  max: number,
): boolean {
  const parsed = parseFloat(inputValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  return parsed < min || parsed > max;
}

interface SsrInterpolatedRow {
  target: number;
  a: InterpolatedResult | null;
  b: InterpolatedResult | null;
}

export interface CompareInterpolatedTableProps {
  aLabel: string;
  bLabel: string;
  ssrRows: SsrInterpolatedRow[];
  defaultTargets: number[];
  interactivityRange: { min: number; max: number };
  gpuDataPointsA: GPUDataPoint[];
  gpuDataPointsB: GPUDataPoint[];
  visibleMetricLabels?: string[];
  metricLabelOverrides?: Record<string, string>;
}

interface ColumnIntent {
  target: number;
  inputValue: string;
}

interface ColumnData extends ColumnIntent {
  a: InterpolatedResult | null;
  b: InterpolatedResult | null;
}

interface MetricRow {
  label: string;
  extract: (r: InterpolatedResult) => number;
  format: (v: number) => string;
  direction: 'higher' | 'lower';
}

const METRICS: MetricRow[] = [
  {
    label: 'Throughput (tok/s/chip)',
    extract: (r) => r.value,
    format: fmtTput,
    direction: 'higher',
  },
  {
    label: 'Cost ($/M tok)',
    extract: (r) => r.cost,
    format: fmtCost,
    direction: 'lower',
  },
  {
    label: 'tok/s/MW',
    extract: (r) => r.tpPerMw,
    format: (v) => Math.round(v).toLocaleString('en-US'),
    direction: 'higher',
  },
  {
    label: 'Concurrency',
    extract: (r) => r.concurrency,
    format: (v) => `~${Math.round(v).toLocaleString('en-US')}`,
    direction: 'higher',
  },
];

export function CompareInterpolatedTable({
  aLabel,
  bLabel,
  ssrRows,
  defaultTargets,
  interactivityRange,
  gpuDataPointsA,
  gpuDataPointsB,
  visibleMetricLabels,
  metricLabelOverrides,
}: CompareInterpolatedTableProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const metricsToRender = (
    visibleMetricLabels ? METRICS.filter((m) => visibleMetricLabels.includes(m.label)) : METRICS
  ).map((m) =>
    metricLabelOverrides && metricLabelOverrides[m.label]
      ? { ...m, label: metricLabelOverrides[m.label] }
      : m,
  );
  const localizedMetrics = metricsToRender.map((metric) => ({
    ...metric,
    label: locale === 'zh' ? (METRIC_LABELS_ZH[metric.label] ?? metric.label) : metric.label,
  }));
  const [columnIntents, setColumnIntents] = useState<ColumnIntent[]>(() =>
    defaultTargets.map((target) => ({
      target,
      inputValue: String(target),
    })),
  );

  const columns = useMemo<ColumnData[]>(
    () =>
      columnIntents.map((column, index) => ({
        ...column,
        a:
          gpuDataPointsA.length > 0
            ? interpolateForGPU(
                gpuDataPointsA,
                column.target,
                'interactivity_to_throughput',
                'costh',
              )
            : (ssrRows[index]?.a ?? null),
        b:
          gpuDataPointsB.length > 0
            ? interpolateForGPU(
                gpuDataPointsB,
                column.target,
                'interactivity_to_throughput',
                'costh',
              )
            : (ssrRows[index]?.b ?? null),
      })),
    [columnIntents, gpuDataPointsA, gpuDataPointsB, ssrRows],
  );

  const commitColumnTarget = useCallback(
    (colIndex: number): boolean => {
      let committed = false;
      setColumnIntents((prev) => {
        const next = [...prev];
        const column = next[colIndex];
        const parsed = parseFloat(column.inputValue);

        if (isNaN(parsed) || parsed <= 0) {
          next[colIndex] = { ...column, inputValue: String(column.target) };
          return next;
        }

        const clamped = Math.round(
          Math.max(interactivityRange.min, Math.min(interactivityRange.max, parsed)),
        );
        next[colIndex] = {
          target: clamped,
          inputValue: String(clamped),
        };
        committed = true;
        return next;
      });
      if (committed) {
        track('compare_table_target_changed', { col_index: colIndex });
      }
      return committed;
    },
    [interactivityRange],
  );

  const handleInputChange = useCallback(
    (colIndex: number, value: string) => {
      setColumnIntents((prev) => {
        const next = [...prev];
        const column = next[colIndex];
        const parsed = parseFloat(value);

        if (!isNaN(parsed) && parsed > 0) {
          const clamped = Math.round(
            Math.max(interactivityRange.min, Math.min(interactivityRange.max, parsed)),
          );
          next[colIndex] = {
            target: clamped,
            inputValue: value,
          };
        } else {
          next[colIndex] = { ...column, inputValue: value };
        }
        return next;
      });
    },
    [interactivityRange],
  );

  const handleInputBlur = useCallback(
    (colIndex: number) => {
      commitColumnTarget(colIndex);
    },
    [commitColumnTarget],
  );

  const handleKeyDown = useCallback(
    (colIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const didCommit = commitColumnTarget(colIndex);
      if (didCommit) {
        queueMicrotask(() => {
          e.currentTarget.blur();
        });
      }
    },
    [commitColumnTarget],
  );

  const winnerClass = 'font-semibold text-foreground';

  const scroll = useScrollFade<HTMLDivElement>();

  if (columns.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t.hint}</p>
      {scroll.fade && (
        <p className="text-xs font-medium text-foreground" data-testid="compare-table-scroll-hint">
          {t.scrollHint(columns.length)}
        </p>
      )}
      <div className="relative">
        <div
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          tabIndex={0}
          role="region"
          aria-label={t.table}
          className="overflow-x-auto rounded-lg border border-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full text-sm" data-testid="compare-interpolated-table">
            <thead>
              <tr className="border-b border-border/30">
                <th className="sticky left-0 z-10 min-w-28 max-w-44 border-r border-border/30 bg-card px-3 py-2 text-left align-bottom text-xs font-medium text-muted-foreground sm:min-w-36">
                  {t.metric}
                </th>
                {columns.map((col, ci) => (
                  <th
                    key={ci}
                    className="min-w-36 border-r border-border/30 px-3 py-2 text-right font-medium last:border-r-0 sm:min-w-45"
                  >
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs text-muted-foreground">{t.interactivity}</span>
                      <Input
                        type="text"
                        aria-label={t.target(ci + 1)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={col.inputValue}
                        onChange={(e) => handleInputChange(ci, e.target.value)}
                        onBlur={() => handleInputBlur(ci)}
                        onKeyDown={(e) => handleKeyDown(ci, e)}
                        className={cn(
                          'w-20 text-right tabular-nums',
                          isInteractivityInputOutOfRange(
                            col.inputValue,
                            interactivityRange.min,
                            interactivityRange.max,
                          ) && 'border-destructive ring-2 ring-destructive/30',
                        )}
                        data-testid={`compare-table-target-${ci}`}
                        {...(isInteractivityInputOutOfRange(
                          col.inputValue,
                          interactivityRange.min,
                          interactivityRange.max,
                        ) && { 'data-compare-target-oob': 'true' })}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localizedMetrics.map((metric) => (
                <MetricTableRow
                  key={metric.label}
                  metric={metric}
                  columns={columns}
                  aLabel={aLabel}
                  bLabel={bLabel}
                  winnerClass={winnerClass}
                />
              ))}
            </tbody>
          </table>
        </div>
        {scroll.fade && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-lg bg-linear-to-l from-card to-transparent"
          />
        )}
      </div>
    </div>
  );
}

function MetricTableRow({
  metric,
  columns,
  aLabel,
  bLabel,
  winnerClass,
}: {
  metric: MetricRow;
  columns: ColumnData[];
  aLabel: string;
  bLabel: string;
  winnerClass: string;
}) {
  const cells = useMemo(
    () =>
      columns.map((col) => {
        const aVal = col.a ? metric.extract(col.a) : null;
        const bVal = col.b ? metric.extract(col.b) : null;

        let aWins = false;
        let bWins = false;
        if (aVal !== null && bVal !== null && aVal !== bVal) {
          if (metric.direction === 'higher') {
            aWins = aVal > bVal;
            bWins = bVal > aVal;
          } else {
            aWins = aVal < bVal;
            bWins = bVal < aVal;
          }
        }

        return { aVal, bVal, aWins, bWins };
      }),
    [columns, metric],
  );

  return (
    <tr className="border-t border-border/30">
      <td className="sticky left-0 z-1 min-w-36 max-w-44 whitespace-normal border-r border-border/30 bg-card px-3 py-2 text-muted-foreground">
        {metric.label}
      </td>
      {cells.map((cell, ci) => (
        <td key={ci} className="border-r border-border/30 px-3 py-2 last:border-r-0">
          <div className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-3 gap-y-0.5 whitespace-nowrap text-xs tabular-nums">
            <span className="text-muted-foreground">{aLabel}</span>
            <span
              className={cn(
                'text-right',
                cell.aWins ? winnerClass : cell.bWins ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {cell.aVal === null ? '—' : metric.format(cell.aVal)}
            </span>
            <span className="text-muted-foreground">{bLabel}</span>
            <span
              className={cn(
                'text-right',
                cell.bWins ? winnerClass : cell.aWins ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {cell.bVal === null ? '—' : metric.format(cell.bVal)}
            </span>
          </div>
        </td>
      ))}
    </tr>
  );
}
