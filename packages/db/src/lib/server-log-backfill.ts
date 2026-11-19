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

export function pairServerLogArtifacts(
  artifacts: readonly ArtifactMeta[],
): ServerLogArtifactPair[] {
  return pairWithBenchmarkSibling(artifacts, serverLogArtifactSuffix).map(
    ({ artifact, benchmarks }) => ({ serverLogs: artifact, benchmarks }),
  );
}
