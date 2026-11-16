import type { RunInfo } from '@/components/inference/types';
import { MODEL_PREFIX_MAPPING, type Model } from '@/lib/catalog/data-mappings';
import { filterRunsByModel } from '@/lib/shared/utils';
import { latestRunId } from '@/providers/GlobalFilterContext';

export interface ChartRuns {
  /** The runs on the selected date that touched the model at the selected precisions. */
  filteredAvailableRuns: Record<string, RunInfo>;
  effectiveSelectedRunId: string;
  /** Set when the chart shows the model as of an earlier run than its latest that day. */
  asOfRunId: string | undefined;
  /** Set when the selected run shares a config with another run that day. */
  benchmarkRunId: string | undefined;
}

/** Which of the selected date's runs the inference chart reads for `model`. */
export function resolveChartRuns(
  availableRuns: Record<string, RunInfo>,
  selectedRunId: string,
  model: Model,
  precisions: readonly string[],
): ChartRuns {
  const modelPrefixes = Object.entries(MODEL_PREFIX_MAPPING)
    .filter(([, prefixModel]) => prefixModel === model)
    .map(([prefix]) => prefix);
  const filteredAvailableRuns =
    filterRunsByModel(availableRuns, modelPrefixes, [...precisions]) ?? {};
  const latestRunIdForModel = latestRunId(filteredAvailableRuns);
  const filteredRunIds = Object.keys(filteredAvailableRuns);
  const effectiveSelectedRunId =
    filteredRunIds.length === 0 || filteredRunIds.includes(selectedRunId)
      ? selectedRunId
      : latestRunIdForModel;
  const asOfRunId =
    effectiveSelectedRunId && latestRunIdForModel && effectiveSelectedRunId !== latestRunIdForModel
      ? effectiveSelectedRunId
      : undefined;

  const runsByConfigKey = new Map<string, Set<string>>();
  for (const [runId, runInfo] of Object.entries(availableRuns)) {
    if (!runInfo.changelog) continue;
    for (const entry of runInfo.changelog.entries) {
      for (const key of entry.config_keys) {
        const parts = key.split('-');
        if (modelPrefixes.includes(parts[0]!) && precisions.includes(parts[1]!)) {
          let runs = runsByConfigKey.get(key);
          if (!runs) {
            runs = new Set<string>();
            runsByConfigKey.set(key, runs);
          }
          runs.add(runId);
        }
      }
    }
  }
  const contestedRunIds = new Set<string>();
  for (const runs of runsByConfigKey.values()) {
    if (runs.size > 1) for (const runId of runs) contestedRunIds.add(runId);
  }
  const benchmarkRunId =
    effectiveSelectedRunId && contestedRunIds.has(String(effectiveSelectedRunId))
      ? String(effectiveSelectedRunId)
      : undefined;

  return { filteredAvailableRuns, effectiveSelectedRunId, asOfRunId, benchmarkRunId };
}
