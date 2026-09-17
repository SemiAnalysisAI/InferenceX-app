/** Pairing rules for the historical gpu_metrics backfill. */

import { gpuMetricsArtifactSuffix } from '../etl/gpu-metrics-artifacts.js';
import { RUNNER_SUFFIX_RE, type ArtifactMeta } from './github-artifacts.js';

export interface GpuMetricsArtifactPair {
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
 * Pair every unexpired gpu_metrics artifact with its exact bmk sibling. Retried
 * jobs upload on different runners, so the newest artifact per logical
 * (runner-suffix-stripped) benchmark name wins, matching CI ingest.
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
  const byLogicalBenchmark = new Map<string, GpuMetricsArtifactPair>();
  for (const gpuMetrics of byName.values()) {
    const suffix = gpuMetricsArtifactSuffix(gpuMetrics.name);
    if (!suffix) continue;
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
