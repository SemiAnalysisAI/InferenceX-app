'use client';

import { useId, useMemo, useState } from 'react';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import { chipCounts } from '@/lib/chip-counts';
import { getNestedYValue, metricLabel, xAxisLabel } from '@/lib/chart-utils';
import { isModeledSystemPowerConfigKey } from '@/components/inference/metric-registry';
import { inferPowerCompare, powerSeriesLabel } from '@/components/inference/utils/power-compare';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import { getEqualServiceSources } from '@/components/inference/utils/equal-service-comparison';
import {
  powerBaselineDeltas,
  powerBaselineMetric,
} from '@/components/inference/utils/power-baseline';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';
import { getInferenceHardwareConfig } from '@/lib/inference-labels';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
}

const STRINGS = {
  en: {
    baseline: 'Baseline',
    baselineNote: 'Δ at the same concurrency, relative to the baseline.',
    baselineRow: 'baseline',
  },
  zh: {
    baseline: '基准配置',
    baselineNote: '差值为相同并发数下相对基准配置的变化。',
    baselineRow: '基准',
  },
};

/** Format a number for table display — picks sensible precision and groups thousands. */
export function formatInferenceTableNumber(value: number, decimals?: number): string {
  const fixedDecimals =
    decimals ??
    (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 1 : Math.abs(value) >= 0.01 ? 3 : 4);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fixedDecimals,
    maximumFractionDigits: fixedDecimals,
  }).format(value);
}

/** A difference with its sign; an exact zero reads `0`, not `0.0000`. */
export const signedTableNumber = (value: number, decimals?: number) =>
  value === 0
    ? formatInferenceTableNumber(0, decimals ?? 0)
    : `${value > 0 ? '+' : ''}${formatInferenceTableNumber(value, decimals)}`;

export function inferenceTableHeaderLabels(
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
  locale: Locale,
) {
  return {
    chip: locale === 'zh' ? '芯片' : 'Chip',
    precision: locale === 'zh' ? '精度' : 'Precision',
    tensorParallelism: 'TP',
    physicalChips: locale === 'zh' ? '物理芯片数' : 'Physical Chips',
    configuredChips: locale === 'zh' ? '配置中的芯片数' : 'Configured Chip Count',
    concurrency: locale === 'zh' ? '并发数' : 'Conc',
    series: locale === 'zh' ? '系列' : 'Series',
    yMetric: metricLabel(chartDefinition, selectedYAxisMetric, locale),
    xMetric: xAxisLabel(chartDefinition, locale),
    baselineDelta: locale === 'zh' ? '相对基准差值' : 'Δ vs baseline',
    throughput: locale === 'zh' ? '单芯片吞吐量 (tok/s)' : 'Throughput/Chip (tok/s)',
  };
}

