import { rowToSequence } from '@semianalysisai/inferencex-constants';

import type { RunConfigRow } from './api';

/** Run IDs with benchmark rows for the selected model, scenario, and precision. */
export function scenarioRunIdsForDate(
  runConfigs: RunConfigRow[],
  modelDbKeys: string[],
  sequence: string,
  precisions: string[] = [],
): Set<string> {
  const selectedPrecisions = precisions.length > 0 ? new Set(precisions) : null;
  const ids = new Set<string>();
  for (const row of runConfigs) {
    if (!modelDbKeys.includes(row.model)) continue;
    if (selectedPrecisions && !selectedPrecisions.has(row.precision)) continue;
    if (rowToSequence(row) !== sequence) continue;
    ids.add(String(row.github_run_id));
  }
  return ids;
}
