'use client';

import { useMemo } from 'react';

import type { InterpolatedResult, CostType } from '@/components/calculator/types';
import {
  getThroughputForType,
  getTpPerMwForType,
} from '@/components/calculator/ThroughputBarChart';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import type { HardwareConfig } from '@/components/inference/types';
import type { Locale } from '@/lib/i18n';
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
    chip: 'Chip',
    throughputTotal: 'Total',
    throughputInput: 'Input',
    throughputOutput: 'Output',
    throughputSuffix: ' Throughput (tok/s/chip)',
    costPrefix: 'Cost (',
    costSuffix: ')',
    concurrency: 'Concurrency',
    mwInput: 'Input tok/s/MW',
    mwOutput: 'Output tok/s/MW',
    mwTotal: 'tok/s/MW',
    footer:
      'Values are interpolated from real InferenceMAX benchmark data points. Only chips with data in the measured range are shown.',
  },
  zh: {
    chip: '芯片',
    throughputTotal: '总',
    throughputInput: '输入',
    throughputOutput: '输出',
    throughputSuffix: '吞吐量 (tok/s/chip)',
    costPrefix: '成本 (',
    costSuffix: ')',
    concurrency: '并发数',
    mwInput: '输入吞吐量 (tok/s/MW)',
    mwOutput: '输出吞吐量 (tok/s/MW)',
    mwTotal: '总吞吐量 (tok/s/MW)',
    footer: '数值基于真实 InferenceMAX 基准测试数据插值计算。仅显示在测量范围内有数据的芯片。',
  },
} as const;

export function formatCalculatorTableNumber(
  value: number,
  fractionDigits: number,
  locale: Locale,
): string {
  if (locale === 'en') return value.toFixed(fractionDigits);
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

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
  const mwLabel = costType === 'input' ? s.mwInput : costType === 'output' ? s.mwOutput : s.mwTotal;

  const columns = useMemo<DataTableColumn<InterpolatedResult>[]>(
    () => [
      {
        header: s.chip,
        cell: (r) => getLabel(r, hardwareConfig),
        sortValue: (r) => getLabel(r, hardwareConfig),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: `${throughputLabel}${s.throughputSuffix}`,
        align: 'right',
        cell: (r) => formatCalculatorTableNumber(getThroughputForType(r, costType), 1, locale),
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
        cell: (r) => formatCalculatorTableNumber(getTpPerMwForType(r, costType), 0, locale),
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
    [costType, hardwareConfig, throughputLabel, costLabel, mwLabel, locale, s],
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
