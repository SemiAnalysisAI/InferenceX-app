import type { ArtifactMeta } from './github-artifacts.js';

export const CHANGELOG_ARTIFACT_NAME = 'changelog-metadata';

export interface ArtifactPlan {
  artifacts: ArtifactMeta[];
  reused: boolean;
}

/**
 * Match normal ingestion: keep the newest upload for each exact artifact name.
 * Reused sweeps only differ by taking changelog metadata from the merge run.
 */
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

  return {
    artifacts: [...selected.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name),
    ),
    reused,
  };
}
