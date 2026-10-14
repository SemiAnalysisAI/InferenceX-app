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
