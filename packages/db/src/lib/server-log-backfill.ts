import type { ArtifactMeta } from './github-artifacts.js';
import { serverLogArtifactSuffix } from '../etl/server-log-artifacts.js';

export interface ServerLogArtifactPair {
  serverLogs: ArtifactMeta;
  benchmarks: ArtifactMeta;
}

/** Pair server_logs_/multinode_server_logs_ artifacts with their raw bmk sibling. */
export function pairServerLogArtifacts(
  artifacts: readonly ArtifactMeta[],
): ServerLogArtifactPair[] {
  const byName = new Map<string, ArtifactMeta>();
  for (const artifact of artifacts) {
    const existing = byName.get(artifact.name);
    if (!existing || artifact.created_at > existing.created_at) byName.set(artifact.name, artifact);
  }
  const pairs: ServerLogArtifactPair[] = [];

  for (const serverLogs of byName.values()) {
    const suffix = serverLogArtifactSuffix(serverLogs.name);
    if (!suffix) continue;
    // Require the exact runner suffix. Eval and benchmark jobs can share the
    // same logical config while uploading distinct server-log artifacts.
    const benchmarks = byName.get(`bmk_agentic_${suffix}`) ?? byName.get(`bmk_${suffix}`);
    if (benchmarks) pairs.push({ serverLogs, benchmarks });
  }

  return pairs.toSorted((a, b) => a.serverLogs.name.localeCompare(b.serverLogs.name));
}
