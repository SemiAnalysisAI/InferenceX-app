'use client';

import { useMemo } from 'react';

import { useInference } from '@/components/inference/InferenceContext';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { track } from '@/lib/analytics';
import { getHardwareConfig } from '@/lib/constants';
import { getNestedYValue } from '@/lib/chart-utils';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
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
  const { openReproduceDrawer } = useInference();
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  const yLabel = chartDefinition[`${selectedYAxisMetric}_label` as keyof ChartDefinition] as string;
  const xLabel = chartDefinition.x_label;

  const rooflineDir = chartDefinition[
    `${selectedYAxisMetric}_roofline` as keyof ChartDefinition
  ] as string | undefined;
  const yAscending = rooflineDir?.startsWith('lower');

  const sorted = useMemo(() => {
    if (!yPath) return data;
    return [...data].toSorted((a, b) => {
      const ay = getNestedYValue(a, yPath);
      const by = getNestedYValue(b, yPath);
      return yAscending ? ay - by : by - ay;
    });
  }, [data, yPath, yAscending]);

  const columns = useMemo<DataTableColumn<InferenceData>[]>(
    () => [
      {
        header: 'GPU',
        cell: (row) => getDisplayLabel(getHardwareConfig(row.hwKey)),
        sortValue: (row) => getDisplayLabel(getHardwareConfig(row.hwKey)),
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
        header: 'Throughput/GPU (tok/s)',
        align: 'right',
        cell: (row) => fmt(row.tput_per_gpu ?? 0, 1),
        sortValue: (row) => row.tput_per_gpu ?? 0,
        className: 'tabular-nums',
      },
      {
        header: 'Median TTFT (ms)',
        align: 'right',
        cell: (row) => fmt((row.median_ttft ?? 0) * 1000, 0),
        sortValue: (row) => row.median_ttft ?? 0,
        className: 'tabular-nums',
      },
      {
        header: 'Median Interactivity (tok/s)',
        align: 'right',
        cell: (row) => fmt(row.median_intvty ?? 0, 1),
        sortValue: (row) => row.median_intvty ?? 0,
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
      onRowClick={(row) => {
        track('inference_table_reproduce_clicked', {
          framework: row.framework,
          hwKey: row.hwKey,
          precision: row.precision,
          tp: row.tp,
          conc: row.conc,
        });
        openReproduceDrawer(row, 'inference_table');
      }}
    />
  );
}
