/** Pairing rules for the historical gpu_metrics backfill. */

import { gpuMetricsArtifactSuffix, isPowerAuditArtifact } from '../etl/gpu-metrics-artifacts.js';
import type { BenchmarkParams } from '../etl/benchmark-mapper.js';
import { benchmarkPublicationIdentity } from '../etl/power-publication.js';
import type { TelemetryObservation, TelemetryReceipt } from '../etl/telemetry-receipt.js';
import {
  dedupeArtifactsByLogicalName,
  RUNNER_SUFFIX_RE,
  type ArtifactMeta,
} from './github-artifacts.js';

export interface GpuMetricsArtifactPair {
  /** `gpu_metrics_<suffix>`, or the `power_audit_<suffix>` bundle when a multinode job uploaded no other. */
  gpuMetrics: ArtifactMeta;
  benchmarks: ArtifactMeta;
}

function isNewerArtifact(candidate: ArtifactMeta, existing: ArtifactMeta): boolean {
  return (
    candidate.created_at > existing.created_at ||
    (candidate.created_at === existing.created_at && (candidate.id ?? 0) > (existing.id ?? 0))
  );
}

/**
 * Pair every unexpired telemetry artifact with its exact bmk sibling. Retried
 * jobs upload on different runners, so the newest artifact per logical
 * (runner-suffix-stripped) benchmark name wins, matching CI ingest. A
 * `power_audit_` bundle pairs only when its suffix has no `gpu_metrics_`
 * upload, the same preference `discoverGpuMetricsArtifacts` applies.
 */
export function pairGpuMetricsArtifacts(
  artifacts: readonly ArtifactMeta[],
): GpuMetricsArtifactPair[] {
  const byName = new Map<string, ArtifactMeta>();
  for (const artifact of artifacts) {
    if (artifact.expired) continue;
    const existing = byName.get(artifact.name);
    if (!existing || isNewerArtifact(artifact, existing)) byName.set(artifact.name, artifact);
  }
  const gpuMetricsSuffixes = new Set<string>();
  for (const name of byName.keys()) {
    const suffix = gpuMetricsArtifactSuffix(name);
    if (suffix && !isPowerAuditArtifact(name)) gpuMetricsSuffixes.add(suffix);
  }
  const byLogicalBenchmark = new Map<string, GpuMetricsArtifactPair>();
  for (const gpuMetrics of byName.values()) {
    const suffix = gpuMetricsArtifactSuffix(gpuMetrics.name);
    if (!suffix) continue;
    if (isPowerAuditArtifact(gpuMetrics.name) && gpuMetricsSuffixes.has(suffix)) continue;
    const benchmarks = byName.get(`bmk_agentic_${suffix}`) ?? byName.get(`bmk_${suffix}`);
    if (!benchmarks) continue;
    const logicalName = benchmarks.name.replace(RUNNER_SUFFIX_RE, '');
    const existing = byLogicalBenchmark.get(logicalName);
    if (!existing || isNewerArtifact(benchmarks, existing.benchmarks)) {
      byLogicalBenchmark.set(logicalName, { gpuMetrics, benchmarks });
    }
  }
  return [...byLogicalBenchmark.values()].toSorted((a, b) =>
    a.gpuMetrics.name.localeCompare(b.gpuMetrics.name),
  );
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
    const artifactNames = [`gpu_metrics_${suffix}`, `power_audit_${suffix}`];
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
