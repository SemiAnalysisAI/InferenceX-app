import type { AggDataEntry } from '@/components/inference/types';
import type { RunConfigRow } from '@/lib/api/api';
import { getHardwareKey } from '@/lib/charts/chart-utils';

export interface DataRun {
  runId: string;
  runStartedAt: string;
  runUrl?: string;
  headSha?: string;
}

export interface RunScope {
  modelDbKeys: string[];
  selectedGPUs: string[];
  selectedPrecisions: string[];
  benchmarkType: 'single_turn' | 'agentic_traces';
}

function runConfigHwKey(rc: RunConfigRow, benchmarkType: 'single_turn' | 'agentic_traces'): string {
  return getHardwareKey({
    hw: rc.hardware,
    framework: rc.framework,
    disagg: rc.disagg,
    spec_decoding: rc.spec_method,
    benchmark_type: benchmarkType,
  } as unknown as AggDataEntry);
}

export function dataRunsForDate(runConfigs: RunConfigRow[], scope: RunScope): DataRun[] {
  const { modelDbKeys, selectedGPUs, selectedPrecisions, benchmarkType } = scope;
  const precSet = new Set(selectedPrecisions);
  const gpuSet = new Set(selectedGPUs);
  const byRun = new Map<string, DataRun>();

  for (const rc of runConfigs) {
    if (!modelDbKeys.includes(rc.model)) continue;
    if (!precSet.has(rc.precision)) continue;
    if (!gpuSet.has(runConfigHwKey(rc, benchmarkType))) continue;

    const id = String(rc.github_run_id);
    if (!byRun.has(id)) {
      byRun.set(id, {
        runId: id,
        runStartedAt: rc.run_started_at ?? '',
        runUrl: rc.html_url ?? undefined,
        headSha: rc.head_sha ?? undefined,
      });
    }
  }

  return [...byRun.values()].toSorted((a, b) => a.runStartedAt.localeCompare(b.runStartedAt));
}
