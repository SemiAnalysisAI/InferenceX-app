'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

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
}

interface ColumnData {
  target: number;
  inputValue: string;
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
    label: 'Throughput (tok/s/gpu)',
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
}: CompareInterpolatedTableProps) {
  const [columns, setColumns] = useState<ColumnData[]>(() =>
    defaultTargets.map((target, i) => ({
      target,
      inputValue: String(target),
      a: ssrRows[i]?.a ?? null,
      b: ssrRows[i]?.b ?? null,
    })),
  );

  const hasClientDataA = gpuDataPointsA.length > 0;
  const hasClientDataB = gpuDataPointsB.length > 0;
  const hasClientData = hasClientDataA || hasClientDataB;

  // When client-side data changes (model/sequence/precision), recompute all columns
  useEffect(() => {
    if (!hasClientData) return;
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        a: hasClientDataA
          ? interpolateForGPU(gpuDataPointsA, col.target, 'interactivity_to_throughput', 'costh')
          : col.a,
        b: hasClientDataB
          ? interpolateForGPU(gpuDataPointsB, col.target, 'interactivity_to_throughput', 'costh')
          : col.b,
      })),
    );
  }, [gpuDataPointsA, gpuDataPointsB, hasClientData, hasClientDataA, hasClientDataB]);

  const reinterpolate = useCallback(
    (target: number, prevA: InterpolatedResult | null, prevB: InterpolatedResult | null) => {
      const resultA = hasClientDataA
        ? interpolateForGPU(gpuDataPointsA, target, 'interactivity_to_throughput', 'costh')
        : prevA;
      const resultB = hasClientDataB
        ? interpolateForGPU(gpuDataPointsB, target, 'interactivity_to_throughput', 'costh')
        : prevB;
      return { a: resultA, b: resultB };
    },
    [gpuDataPointsA, gpuDataPointsB, hasClientDataA, hasClientDataB],
  );

  /**
   * Commit the current inputValue for a column: parse, clamp, and re-interpolate.
   * Returns true if the value was valid and state was updated.
   */
  const commitColumnTarget = useCallback(
    (colIndex: number): boolean => {
      let committed = false;
      setColumns((prev) => {
        const next = [...prev];
        const col = next[colIndex];
        const parsed = parseFloat(col.inputValue);

        if (isNaN(parsed) || parsed <= 0) {
          next[colIndex] = { ...col, inputValue: String(col.target) };
          return next;
        }

        const clamped = Math.round(
          Math.max(interactivityRange.min, Math.min(interactivityRange.max, parsed)),
        );
        const results = reinterpolate(clamped, col.a, col.b);
        next[colIndex] = {
          target: clamped,
          inputValue: String(clamped),
          ...results,
        };
        committed = true;
        return next;
      });
      if (committed) {
        track('compare_table_target_changed', { colIndex });
      }
      return committed;
    },
    [interactivityRange, reinterpolate],
  );

  /**
   * Handle input change: update inputValue immediately and re-interpolate if valid.
   * Consistent with calculator page behavior where typing updates results in real-time.
   */
  const handleInputChange = useCallback(
    (colIndex: number, value: string) => {
      setColumns((prev) => {
        const next = [...prev];
        const col = next[colIndex];
        const parsed = parseFloat(value);

        // If valid number, update both inputValue and interpolated results
        if (!isNaN(parsed) && parsed > 0) {
          const clamped = Math.round(
            Math.max(interactivityRange.min, Math.min(interactivityRange.max, parsed)),
          );
          const results = reinterpolate(clamped, col.a, col.b);
          next[colIndex] = {
            target: clamped,
            inputValue: value,
            ...results,
          };
        } else {
          next[colIndex] = { ...next[colIndex], inputValue: value };
        }
        return next;
      });
    },
    [
      hasClientData,
      hasClientDataA,
      hasClientDataB,
      interactivityRange,
      reinterpolate,
      gpuDataPointsA,
    ],
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
    <div className="border border-border/50 rounded-md overflow-hidden">
      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border/50">
        Interpolated from real benchmark data. Edit target interactivity values below to compare at
        different operating points.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="compare-interpolated-table">
          <thead>
            <tr className="border-b border-border/40">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[160px]">
                Metric
              </th>
              {columns.map((col, ci) => (
                <th key={ci} className="px-3 py-2 text-center font-medium min-w-[180px]">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      Interactivity (tok/s/user)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={col.inputValue}
                      onChange={(e) => handleInputChange(ci, e.target.value)}
                      onBlur={() => handleInputBlur(ci)}
                      onKeyDown={(e) => handleKeyDown(ci, e)}
                      className={cn(
                        'w-20 h-7 rounded-md border border-border bg-background px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring',
                        isInteractivityInputOutOfRange(
                          col.inputValue,
                          interactivityRange.min,
                          interactivityRange.max,
                        ) &&
                          'border-red-500 ring-4 ring-red-500/40 animate-pulse focus:ring-red-500/50',
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
            {METRICS.map((metric) => (
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
    <tr className="border-t border-border/40">
      <td className="px-3 py-2 text-muted-foreground border-r border-border/40 whitespace-nowrap">
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
