'use client';

import { useMemo } from 'react';

import type { InterpolatedResult, CostType } from '@/components/calculator/types';
import {
  getThroughputForType,
  getTpPerMwForType,
} from '@/components/calculator/ThroughputBarChart';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import type { HardwareConfig } from '@/components/inference/types';
import { getDisplayLabel } from '@/lib/utils';

interface CalculatorTableProps {
  results: InterpolatedResult[];
  costType: CostType;
  hardwareConfig: HardwareConfig;
}

function getLabel(r: InterpolatedResult, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[r.hwKey];
  const baseName = config ? getDisplayLabel(config) : r.hwKey;
  return r.precision ? `${baseName} (${r.precision.toUpperCase()})` : baseName;
}

function getCost(r: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return r.costInput;
  if (costType === 'output') return r.costOutput;
  return r.cost;
}

export default function CalculatorTable({
  results,
  costType,
  hardwareConfig,
}: CalculatorTableProps) {
  const throughputLabel =
    costType === 'input' ? 'Input' : costType === 'output' ? 'Output' : 'Total';
  const costLabel = `$/M ${costType === 'input' ? 'input ' : costType === 'output' ? 'output ' : ''}tok`;
  const mwLabel =
    costType === 'input'
      ? 'Input tok/s/MW'
      : costType === 'output'
        ? 'Output tok/s/MW'
        : 'tok/s/MW';

  const columns = useMemo<DataTableColumn<InterpolatedResult>[]>(
    () => [
      {
        header: 'GPU',
        cell: (r) => getLabel(r, hardwareConfig),
        sortValue: (r) => getLabel(r, hardwareConfig),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: `${throughputLabel} Throughput (tok/s/gpu)`,
        align: 'right',
        cell: (r) => getThroughputForType(r, costType).toFixed(1),
        sortValue: (r) => getThroughputForType(r, costType),
        className: 'tabular-nums',
      },
      {
        header: `Cost (${costLabel})`,
        align: 'right',
        cell: (r) => `$${getCost(r, costType).toFixed(3)}`,
        sortValue: (r) => getCost(r, costType),
        className: 'tabular-nums',
      },
      {
        header: mwLabel,
        align: 'right',
        cell: (r) => getTpPerMwForType(r, costType).toFixed(0),
        sortValue: (r) => getTpPerMwForType(r, costType),
        className: 'tabular-nums',
      },
      {
        header: 'Concurrency',
        align: 'right',
        cell: (r) => `~${r.concurrency}`,
        sortValue: (r) => r.concurrency,
        className: 'tabular-nums',
      },
    ],
    [costType, hardwareConfig, throughputLabel, costLabel, mwLabel],
  );

  return (
    <>
      <DataTable
        data={results}
        columns={columns}
        testId="calculator-results-table"
        analyticsPrefix="calculator_table"
      />
      <p className="text-xs text-muted-foreground mt-3">
        Values are interpolated from real InferenceMAX benchmark data points. Only GPUs with data in
        the measured range are shown.
      </p>
    </>
  );
}
