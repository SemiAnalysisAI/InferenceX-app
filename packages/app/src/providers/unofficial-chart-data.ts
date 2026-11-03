import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants';

import type { ChartDefinition, HardwareConfig, InferenceData } from '@/components/inference/types';
import chartDefinitions from '@/components/inference/metric-registry';
import type { BenchmarkRow } from '@/lib/api/api';
import { benchmarkCurveDate } from '@/lib/benchmarks/benchmark-run-selection';
import { transformBenchmarkRows, type TokenBasis } from '@/lib/benchmarks/benchmark-transform';
import { DEFAULT_CHIP_BASIS, type ChipBasis } from '@/lib/benchmarks/chip-basis';

export type UnofficialChartData = Record<
  string,
  {
    e2e: { data: InferenceData[]; gpus: HardwareConfig };
    interactivity: { data: InferenceData[]; gpus: HardwareConfig };
  }
>;

export function buildChartData(
  benchmarks: BenchmarkRow[],
  tokenBasis: TokenBasis = 'total',
  chipBasis: ChipBasis = DEFAULT_CHIP_BASIS,
): UnofficialChartData {
  const groups = new Map<string, BenchmarkRow[]>();
  for (const row of benchmarks) {
    const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
    const sequence = rowToSequence(row);
    if (!sequence) continue;
    const key = `${displayModel}_${sequence}`;
    if (!groups.has(key)) groups.set(key, []);
    const chartRow = {
      ...row,
      date: benchmarkCurveDate(row),
      actualDate: row.date,
    };
    groups.get(key)!.push(chartRow);
  }

  const result: UnofficialChartData = {};
  for (const [key, rows] of groups) {
    const { chartData, hardwareConfig } = transformBenchmarkRows(
      rows,
      'median',
      'external',
      tokenBasis,
      chipBasis,
    );
    const e2eIdx = (chartDefinitions as ChartDefinition[]).findIndex((d) => d.chartType === 'e2e');
    const interactivityIdx = (chartDefinitions as ChartDefinition[]).findIndex(
      (d) => d.chartType === 'interactivity',
    );
    result[key] = {
      e2e: { data: chartData[e2eIdx] ?? [], gpus: hardwareConfig },
      interactivity: {
        data: chartData[interactivityIdx] ?? [],
        gpus: hardwareConfig,
      },
    };
  }
  return result;
}
