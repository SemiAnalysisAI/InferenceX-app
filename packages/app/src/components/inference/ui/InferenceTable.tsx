'use client';

import { useMemo, useState } from 'react';

import type { AggDataEntry, ChartDefinition, InferenceData } from '@/components/inference/types';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { chipCounts } from '@/lib/chip-counts';
import { getNestedYValue, metricLabel, xAxisLabel } from '@/lib/chart-utils';
import { isModeledSystemPowerConfigKey } from '@/components/inference/metric-registry';
import { inferPowerCompare, powerSeriesLabel } from '@/components/inference/utils/power-compare';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';
import { getInferenceHardwareConfig } from '@/lib/inference-labels';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';
import PowerComparisonTable from './PowerComparisonTable';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
  interactivityField?: keyof AggDataEntry;
}

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
    throughput: locale === 'zh' ? '单芯片吞吐量 (tok/s)' : 'Throughput/Chip (tok/s)',
  };
}

export default function InferenceTable({
  data,
  chartDefinition,
  selectedYAxisMetric,
  interactivityField = 'median_intvty',
}: InferenceTableProps) {
  const locale = useLocale();
  const [mode, setMode] = useState('measurements');
  const canComparePower =
    selectedYAxisMetric === 'y_measuredAvgPower' ||
    selectedYAxisMetric === 'y_measuredJPerOutputToken';
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
    [yPath, headers, showModeledPower, powerCompare, selectedYAxisMetric, locale],
  );

  return (
    <div className="min-w-0 space-y-3">
      {canComparePower && (
        <SegmentedToggle
          value={mode}
          options={[
            { value: 'measurements', label: locale === 'zh' ? '实测数据' : 'Measurements' },
            {
              value: 'comparison',
              label: locale === 'zh' ? '功耗与能耗对比' : 'Compare power & energy',
            },
          ]}
          ariaLabel={locale === 'zh' ? '表格内容' : 'Table content'}
          role="group"
          testId="inference-table-content"
          onValueChange={(value) => {
            setMode(value);
            track('inference_table_content_changed', { mode: value });
          }}
        />
      )}
      {canComparePower && mode === 'comparison' ? (
        <PowerComparisonTable
          data={data}
          xField={chartDefinition.x_scale_field as keyof AggDataEntry}
          xLabel={headers.xMetric}
          interactivityField={interactivityField}
        />
      ) : (
        <DataTable
          data={sorted}
          columns={columns}
          testId="inference-results-table"
          analyticsPrefix="inference_table"
        />
      )}
    </div>
  );
}
