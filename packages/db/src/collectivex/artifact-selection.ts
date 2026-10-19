const MATRIX_PREFIX = 'cxsweep-matrix-';
const SHARD_PREFIX = 'cxshard-';

export function matrixArtifactName(runId: string): string {
  return `${MATRIX_PREFIX}${runId}`;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

interface ShardArtifactRef {
  name: string;
  id?: number;
}

export function selectShardArtifacts<T extends ShardArtifactRef>(
  artifacts: readonly T[],
  runId: string,
  runAttempt: number,
): T[] {
  const pattern = new RegExp(
    `^${SHARD_PREFIX}(?<cell>.+)-${escapeRegExp(runId)}-(?<attempt>[1-9][0-9]*)$`,
    'u',
  );
  const selected = new Map<string, { artifact: T; attempt: number }>();
  for (const artifact of artifacts) {
    const match = pattern.exec(artifact.name);
    if (!match) continue;
    const attempt = Number(match.groups!.attempt);
    if (attempt > runAttempt) continue;
    const previous = selected.get(match.groups!.cell);
    const supersedes =
      !previous ||
      attempt > previous.attempt ||
      (attempt === previous.attempt && (artifact.id ?? -1) > (previous.artifact.id ?? -1));
    if (supersedes) selected.set(match.groups!.cell, { artifact, attempt });
  }
  return [...selected.values()].map((entry) => entry.artifact);
}

export function selectShardArtifactNames(
  names: readonly string[],
  runId: string,
  runAttempt: number,
): string[] {
  return selectShardArtifacts(
    names.map((name) => ({ name })),
    runId,
    runAttempt,
  )
    .map((entry) => entry.name)
    .toSorted();
}
