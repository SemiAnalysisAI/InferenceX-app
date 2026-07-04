'use client';

import { useMemo } from 'react';

import type { InterpolatedResult, CostType } from '@/components/calculator/types';
import {
  getThroughputForType,
  getTpPerMwForType,
} from '@/components/calculator/ThroughputBarChart';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import type { HardwareConfig } from '@/components/inference/types';
import { useLocale } from '@/lib/use-locale';
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

const STRINGS = {
  en: {
    throughputTotal: 'Total',
    throughputInput: 'Input',
    throughputOutput: 'Output',
    throughputSuffix: ' Throughput (tok/s/gpu)',
    costPrefix: 'Cost (',
    costSuffix: ')',
    concurrency: 'Concurrency',
    footer:
      'Values are interpolated from real InferenceMAX benchmark data points. Only GPUs with data in the measured range are shown.',
  },
  zh: {
    throughputTotal: '总',
    throughputInput: '输入',
    throughputOutput: '输出',
    throughputSuffix: '吞吐量 (tok/s/gpu)',
    costPrefix: '成本 (',
    costSuffix: ')',
    concurrency: '并发数',
    footer: '数值基于真实 InferenceMAX 基准测试数据插值计算。仅显示在测量范围内有数据的 GPU。',
  },
} as const;

export default function CalculatorTable({
  results,
  costType,
  hardwareConfig,
}: CalculatorTableProps) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const throughputLabel =
    costType === 'input'
      ? s.throughputInput
      : costType === 'output'
        ? s.throughputOutput
        : s.throughputTotal;
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
        header: `${throughputLabel}${s.throughputSuffix}`,
        align: 'right',
        cell: (r) => getThroughputForType(r, costType).toFixed(1),
        sortValue: (r) => getThroughputForType(r, costType),
        className: 'tabular-nums',
      },
      {
        header: `${s.costPrefix}${costLabel}${s.costSuffix}`,
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
        header: s.concurrency,
        align: 'right',
        cell: (r) => `~${r.concurrency}`,
        sortValue: (r) => r.concurrency,
        className: 'tabular-nums',
      },
    ],
    [costType, hardwareConfig, throughputLabel, costLabel, mwLabel, s],
  );

  return (
    <>
      <DataTable
        data={results}
        columns={columns}
        testId="calculator-results-table"
        analyticsPrefix="calculator_table"
      />
      <p className="text-xs text-muted-foreground mt-3">{s.footer}</p>
    </>
  );
}
