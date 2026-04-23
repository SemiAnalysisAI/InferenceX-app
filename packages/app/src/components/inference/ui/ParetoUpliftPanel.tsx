'use client';

import { Info } from 'lucide-react';
import { useMemo } from 'react';

import type {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  OverlayData,
} from '@/components/inference/types';
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  computeMeanUplift,
  computeUplift,
  formatUpliftPercent,
  type MeanUpliftResult,
  type RooflineDirection,
  type UpliftResult,
} from '@/lib/pareto-uplift';
import { getModelSortIndex } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';

interface ParetoUpliftPanelProps {
  /** Chart data (already filtered by useChartData — includes main + comparison-date points). */
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
  hardwareConfig: HardwareConfig;
  activeHwTypes: Set<string>;
  activeDates: Set<string>;
  selectedPrecisions: string[];
  /** Main (official) run date. Used as the reference when no unofficial overlay is present. */
  selectedRunDate: string;
  /** Discrete comparison dates selected by the user. */
  selectedDates: string[];
  /** Range endpoints, used when the user picks a date range instead of individual dates. */
  selectedDateRange: { startDate: string; endDate: string };
  isTimelineMode: boolean;
  /** When an unofficial PR run is active, these points become the reference instead of the main date. */
  overlayData?: OverlayData;
  chartType: string;
}

interface ColumnSpec {
  id: string;
  label: string;
  hint?: string;
  date: string;
}

/** Scalar time / interactivity stats added beneath each GPU's primary Pareto row. */
interface ScalarMetric {
  id: string;
  label: string;
  field: keyof InferenceData;
  higherIsBetter: boolean;
  /** Unit shown in the tooltip. */
  unit: string;
}

const SCALAR_METRICS: ScalarMetric[] = [
  {
    id: 'median_ttft',
    label: 'Median TTFT',
    field: 'median_ttft',
    higherIsBetter: false,
    unit: 's',
  },
  { id: 'p99_ttft', label: 'P99 TTFT', field: 'p99_ttft', higherIsBetter: false, unit: 's' },
  {
    id: 'median_tpot',
    label: 'Median TPOT',
    field: 'median_tpot',
    higherIsBetter: false,
    unit: 's',
  },
  {
    id: 'median_e2el',
    label: 'Median E2EL',
    field: 'median_e2el',
    higherIsBetter: false,
    unit: 's',
  },
  {
    id: 'median_intvty',
    label: 'Interactivity',
    field: 'median_intvty',
    higherIsBetter: true,
    unit: 'tok/s/user',
  },
];

type CellValue =
  | { kind: 'pareto'; uplift: UpliftResult }
  | { kind: 'mean'; uplift: MeanUpliftResult; metric: ScalarMetric }
  | null;

interface Row {
  rowKey: string;
  /** GPU display label shown only on the first row of each group. */
  gpuLabel: string;
  /** Metric label shown in the "Metric" column. */
  metricLabel: string;
  /** True for the first row of each GPU group (used for a subtle top border). */
  isFirstInGroup: boolean;
  cells: { columnId: string; value: CellValue }[];
}

/**
 * Historical uplift table: rows = (GPU × metric), columns = comparison dates.
 *
 * Per GPU: one "primary" row for the chart's Pareto-curve uplift plus one scalar row per time
 * stat (Median/P99 TTFT, Median TPOT, Median E2EL, Median Interactivity). Scalar cells compare
 * the arithmetic mean of each metric between the reference and the historical date, normalized
 * so &gt;1 always reads "reference is better".
 *
 * Reference = unofficial PR overlay when present, else the main run date. Built for the PR
 * review workflow — "does my branch regress H100 Dynamo-TRT vs last Friday's main?"
 */
