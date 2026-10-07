import type { Sql } from '../etl/db-utils.js';
import { GPU_STATS_VERSION } from './gpu-metric-stats.js';

/** Pairing rules for the historical gpu_metrics backfill. */

import {
  expectedTelemetryArtifactNames,
  gpuMetricsArtifactSuffix,
  isPowerAuditArtifact,
} from '../etl/gpu-metrics-artifacts.js';
import type { BenchmarkParams } from '../etl/benchmark-mapper.js';
import { benchmarkPublicationIdentity } from '../etl/power-publication.js';
import type { TelemetryObservation, TelemetryReceipt } from '../etl/telemetry-receipt.js';
import {
  dedupeArtifactsByLogicalName,
  pairWithBenchmarkSibling,
  type ArtifactMeta,
} from './github-artifacts.js';

export interface GpuMetricsArtifactPair {
  /** `gpu_metrics_<suffix>`, or the `power_audit_<suffix>` bundle when a multinode job uploaded no other. */
  gpuMetrics: ArtifactMeta;
  benchmarks: ArtifactMeta;
}

/**
 * Pair every unexpired telemetry artifact with its exact bmk sibling, matching
 * CI ingest. A `power_audit_` bundle pairs only when its suffix has no unexpired
 * `gpu_metrics_` upload, the same preference `discoverGpuMetricsArtifacts` applies.
 */
export function pairGpuMetricsArtifacts(
  artifacts: readonly ArtifactMeta[],
): GpuMetricsArtifactPair[] {
  const retained = artifacts.filter((artifact) => !artifact.expired);
  const gpuMetricsSuffixes = new Set<string>();
  for (const { name } of retained) {
    const suffix = gpuMetricsArtifactSuffix(name);
    if (suffix && !isPowerAuditArtifact(name)) gpuMetricsSuffixes.add(suffix);
  }
  return pairWithBenchmarkSibling(retained, (name) => {
    const suffix = gpuMetricsArtifactSuffix(name);
    return suffix && isPowerAuditArtifact(name) && gpuMetricsSuffixes.has(suffix) ? null : suffix;
  }).map(({ artifact, benchmarks }) => ({ gpuMetrics: artifact, benchmarks }));
}

/** A corrupt unrelated benchmark sibling must not prevent valid pairs from being repaired. */
export async function collectMissingTelemetryExpectations(
  artifacts: readonly ArtifactMeta[],
  pairs: readonly GpuMetricsArtifactPair[],
  selectedArtifact: string | null,
  readRows: (
    artifact: ArtifactMeta,
    onUnmapped: (error: string) => void,
  ) => Promise<readonly BenchmarkParams[]>,
): Promise<{
  observations: TelemetryObservation[];
  errors: NonNullable<TelemetryReceipt['expectationErrors']>;
}> {
  const paired = new Set(pairs.map((pair) => pair.benchmarks.name));
  const observations: TelemetryObservation[] = [];
  const errors: NonNullable<TelemetryReceipt['expectationErrors']> = [];
  for (const artifact of dedupeArtifactsByLogicalName(artifacts).values()) {
    if (!artifact.name.startsWith('bmk_') || paired.has(artifact.name)) continue;
    const suffix = artifact.name.replace(/^bmk_(?:agentic_)?/u, '');
    const artifactNames = expectedTelemetryArtifactNames(suffix);
    if (selectedArtifact && !artifactNames.includes(selectedArtifact)) continue;
    const recordError = (error: string) => {
      errors.push({ benchmarkArtifact: artifact.name, artifactNames, error });
    };
    if (artifact.expired) {
      recordError('Benchmark artifact expired; point identities unavailable');
      continue;
    }
    try {
      for (const row of await readRows(artifact, recordError))
        observations.push({
          identity: benchmarkPublicationIdentity(row),
          artifactNames,
          produced: false,
        });
    } catch (error) {
      recordError(error instanceof Error ? error.message : String(error));
    }
  }
  return { observations, errors };
}

/** Stored samples outlive artifacts, including superseded attempts. */
export function findOutdatedGpuMetricSeries(
  sql: Sql,
  flags: {
    run: number | null;
    attempt: number | null;
    artifact: string | null;
  },
  limit: number | null,
) {
  return sql`
    select s.id, wr.github_run_id, wr.run_attempt, s.artifact_name, s.file_name
    from gpu_metric_series s join workflow_runs wr on wr.id = s.workflow_run_id
    where s.stats_version <> ${GPU_STATS_VERSION}
      and (${flags.run}::bigint is null or wr.github_run_id = ${flags.run})
      and (${flags.attempt}::integer is null or wr.run_attempt = ${flags.attempt})
      and (${flags.artifact}::text is null or s.artifact_name = ${flags.artifact})
    order by wr.github_run_id, wr.run_attempt, s.id
    limit ${limit}::integer
  `;
}
