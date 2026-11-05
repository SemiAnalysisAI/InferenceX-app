import { serverLogArtifactSuffix } from '../etl/server-log-artifacts.js';
import type { ArtifactMeta } from './github-artifacts.js';

export const CHANGELOG_ARTIFACT_NAME = 'changelog-metadata';
export const REQUIRED_POWER_MANIFEST = 'required-power-sweep-manifest';
const REUSED_INGEST_BUNDLE = 'reused-ingest-artifacts';
const UNREAD_ARTIFACT_PREFIXES = ['job_event', 'al_gate'] as const;

// Ingest reads server logs only beside the bmk_ artifact with the same suffix.
function isReadByIngest(artifact: ArtifactMeta, names: ReadonlySet<string>): boolean {
  if (UNREAD_ARTIFACT_PREFIXES.some((prefix) => artifact.name.startsWith(prefix))) return false;
  const suffix = serverLogArtifactSuffix(artifact.name);
  return (
    suffix === null ||
    names.has(REUSED_INGEST_BUNDLE) ||
    names.has(`bmk_agentic_${suffix}`) ||
    names.has(`bmk_${suffix}`)
  );
}

export interface ArtifactPlan {
  artifacts: ArtifactMeta[];
  reused: boolean;
}

export function buildArtifactPlan(
  sourceRunId: string,
  mergeRunId: string,
  sourceArtifacts: readonly ArtifactMeta[],
  mergeArtifacts: readonly ArtifactMeta[] = sourceArtifacts,
): ArtifactPlan {
  const reused = sourceRunId !== mergeRunId;
  const selected = new Map<string, ArtifactMeta>();
  for (const artifact of sourceArtifacts) {
    if (artifact.expired || (reused && artifact.name === CHANGELOG_ARTIFACT_NAME)) continue;
    const current = selected.get(artifact.name);
    if (!current || artifact.created_at > current.created_at) {
      selected.set(artifact.name, artifact);
    }
  }

  if (selected.size === 0) {
    throw new Error(`No unexpired artifacts found on source run ${sourceRunId}`);
  }

  if (reused) {
    const changelog = mergeArtifacts
      .filter((artifact) => !artifact.expired && artifact.name === CHANGELOG_ARTIFACT_NAME)
      .toSorted((left, right) => right.created_at.localeCompare(left.created_at))[0];
    if (!changelog) {
      throw new Error(`No ${CHANGELOG_ARTIFACT_NAME} artifact found on merge run ${mergeRunId}`);
    }
    selected.set(CHANGELOG_ARTIFACT_NAME, changelog);
  }

  const names = new Set(selected.keys());
  return {
    artifacts: [...selected.values()]
      .filter((artifact) => isReadByIngest(artifact, names))
      .toSorted(
        (left, right) =>
          (right.size_in_bytes ?? 0) - (left.size_in_bytes ?? 0) ||
          left.name.localeCompare(right.name),
      ),
    reused,
  };
}