export default function InferenceTable({
  data,
  chartDefinition,
  selectedYAxisMetric,
}: InferenceTableProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const baselineId = useId();
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  const showModeledPower = isModeledSystemPowerConfigKey(selectedYAxisMetric);
  const headers = useMemo(
    () => inferenceTableHeaderLabels(chartDefinition, selectedYAxisMetric, locale),
    [chartDefinition, selectedYAxisMetric, locale],
  );

  const sorted = useMemo(
    () => sortRowsByYMetric(data, chartDefinition, selectedYAxisMetric),
    [data, chartDefinition, selectedYAxisMetric],
  );
  // Boundary / role clones (`i_pcompare`) share every config column with their
  // base row; the series column is what tells them apart.
  const powerCompare = useMemo(() => inferPowerCompare(data), [data]);
  // A baseline the legend has hidden falls back to the first visible source and
  // returns with its series, so no effect needs to reset the choice.
  const baselineMetric = powerBaselineMetric(selectedYAxisMetric);
  const sources = useMemo(
    () => (baselineMetric ? getEqualServiceSources(data, locale) : []),
    [data, locale, baselineMetric],
  );
  const [chosenBaseline, setChosenBaseline] = useState<string | null>(null);
  const baseline =
    sources.find((source) => source.key === chosenBaseline)?.key ?? sources[0]?.key ?? null;
  const deltas = useMemo(
    () =>
      baselineMetric && baseline !== null
        ? powerBaselineDeltas(data, baseline, baselineMetric)
        : null,
    [data, baseline, baselineMetric],
  );

  const columns = useMemo<DataTableColumn<InferenceData>[]>(
    () => [
      {
        header: headers.chip,
        cell: (row) => getDisplayLabel(getInferenceHardwareConfig(row.hwKey, row.model, [row])),
        sortValue: (row) =>
          getDisplayLabel(getInferenceHardwareConfig(row.hwKey, row.model, [row])),
        className: 'font-medium whitespace-nowrap',
        importance: 'key',
        pinned: true,
      },
      {
        header: headers.precision,
        cell: (row) => (row.precision ? getPrecisionLabel(row.precision as Precision) : ''),
        sortValue: (row) => row.precision ?? '',
        className: 'whitespace-nowrap',
        importance: 'key',
      },
      ...(powerCompare === 'none'
        ? []
        : [
            {
              header: headers.series,
              cell: (row: InferenceData) =>
                powerSeriesLabel(row, selectedYAxisMetric, powerCompare, locale),
              sortValue: (row: InferenceData) =>
                powerSeriesLabel(row, selectedYAxisMetric, powerCompare, locale),
              className: 'whitespace-nowrap',
              importance: 'key' as const,
            },
          ]),
      {
        header: headers.tensorParallelism,
        align: 'right',
        cell: (row) => row.decode_tp ?? row.tp,
        sortValue: (row) => row.decode_tp ?? row.tp,
        className: 'tabular-nums',
        importance: 'secondary',
      },
      {
        header: headers.physicalChips,
        align: 'right',
        cell: (row) => chipCounts(row, showModeledPower).physical,
        sortValue: (row) => chipCounts(row, showModeledPower).physical,
        importance: 'secondary',
      },
      ...(showModeledPower
        ? [
            {
              header: headers.configuredChips,
              align: 'right' as const,
              cell: (row: InferenceData) => chipCounts(row, showModeledPower).configured,
              sortValue: (row: InferenceData) => chipCounts(row, showModeledPower).configured,
              importance: 'secondary' as const,
            },
          ]
        : []),
      {
        header: 'DP',
        align: 'right',
        cell: (row) => row.dp ?? '—',
        sortValue: (row) => row.dp ?? 0,
        importance: 'secondary',
      },
      {
        header: headers.concurrency,
        align: 'right',
        cell: (row) => row.conc,
        sortValue: (row) => row.conc,
        className: 'tabular-nums',
        importance: 'secondary',
      },
      {
        header: headers.yMetric,
        align: 'right',
        // Comparison clones keep the source metrics; y holds the plotted role/boundary.
        cell: (row) =>
          formatInferenceTableNumber(
            row.powerVariant || !yPath ? row.y : getNestedYValue(row, yPath),
          ),
        sortValue: (row) => (row.powerVariant || !yPath ? row.y : getNestedYValue(row, yPath)),
        className: 'tabular-nums',
        importance: 'key',
      },
      ...(deltas
        ? [
            {
              header: headers.baselineDelta,
              align: 'right' as const,
              cell: (row: InferenceData) => {
                const delta = deltas.get(row);
                if (delta?.status === 'observed') {
                  return `${signedTableNumber(delta.value)} (${signedTableNumber(delta.percent, 1)}%)`;
                }
                if (delta?.status === 'baseline') {
                  return <span className="text-muted-foreground">{t.baselineRow}</span>;
                }
                return '—';
              },
              sortValue: (row: InferenceData) => {
                const delta = deltas.get(row);
                if (delta?.status === 'observed') return delta.percent;
                return delta?.status === 'baseline' ? 0 : null;
              },
              className: 'tabular-nums',
              importance: 'key' as const,
            },
          ]
        : []),
      {
        header: headers.xMetric,
        align: 'right',
        cell: (row) => formatInferenceTableNumber(row.x),
        sortValue: (row) => row.x,
        className: 'tabular-nums',
        importance: 'key',
      },
      {
        header: headers.throughput,
        align: 'right',
        cell: (row) => formatInferenceTableNumber(row.tput_per_gpu ?? 0, 1),
        sortValue: (row) => row.tput_per_gpu ?? 0,
        className: 'tabular-nums',
        importance: 'key',
      },
    ],
    [yPath, headers, showModeledPower, powerCompare, selectedYAxisMetric, locale, deltas, t],
  );

  return (
    <div className="min-w-0 space-y-3">
      {deltas && (
        <div
          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
          data-testid="inference-table-baseline"
        >
          <label htmlFor={baselineId} className="text-sm font-medium whitespace-nowrap">
            {t.baseline}
          </label>
          <Select
            value={baseline ?? undefined}
            onValueChange={(value) => {
              setChosenBaseline(value);
              track('inference_table_baseline_changed');
            }}
          >
            <SelectTrigger
              id={baselineId}
              data-testid="inference-table-baseline-trigger"
              className="w-full sm:w-auto sm:max-w-md"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((source) => (
                <SelectItem key={source.key} value={source.key}>
                  {source.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t.baselineNote}</p>
        </div>
      )}
      <DataTable
        data={sorted}
        columns={columns}
        testId="inference-results-table"
        analyticsPrefix="inference_table"
      />
    </div>
  );
}
