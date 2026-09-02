'use client';

import { useCallback, useMemo, useState } from 'react';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';
import { Input } from '@/components/ui/input';

const STRINGS = {
  en: {
    hint: 'Interpolated from real benchmark data. Edit target interactivity values below to compare at different operating points.',
    metric: 'Metric',
    interactivity: 'Interactivity (tok/s/user)',
    table: 'Interpolated benchmark comparison',
    target: (n: number) => `Target interactivity ${n} (tok/s/user)`,
  },
  zh: {
    hint: '基于实测基准测试数据插值。修改下方目标交互速度，可比较不同运行点的表现。',
    metric: '指标',
    interactivity: '交互速度 (tok/s/user)',
    table: '基准测试插值对比',
    target: (n: number) => `目标交互速度 ${n} (tok/s/user)`,
  },
} as const;

const METRIC_LABELS_ZH: Record<string, string> = {
  'Throughput (tok/s/chip)': '吞吐量 (tok/s/chip)',
  'Cost ($/M tok)': '成本 ($/M tok)',
  'Dollar per Million Tokens': '每百万 token 成本',
  Concurrency: '并发数',
};

/** True when the field shows a positive finite number strictly outside [min, max]. */
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
  /** When set, only metric rows whose `label` is in this list are rendered.
   *  Undefined (the default) shows all four metrics. The /compare-per-dollar
   *  variant passes ['Cost ($/M tok)', 'Concurrency'] to slim the table down
   *  to the cost-efficiency view; /compare omits the prop. */
  visibleMetricLabels?: string[];
  /** Per-route display-label overrides keyed by the metric's internal `label`.
   *  Lets routes render a longer / more descriptive name in the cell without
   *  forking the METRICS table. Example: /compare-per-dollar overrides
   *  'Cost ($/M tok)' → 'Dollar per Million Tokens' so the page reads in full
   *  English to match its "Performance per Dollar" framing. */
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
  /** 'higher' = higher is better, 'lower' = lower is better */
  direction: 'higher' | 'lower';
}

const METRICS: MetricRow[] = [
  {
    label: 'Throughput (tok/s/chip)',
    extract: (r) => r.value,
    format: (v) => v.toFixed(1),
    direction: 'higher',
  },
  {
    label: 'Cost ($/M tok)',
    extract: (r) => r.cost,
    format: (v) => `$${v.toFixed(3)}`,
    direction: 'lower',
  },
  {
    label: 'tok/s/MW',
    extract: (r) => r.tpPerMw,
    format: (v) => v.toFixed(0),
    direction: 'higher',
  },
  {
    label: 'Concurrency',
    extract: (r) => r.concurrency,
    format: (v) => `~${Math.round(v)}`,
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

  /**
   * Commit the current inputValue for a column: parse, clamp, and re-interpolate.
   * Returns true if the value was valid and state was updated.
   */
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
        track('compare_table_target_changed', { colIndex });
      }
      return committed;
    },
    [interactivityRange],
  );

  /**
   * Handle input change: update inputValue immediately and re-interpolate if valid.
   * Consistent with calculator page behavior where typing updates results in real-time.
   */
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
        // Blur after a microtask so React flushes the state update first
        queueMicrotask(() => {
          e.currentTarget.blur();
        });
      }
    },
    [commitColumnTarget],
  );

  const winnerClass = 'text-primary font-semibold';

  if (columns.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-border/50">
      <div className="border-b border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {t.hint}
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={t.table}
        className="overflow-x-auto focus-visible:outline-none"
      >
        <table className="w-full text-sm" data-testid="compare-interpolated-table">
          <thead className="bg-muted/30">
            <tr className="border-b border-border/40">
              <th className="sticky left-0 z-10 min-w-36 max-w-44 border-r border-border/40 bg-card px-3 py-2 text-left font-medium text-muted-foreground backdrop-blur-sm">
                {t.metric}
              </th>
              {columns.map((col, ci) => (
                <th key={ci} className="px-3 py-2 text-center font-medium min-w-[180px]">
                  <div className="flex flex-col items-center gap-1">
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
                        'w-20 text-center tabular-nums',
                        isInteractivityInputOutOfRange(
                          col.inputValue,
                          interactivityRange.min,
                          interactivityRange.max,
                        ) && 'border-red-500 ring-4 ring-red-500/40 animate-pulse',
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
    <tr className="border-t border-border/40 odd:bg-muted/8">
      <td className="sticky left-0 z-1 min-w-36 max-w-44 whitespace-normal border-r border-border/40 bg-card px-3 py-2 text-muted-foreground backdrop-blur-sm">
        {metric.label}
      </td>
      {cells.map((cell, ci) => (
        <td key={ci} className="px-3 py-2 border-r border-border/40 last:border-r-0">
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={`tabular-nums text-xs ${cell.aWins ? winnerClass : 'text-foreground'}`}
            >
              <span className="text-muted-foreground mr-1">{aLabel}:</span>
              {cell.aVal === null ? '—' : metric.format(cell.aVal)}
            </span>
            <span
              className={`tabular-nums text-xs ${cell.bWins ? winnerClass : 'text-foreground'}`}
            >
              <span className="text-muted-foreground mr-1">{bLabel}:</span>
              {cell.bVal === null ? '—' : metric.format(cell.bVal)}
            </span>
          </div>
        </td>
      ))}
    </tr>
  );
}
