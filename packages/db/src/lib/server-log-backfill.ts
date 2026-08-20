import { RUNNER_SUFFIX_RE, type ArtifactMeta } from './github-artifacts.js';
import { serverLogArtifactSuffix } from '../etl/server-log-artifacts.js';

export interface ServerLogArtifactPair {
  serverLogs: ArtifactMeta;
  benchmarks: ArtifactMeta;
}

export interface ServerLogResultCandidate {
  id: number;
  offloadMode: string;
}

export interface ServerLogResultResolution {
  ids: number[];
  usedUniqueFallback: boolean;
}

/**
 * Prefer the persisted point whose offload mode matches the current mapper.
 * Historical mapper changes left a small number of otherwise-identical points
 * with a different offload label; accept that drift only when the candidate is
 * unique, since attaching a log to an ambiguous point would be worse than
 * leaving it unlinked.
 */
export function resolveServerLogResultCandidates(
  candidates: readonly ServerLogResultCandidate[],
  offloadMode: string,
): ServerLogResultResolution {
  const exact = candidates.filter((candidate) => candidate.offloadMode === offloadMode);
  if (exact.length > 0) {
    return { ids: exact.map((candidate) => candidate.id), usedUniqueFallback: false };
  }
  return candidates.length === 1
    ? { ids: [candidates[0]!.id], usedUniqueFallback: true }
    : { ids: [], usedUniqueFallback: false };
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
  const pairsByLogicalBenchmark = new Map<string, ServerLogArtifactPair>();

  for (const serverLogs of byName.values()) {
    const suffix = serverLogArtifactSuffix(serverLogs.name);
    if (!suffix) continue;
    // Require the exact runner suffix. Eval and benchmark jobs can share the
    // same logical config while uploading distinct server-log artifacts.
    const benchmarks = byName.get(`bmk_agentic_${suffix}`) ?? byName.get(`bmk_${suffix}`);
    if (!benchmarks) continue;

    const logicalName = benchmarks.name.replace(RUNNER_SUFFIX_RE, '');
    const existing = pairsByLogicalBenchmark.get(logicalName);
    if (!existing || benchmarks.created_at > existing.benchmarks.created_at) {
      pairsByLogicalBenchmark.set(logicalName, { serverLogs, benchmarks });
    }
  }

  return [...pairsByLogicalBenchmark.values()].toSorted((a, b) =>
    a.serverLogs.name.localeCompare(b.serverLogs.name),
  );
}
