/**
 * CollectiveX sweep artifact naming and selection. Pure helpers shared by the
 * ingest script and its tests.
 *
 * The sweep uploads two artifact families per run:
 *   cxsweep-matrix-{run_id}            — one matrix document
 *   cxshard-{cell}-{run_id}-{attempt}  — case-attempt documents per matrix cell
 */

const MATRIX_PREFIX = 'cxsweep-matrix-';
const SHARD_PREFIX = 'cxshard-';

export function matrixArtifactName(runId: string): string {
  return `${MATRIX_PREFIX}${runId}`;
}

/** Escape regex metacharacters so an interpolated value matches literally. */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/** Anything nameable as a shard artifact. `id` is optional — see the tie-break below. */
interface ShardArtifactRef {
  name: string;
  /** GitHub artifact id, when the caller has one. */
  id?: number;
}

/**
 * Pick the shard artifacts to ingest: keep the highest attempt ≤ the run's
 * current attempt per cell (a re-run attempt supersedes its predecessors;
 * attempts above the run's own attempt cannot legitimately exist and are
 * ignored).
 *
 * Both ingest paths — the CLI, which has only names, and the lazy ingest,
 * which has full artifact records — share this one implementation. They used
 * to carry separate copies that had already drifted apart on the tie-break
 * below, which meant the same run could resolve to different documents
 * depending on which path ingested it.
 *
 * Ties at the same attempt are broken by the greater `id` when callers supply
 * one (GitHub permits repeated artifact names within a run, and the later
 * upload is the one to keep); without ids the first match wins, so the
 * names-only path stays deterministic on input order.
 */
export function selectShardArtifacts<T extends ShardArtifactRef>(
  artifacts: readonly T[],
  runId: string,
  runAttempt: number,
): T[] {
  // runId is interpolated into a pattern, so escape it: an unescaped caller value
  // would change what this matches (regular expression injection), and a crafted
  // one could make the `.+` prefix backtrack pathologically.
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

/** Name-only convenience wrapper over {@link selectShardArtifacts}, sorted for stable output. */
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
