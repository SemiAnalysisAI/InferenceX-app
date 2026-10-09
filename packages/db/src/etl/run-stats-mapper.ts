import { GPU_KEYS } from '@semianalysisai/inferencex-constants';

import { hasSupportedResultSchemaVersion } from './result-schema-version';
import type { SkipTracker } from './skip-tracker';

export interface RunStatsParams {
  hardware: string;
  nSuccess: number;
  total: number;
}

/**
 * Map a `run-stats` object (`{ <gpu key>: { n_success, total } }`) to per-hardware
 * rows, counting entries stamped with an unsupported `result_schema_version`.
 */
export function mapRunStats(data: object, tracker: SkipTracker): RunStatsParams[] {
  const rows: RunStatsParams[] = [];
  const entries: [string, unknown][] = Object.entries(data);
  for (const [hardware, stats] of entries) {
    if (!GPU_KEYS.has(hardware) || typeof stats !== 'object' || stats === null) continue;
    if (!hasSupportedResultSchemaVersion(stats)) {
      tracker.skips.unsupportedVersion++;
      continue;
    }
    if (!('n_success' in stats) || !('total' in stats)) continue;
    const { n_success: nSuccess, total } = stats;
    if (typeof nSuccess === 'number' && typeof total === 'number') {
      rows.push({ hardware, nSuccess, total });
    }
  }
  return rows;
}
