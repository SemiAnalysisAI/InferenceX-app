import type { ChartDefinition, HardwareConfig, InferenceData } from '@/components/inference/types';
import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@/lib/api';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { Model, Sequence } from '@/lib/data-mappings';

export interface UnofficialRunInfo {
  id: number;
  name: string;
  branch: string;
  sha: string;
  createdAt: string;
  url: string;
  conclusion: string;
  status: string;
  isNonMainBranch: boolean;
}

export type UnofficialChartData = Record<
  string,
  {
    e2e: { data: InferenceData[]; gpus: HardwareConfig };
    interactivity: { data: InferenceData[]; gpus: HardwareConfig };
  }
>;

export interface AvailableModelSequence {
  model: Model;
  sequence: Sequence;
  precisions: string[];
}

/** Build chart data from raw benchmark rows returned by the unofficial-run API. */
export function buildChartData(benchmarks: BenchmarkRow[]): UnofficialChartData {
  // Group benchmarks by display model name + Sequence enum value
  // (keys must match getOverlayData which looks up `${Model}_${Sequence}`)
  const groups = new Map<string, BenchmarkRow[]>();
  for (const row of benchmarks) {
    const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
    const sequence = islOslToSequence(row.isl, row.osl);
    if (!sequence) continue;
    const key = `${displayModel}_${sequence}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: UnofficialChartData = {};
  // chartData indices match chartDefinitions order — look up by chartType (loop-invariant)
  const e2eIdx = (chartDefinitions as ChartDefinition[]).findIndex((d) => d.chartType === 'e2e');
  const interactivityIdx = (chartDefinitions as ChartDefinition[]).findIndex(
    (d) => d.chartType === 'interactivity',
  );
  for (const [key, rows] of groups) {
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    result[key] = {
      e2e: { data: chartData[e2eIdx] ?? [], gpus: hardwareConfig },
      interactivity: { data: chartData[interactivityIdx] ?? [], gpus: hardwareConfig },
    };
  }

  return result;
}

export function parseAvailableModelsAndSequences(
  chartData: UnofficialChartData | null,
): AvailableModelSequence[] {
  if (!chartData) return [];

  const result: AvailableModelSequence[] = [];
  const allModels = new Set<string>(Object.values(Model));
  const allSequences = new Set<string>(Object.values(Sequence));

  for (const key of Object.keys(chartData)) {
    const lastUnderscoreIndex = key.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) continue;
    const modelPart = key.slice(0, lastUnderscoreIndex);
    const sequencePart = key.slice(lastUnderscoreIndex + 1);
    if (!allModels.has(modelPart) || !allSequences.has(sequencePart)) continue;
    const model = modelPart as Model;
    const sequence = sequencePart as Sequence;
    const group = chartData[key];
    const precisions = [
      ...new Set(
        [...(group?.e2e.data ?? []), ...(group?.interactivity.data ?? [])].map((d) => d.precision),
      ),
    ];
    if (!result.some((r) => r.model === model && r.sequence === sequence)) {
      result.push({ model, sequence, precisions });
    }
  }

  return result;
}
