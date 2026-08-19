'use client';

import { useMemo } from 'react';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { getHardwareConfig } from '@/lib/constants';
import { getNestedYValue, metricLabel } from '@/lib/chart-utils';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { p50Interactivity } from '@/lib/interactivity-metrics';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
}

const STRINGS = {
  en: {
    chip: 'Chip',
    precision: 'Precision',
    concurrency: 'Conc',
    throughputPerChip: 'Throughput/Chip (tok/s)',
    medianTtft: 'Median TTFT (ms)',
    p50Interactivity: 'P50 Interactivity (tok/s/user)',
  },
  zh: {
    chip: 'Chip',
    precision: '精度',
    concurrency: '并发数',
    throughputPerChip: '吞吐量/Chip (tok/s)',
    medianTtft: '中位 TTFT (ms)',
    p50Interactivity: 'P50 交互性 (tok/s/user)',
  },
} as const;

function xAxisLabel(label: string, locale: 'en' | 'zh'): string {
  if (locale === 'en') return label;
  return label
    .replace('Time To First Token', '首 token 延迟（TTFT）')
    .replace('End-to-end Latency', '端到端延迟')
    .replace('Interactivity', '交互性');
}

/** Format a number for table display — picks sensible precision based on magnitude. */
function fmt(value: number, decimals?: number): string {
  if (decimals !== undefined) return value.toFixed(decimals);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(1);
  if (Math.abs(value) >= 0.01) return value.toFixed(3);
  return value.toFixed(4);
}

export default function InferenceTable({
  data,
  chartDefinition,
  selectedYAxisMetric,
}: InferenceTableProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  const yLabel = metricLabel(chartDefinition, selectedYAxisMetric, locale);
  const xLabel = xAxisLabel(chartDefinition.x_label, locale);

  const sorted = useMemo(
    () => sortRowsByYMetric(data, chartDefinition, selectedYAxisMetric),
    [data, chartDefinition, selectedYAxisMetric],
  );

  const columns = useMemo<DataTableColumn<InferenceData>[]>(
    () => [
      {
        header: t.chip,
        cell: (row) => getDisplayLabel(getHardwareConfig(row.hwKey, row.model)),
        sortValue: (row) => getDisplayLabel(getHardwareConfig(row.hwKey, row.model)),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: t.precision,
        cell: (row) => (row.precision ? getPrecisionLabel(row.precision as Precision) : ''),
        sortValue: (row) => row.precision ?? '',
        className: 'whitespace-nowrap',
      },
      {
        header: 'TP',
        align: 'right',
        cell: (row) => row.tp,
        sortValue: (row) => row.tp,
        className: 'tabular-nums',
      },
      {
        header: t.concurrency,
        align: 'right',
        cell: (row) => row.conc,
        sortValue: (row) => row.conc,
        className: 'tabular-nums',
      },
      {
        header: yLabel,
        align: 'right',
        cell: (row) => fmt(yPath ? getNestedYValue(row, yPath) : row.y),
        sortValue: (row) => (yPath ? getNestedYValue(row, yPath) : row.y),
        className: 'tabular-nums',
      },
      {
        header: xLabel,
        align: 'right',
        cell: (row) => fmt(row.x),
        sortValue: (row) => row.x,
        className: 'tabular-nums',
      },
      {
        header: t.throughputPerChip,
        align: 'right',
        cell: (row) => fmt(row.tput_per_gpu ?? 0, 1),
        sortValue: (row) => row.tput_per_gpu ?? 0,
        className: 'tabular-nums',
      },
      {
        header: t.medianTtft,
        align: 'right',
        cell: (row) => fmt((row.median_ttft ?? 0) * 1000, 0),
        sortValue: (row) => row.median_ttft ?? 0,
        className: 'tabular-nums',
      },
      {
        header: t.p50Interactivity,
        align: 'right',
        cell: (row) => fmt(p50Interactivity(row), 1),
        sortValue: p50Interactivity,
        className: 'tabular-nums',
      },
    ],
    [t, yPath, yLabel, xLabel],
  );

  return (
    <DataTable
      data={sorted}
      columns={columns}
      testId="inference-results-table"
      analyticsPrefix="inference_table"
    />
  );
}