export default function ParetoUpliftPanel({
  data,
  chartDefinition,
  selectedYAxisMetric,
  hardwareConfig,
  activeHwTypes,
  activeDates,
  selectedPrecisions,
  selectedRunDate,
  selectedDates,
  selectedDateRange,
  isTimelineMode,
  overlayData,
  chartType,
}: ParetoUpliftPanelProps) {
  const rooflineDir = chartDefinition[
    `${selectedYAxisMetric}_roofline` as keyof ChartDefinition
  ] as RooflineDirection | undefined;

  const primaryLabel = useMemo(() => {
    const titleKey = `${selectedYAxisMetric}_title` as keyof ChartDefinition;
    const title = chartDefinition[titleKey];
    return typeof title === 'string' && title.length > 0 ? title : 'Primary';
  }, [chartDefinition, selectedYAxisMetric]);

  const hasUnofficial = Boolean(overlayData && overlayData.data.length > 0);

  const visibleData = useMemo(
    () =>
      data.filter((d) => {
        if (isTimelineMode) return activeDates.has(`${d.date}_${d.hwKey}`);
        return activeHwTypes.has(d.hwKey) && selectedPrecisions.includes(d.precision ?? '');
      }),
    [data, isTimelineMode, activeDates, activeHwTypes, selectedPrecisions],
  );

  const columns = useMemo<ColumnSpec[]>(() => {
    const seen = new Set<string>();
    const cols: ColumnSpec[] = [];
    const push = (date: string, hint?: string) => {
      if (!date || seen.has(date)) return;
      seen.add(date);
      cols.push({ id: date, date, label: date, hint });
    };
    if (hasUnofficial && selectedRunDate) push(selectedRunDate, 'main');
    if (selectedDateRange.startDate) push(selectedDateRange.startDate, 'range start');
    if (selectedDateRange.endDate) push(selectedDateRange.endDate, 'range end');
    for (const d of selectedDates) push(d);
    return cols.toSorted((a, b) => b.date.localeCompare(a.date));
  }, [hasUnofficial, selectedRunDate, selectedDates, selectedDateRange]);

  const { referenceByHw, historyByKey } = useMemo(() => {
    const refByHw = new Map<string, InferenceData[]>();
    const histByKey = new Map<string, InferenceData[]>();

    if (hasUnofficial && overlayData) {
      for (const p of overlayData.data) {
        if (!activeHwTypes.has(p.hwKey)) continue;
        const arr = refByHw.get(p.hwKey);
        if (arr) arr.push(p);
        else refByHw.set(p.hwKey, [p]);
      }
    }

    for (const p of visibleData) {
      if (!hasUnofficial && p.date === selectedRunDate) {
        const arr = refByHw.get(p.hwKey);
        if (arr) arr.push(p);
        else refByHw.set(p.hwKey, [p]);
      }
      const isHistorical = hasUnofficial ? true : p.date !== selectedRunDate;
      if (isHistorical) {
        const key = `${p.hwKey}|${p.date}`;
        const arr = histByKey.get(key);
        if (arr) arr.push(p);
        else histByKey.set(key, [p]);
      }
    }
    return { referenceByHw: refByHw, historyByKey: histByKey };
  }, [visibleData, overlayData, hasUnofficial, activeHwTypes, selectedRunDate]);

  const rows = useMemo<Row[]>(() => {
    if (columns.length === 0 || referenceByHw.size === 0) return [];

    const sortedHwKeys = [...referenceByHw.keys()].toSorted(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );

    const result: Row[] = [];
    for (const hwKey of sortedHwKeys) {
      const refPoints = referenceByHw.get(hwKey)!;
      const cfg = hardwareConfig[hwKey];
      const gpuLabel = cfg ? getDisplayLabel({ label: cfg.label, suffix: cfg.suffix }) : hwKey;

      const groupRows: Row[] = [];

      // Primary Pareto-uplift row (only when the chart has a roofline direction AND enough ref pts).
      if (rooflineDir && refPoints.length >= 2) {
        const cells = columns.map((col) => {
          const histPoints = historyByKey.get(`${hwKey}|${col.date}`);
          if (!histPoints || histPoints.length < 2) {
            return { columnId: col.id, value: null };
          }
          const uplift = computeUplift(histPoints, refPoints, rooflineDir);
          return {
            columnId: col.id,
            value:
              Number.isFinite(uplift.geomean) && uplift.samples.length > 0
                ? ({ kind: 'pareto', uplift } as const)
                : null,
          };
        });
        if (cells.some((c) => c.value !== null)) {
          groupRows.push({
            rowKey: `${hwKey}|__primary`,
            gpuLabel,
            metricLabel: primaryLabel,
            isFirstInGroup: true,
            cells,
          });
        }
      }

      // Scalar rows: arithmetic-mean ratio per metric.
      for (const metric of SCALAR_METRICS) {
        const cells = columns.map((col) => {
          const histPoints = historyByKey.get(`${hwKey}|${col.date}`);
          if (!histPoints || histPoints.length === 0) {
            return { columnId: col.id, value: null };
          }
          const uplift = computeMeanUplift(
            histPoints,
            refPoints,
            metric.field,
            metric.higherIsBetter,
          );
          return {
            columnId: col.id,
            value: Number.isFinite(uplift.ratio)
              ? ({ kind: 'mean', uplift, metric } as const)
              : null,
          };
        });
        if (cells.some((c) => c.value !== null)) {
          groupRows.push({
            rowKey: `${hwKey}|${metric.id}`,
            gpuLabel,
            metricLabel: metric.label,
            isFirstInGroup: groupRows.length === 0,
            cells,
          });
        }
      }

      if (groupRows.length > 0) result.push(...groupRows);
    }
    return result;
  }, [referenceByHw, historyByKey, columns, rooflineDir, hardwareConfig, primaryLabel]);

  if (!hasUnofficial && columns.length === 0) return null;
  if (rows.length === 0) return null;

  const referenceLabel =
    hasUnofficial && overlayData
      ? `Reference: PR · ${overlayData.label}`
      : `Reference: ${selectedRunDate || 'current'}`;

  return (
    <div
      data-testid="pareto-uplift-panel"
      data-chart-type={chartType}
      className="mt-3 rounded-md border border-border/40 bg-muted/20 p-3 text-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">Performance uplift</span>
          <TooltipProvider>
            <TooltipRoot delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-help"
                  aria-label="About this metric"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs leading-relaxed">
                  How the reference set (PR overlay or current run) compares to each historical
                  date, per GPU+framework. The first row per GPU is the Pareto-curve uplift for the
                  chart's y-metric (geomean of per-SLA ratios across the x-overlap). The following
                  rows compare the arithmetic mean of each time stat. All cells are
                  direction-normalized so &gt;1 = reference is better.
                </p>
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>
        <span className="text-xs text-muted-foreground">{referenceLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/40">
              <th className="sticky left-0 bg-muted/20 text-left font-medium text-muted-foreground py-1 pr-3">
                GPU
              </th>
              <th className="text-left font-medium text-muted-foreground py-1 pr-3">Metric</th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="text-right font-medium text-muted-foreground py-1 px-2 whitespace-nowrap"
                >
                  vs {col.label}
                  {col.hint && <span className="ml-1 text-[10px] opacity-70">({col.hint})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowKey}
                className={row.isFirstInGroup ? 'border-t border-border/40' : ''}
              >
                <td className="sticky left-0 bg-muted/20 py-1 pr-3 truncate max-w-[14rem]">
                  {row.isFirstInGroup ? row.gpuLabel : ''}
                </td>
                <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">
                  {row.metricLabel}
                </td>
                {row.cells.map((cell) => (
                  <UpliftCell key={cell.columnId} value={cell.value} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UpliftCell({ value }: { value: CellValue }) {
  if (!value) {
    return <td className="py-1 px-2 text-right text-muted-foreground">—</td>;
  }
  const ratio = value.kind === 'pareto' ? value.uplift.geomean : value.uplift.ratio;
  const pct = formatUpliftPercent(ratio);
  const isBetter = ratio > 1.0005;
  const isWorse = ratio < 0.9995;
  const color = isBetter ? 'text-emerald-500' : isWorse ? 'text-red-500' : 'text-muted-foreground';

  const tooltip =
    value.kind === 'pareto' ? (
      <p className="text-xs">
        Pareto geomean across {value.uplift.samples.length} SLA samples, covering{' '}
        {Math.round(value.uplift.coverage * 100)}% of the union x-range.
        {value.uplift.coverage < 0.5 && ' ⚠ Narrow overlap — inspect the curves.'}
      </p>
    ) : (
      <p className="text-xs">
        Mean reference: {formatValue(value.uplift.meanCandidate, value.metric.unit)} · Mean
        historical: {formatValue(value.uplift.meanBaseline, value.metric.unit)}
        <br />
        Based on {value.uplift.countCandidate} ref / {value.uplift.countBaseline} historical points.
      </p>
    );

  return (
    <td className="py-1 px-2 text-right">
      <TooltipProvider>
        <TooltipRoot delayDuration={150}>
          <TooltipTrigger asChild>
            <span className={`font-mono tabular-nums ${color} cursor-help`}>{pct}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    </td>
  );
}

function formatValue(v: number, unit: string): string {
  if (!Number.isFinite(v)) return '—';
  if (unit === 's') {
    if (v < 0.001) return `${(v * 1_000_000).toFixed(0)} µs`;
    if (v < 1) return `${(v * 1000).toFixed(1)} ms`;
    return `${v.toFixed(2)} s`;
  }
  return `${v.toFixed(1)} ${unit}`;
}
