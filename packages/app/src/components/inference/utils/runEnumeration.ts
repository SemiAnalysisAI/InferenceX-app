/**
 * Enumerates the workflow runs that produced benchmark data for the currently
 * selected model / GPU / precision on a given date. This is the single source of
 * truth for "how many runs are on this date" used by both the changelog (to render
 * a block per run) and the chart (to expand a plain-date selection into per-run
 * series).
 *
 * It is intentionally DATA-driven (keyed off `runConfigs`, which comes from the
 * benchmark rows) rather than changelog-driven: a run can ship data without a
 * changelog entry, and that newest run is exactly the one the plain-date "latest"
 * view shows — so enumerating from changelog entries alone would silently drop it.
 *
 * Runs are scoped to the selected GPUs using the canonical {@link getHardwareKey}
 * so MTP and disagg variants (separate hw keys) are kept distinct, exactly as the
 * chart keys them.
 */

import { rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AggDataEntry } from '@/components/inference/types';
import type { RunConfigRow } from '@/lib/api';
import { getHardwareKey } from '@/lib/chart-utils';

export interface DataRun {
  /** GitHub run id (string). */
  runId: string;
  /** ISO-8601 start time (or created_at fallback); orders runs chronologically. */
  runStartedAt: string;
  /** Workflow run URL, when known. */
  runUrl?: string;
  /** Head commit sha, for the Git Commit link. */
  headSha?: string;
}

export interface RunScope {
  /** DB model keys for the selected display model, e.g. ['minimaxm3']. */
  modelDbKeys: string[];
  /** Selected GPU hw keys, e.g. ['mi300x_vllm']. */
  selectedGPUs: string[];
  /** Selected DB precisions, e.g. ['fp8']. */
  selectedPrecisions: string[];
}

/** The hw key a runConfig maps to, built the same way the chart builds series keys. */
function runConfigHwKey(rc: RunConfigRow): string {
  return getHardwareKey({
    hw: rc.hardware,
    framework: rc.framework,
    disagg: rc.disagg,
    spec_decoding: rc.spec_method,
  } as unknown as AggDataEntry);
}

/**
 * Distinct runs that produced data for the selected config on a date, earliest
 * first. De-duplicated by run id; ordered by start time so the #1/#2/#3 the UI
 * assigns read in the order the runs actually happened.
 */
export function dataRunsForDate(runConfigs: RunConfigRow[], scope: RunScope): DataRun[] {
  const { modelDbKeys, selectedGPUs, selectedPrecisions } = scope;
  const precSet = new Set(selectedPrecisions);
  const gpuSet = new Set(selectedGPUs);
  const byRun = new Map<string, DataRun>();

  for (const rc of runConfigs) {
    if (!modelDbKeys.includes(rc.model)) continue;
    if (!precSet.has(rc.precision)) continue;
    if (!gpuSet.has(runConfigHwKey(rc))) continue;

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

/**
 * GitHub run ids (as strings) that produced benchmark data for the given model
 * DB keys + scenario (sequence) — and, when `precisions` is non-empty, only for
 * those precisions — on a date. Derived from per-(run, config) coverage
 * ({@link RunConfigRow}, i.e. the benchmark rows themselves), so a run that
 * shipped data without a changelog entry still counts.
 *
 * The run picker uses this to list ONLY the runs that actually produced data for
 * the currently selected model + scenario. `/api/v1/workflow-info` returns every
 * run on a date across all models and scenarios, so without this scoping a
 * same-day run for a different scenario (e.g. a `single_turn` sweep while the
 * user is viewing Agentic Traces) leaks into the picker — and selecting it
 * poisons the "as of run" cutoff, blanking the chart.
 *
 * Scenario matching mirrors the chart's own row filter (`rowToSequence(row) ===
 * selectedSequence` in useChartData), so the picker and the plotted data always
 * agree on which runs are relevant.
 */
export function scenarioRunIdsForDate(
  runConfigs: RunConfigRow[],
  modelDbKeys: string[],
  sequence: string,
  precisions: string[] = [],
): Set<string> {
  const precSet = precisions.length > 0 ? new Set(precisions) : null;
  const ids = new Set<string>();
  for (const rc of runConfigs) {
    if (!modelDbKeys.includes(rc.model)) continue;
    if (precSet && !precSet.has(rc.precision)) continue;
    if (rowToSequence(rc) !== sequence) continue;
    ids.add(String(rc.github_run_id));
  }
  return ids;
}
