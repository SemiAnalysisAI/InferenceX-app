'use client';

import { useMemo } from 'react';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { getHardwareConfig } from '@/lib/constants';
import { getNestedYValue } from '@/lib/chart-utils';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
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

export default function InferenceTable({
  data,
  chartDefinition,
  selectedYAxisMetric,
}: InferenceTableProps) {
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  const yLabel = chartDefinition[`${selectedYAxisMetric}_label` as keyof ChartDefinition] as string;
  const xLabel = chartDefinition.x_label;

  const sorted = useMemo(
    () => sortRowsByYMetric(data, chartDefinition, selectedYAxisMetric),
    [data, chartDefinition, selectedYAxisMetric],
  );

  const columns = useMemo<DataTableColumn<InferenceData>[]>(
    () => [
      {
        header: 'Chip',
        cell: (row) => getDisplayLabel(getHardwareConfig(row.hwKey, row.model)),
        sortValue: (row) => getDisplayLabel(getHardwareConfig(row.hwKey, row.model)),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: 'Precision',
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
        header: 'Conc',
        align: 'right',
        cell: (row) => row.conc,
        sortValue: (row) => row.conc,
        className: 'tabular-nums',
      },
      {
        header: yLabel,
        align: 'right',
        cell: (row) => formatInferenceTableNumber(yPath ? getNestedYValue(row, yPath) : row.y),
        sortValue: (row) => (yPath ? getNestedYValue(row, yPath) : row.y),
        className: 'tabular-nums',
      },
      {
        header: xLabel,
        align: 'right',
        cell: (row) => formatInferenceTableNumber(row.x),
        sortValue: (row) => row.x,
        className: 'tabular-nums',
      },
      {
        header: 'Throughput/Chip (tok/s)',
        align: 'right',
        cell: (row) => formatInferenceTableNumber(row.tput_per_gpu ?? 0, 1),
        sortValue: (row) => row.tput_per_gpu ?? 0,
        className: 'tabular-nums',
      },
    ],
    [yPath, yLabel, xLabel],
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
