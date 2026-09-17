export interface BackfillState {
  id: string;
  trace_id: string | null;
  benchmark_hash: string;
  profile_hash: string | null;
  server_hash: string | null;
  timeline_hash: string | null;
  chart_version: number | null;
  stats_version: number | null;
  timeline_version: number | null;
  chart_counts: Record<string, number>;
  stats_present: Record<string, boolean>;
}

export function verifyBackfillState(
  before: BackfillState,
  after: BackfillState,
  versions: { chart: number; stats: number; timeline: number },
): void {
  for (const key of ['id', 'trace_id', 'benchmark_hash', 'profile_hash', 'server_hash'] as const) {
    if (before[key] !== after[key]) throw new Error(`point ${before.id}: ${key} changed`);
  }
  if (!after.trace_id) return;
  if (after.server_hash && after.chart_version !== versions.chart) {
    throw new Error(`point ${before.id}: chart version ${after.chart_version}`);
  }
  if (after.stats_version !== versions.stats) {
    throw new Error(`point ${before.id}: statistics version ${after.stats_version}`);
  }
  if (after.profile_hash && after.timeline_version !== versions.timeline) {
    throw new Error(`point ${before.id}: timeline version ${after.timeline_version}`);
  }
  if (
    before.timeline_version === versions.timeline &&
    before.timeline_hash !== after.timeline_hash
  ) {
    throw new Error(`point ${before.id}: already-current request timeline changed`);
  }
  for (const [key, count] of Object.entries(before.chart_counts)) {
    if (count > 0 && !(after.chart_counts[key]! > 0)) {
      throw new Error(`point ${before.id}: populated chart ${key} became empty`);
    }
  }
  for (const [key, present] of Object.entries(before.stats_present)) {
    if (present && !after.stats_present[key]) {
      throw new Error(`point ${before.id}: populated statistic ${key} became null`);
    }
  }
}
