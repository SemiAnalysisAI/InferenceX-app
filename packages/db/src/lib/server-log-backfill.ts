import { pairWithBenchmarkSibling, type ArtifactMeta } from './github-artifacts.js';
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
  return pairWithBenchmarkSibling(artifacts, serverLogArtifactSuffix).map(
    ({ artifact, benchmarks }) => ({ serverLogs: artifact, benchmarks }),
  );
}
