/**
 * CollectiveX sweep artifact naming and selection. Pure helpers shared by the
 * ingest script and its tests.
 *
 * The sweep uploads two artifact families per run:
 *   cxsweep-matrix-{run_id}            — one matrix document
 *   cxshard-{cell}-{run_id}-{attempt}  — case-attempt documents per matrix cell
 */

export const MATRIX_PREFIX = 'cxsweep-matrix-';
export const SHARD_PREFIX = 'cxshard-';

export function matrixArtifactName(runId: string): string {
  return `${MATRIX_PREFIX}${runId}`;
}

/** Escape regex metacharacters so an interpolated value matches literally. */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * Pick the shard artifact names to ingest: keep the highest attempt ≤ the
 * run's current attempt per cell (a re-run attempt supersedes its
 * predecessors; attempts above the run's own attempt cannot legitimately
 * exist and are ignored).
 */
export function selectShardArtifactNames(
  names: readonly string[],
  runId: string,
  runAttempt: number,
): string[] {
  // runId is interpolated into a pattern, so escape it: an unescaped caller value
  // would change what this matches (regular expression injection), and a crafted
  // one could make the `.+` prefix backtrack pathologically.
  const pattern = new RegExp(
    `^${SHARD_PREFIX}(?<cell>.+)-${escapeRegExp(runId)}-(?<attempt>[1-9][0-9]*)$`,
    'u',
  );
  const selected = new Map<string, { name: string; attempt: number }>();
  for (const name of names) {
    const match = pattern.exec(name);
    if (!match) continue;
    const attempt = Number(match.groups!.attempt);
    if (attempt > runAttempt) continue;
    const previous = selected.get(match.groups!.cell);
    if (!previous || attempt > previous.attempt) {
      selected.set(match.groups!.cell, { name, attempt });
    }
  }
  return [...selected.values()].map((entry) => entry.name).toSorted();
}
