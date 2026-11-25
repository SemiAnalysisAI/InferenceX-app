import { at, number, rows, safePath, text } from './bundle';
import type { VideoPoint } from './metrics';
import { servingCells, type ServingCell } from './serving';
import { storedBundle, type StoredArtifact, type StoredMedia, type StoredSource } from './stored';

/** One measurement request of a serving cell, with its case identity and retained media path. */
export interface CaseRecord {
  slotId: string;
  caseId: string | null;
  prompt: string | null;
  seed: number | null;
  status: string;
  /** Technical validity of the decoded media; null when not recorded. */
  valid: boolean | null;
  /** Submit-to-downloaded-media seconds for this request. */
  seconds: number | null;
  /** Bundle-relative media path (`gpu/c1/baseline/artifacts/….mp4`); null without a safe path. */
  mediaPath: string | null;
}

/**
 * Measurement-phase records of a cell. A record's own `case_id`/`prompt`/`seed`
 * win; older records without them fall back to the plan case their slot id
 * names (`measurement-r001-c003` → third plan case).
 */
export function caseRecords(cell: Pick<ServingCell, 'run' | 'runPath'>): CaseRecord[] {
  const cases = rows(at(cell.run, 'plan', 'cases'));
  const directory = cell.runPath.slice(0, cell.runPath.lastIndexOf('/') + 1);
  return rows(at(cell.run, 'records'))
    .filter((record) => at(record, 'phase') === 'measurement')
    .map((record): CaseRecord => {
      const slotId = text(at(record, 'slot_id'));
      const index = /-c(?<n>\d+)$/u.exec(slotId)?.groups?.n;
      const planCase = index === undefined ? null : (cases[Number(index) - 1] ?? null);
      const seconds = number(at(record, 'submit_to_media_seconds'));
      const valid = at(record, 'media', 'valid');
      let mediaPath: string | null = null;
      try {
        const relative = text(at(record, 'artifact_path'));
        if (relative) mediaPath = safePath(`${directory}${safePath(relative)}`);
      } catch {
        // Unsafe manifest paths never become media URLs.
      }
      return {
        slotId,
        caseId: text(at(record, 'case_id')) || text(at(planCase, 'case_id')) || null,
        prompt: text(at(record, 'prompt')) || text(at(planCase, 'prompt')) || null,
        seed: number(at(record, 'seed')) ?? number(at(planCase, 'seed')),
        status: text(at(record, 'status')),
        valid: typeof valid === 'boolean' ? valid : null,
        seconds: seconds !== null && seconds > 0 ? seconds : null,
        mediaPath,
      };
    });
}

/** Case records of one dashboard point plus the published media of each path. */
export interface CompareSide {
  records: CaseRecord[];
  media: Map<string, StoredMedia>;
}

/**
 * The cell's records inside one observation source, with that source's
 * manifest SHA; null when the source lacks the cell. Contract violations throw,
 * as in the run views.
 */
function sourceSide(
  source: StoredSource,
  cellId: string,
): { side: CompareSide; manifestSha256: string } | null {
  const bundle = storedBundle(source);
  const cell = servingCells(bundle).find((item) => item.id === cellId);
  if (!cell) return null;
  return {
    manifestSha256: bundle.manifestSha256,
    side: {
      records: caseRecords(cell),
      media: new Map(source.assets),
    },
  };
}

/**
 * Resolve a dashboard point inside its stored artifact (`format=media` or `format=published`): the
 * observation source whose manifest SHA the point id names, else the first
 * source that publishes the point's cell. A malformed source is skipped so a
 * readable sibling still resolves (as `videoHistoryEntry` isolates sources);
 * its error is rethrown only when no source publishes the cell, so an
 * unreadable artifact is never reported as one without the cell. Nothing is
 * synthesised for a missing cell.
 */
export function compareSide(saved: StoredArtifact, point: VideoPoint): CompareSide {
  if (
    saved.storageVersion !== 1 ||
    saved.runId !== point.runId ||
    saved.artifact.id !== point.artifactId
  )
    throw new Error('Stored artifact identity mismatch');
  const wanted = point.id.split(':')[0];
  const cellId = point.cell ?? (point.concurrency === null ? 'c1' : `c${point.concurrency}`);
  let fallback: CompareSide | null = null;
  let sourceError: Error | null = null;
  for (const source of saved.sources) {
    if (source.kind) continue;
    let found: ReturnType<typeof sourceSide>;
    try {
      found = sourceSide(source, cellId);
    } catch (error) {
      sourceError ??= error instanceof Error ? error : new Error(String(error));
      continue;
    }
    if (found === null) continue;
    if (found.manifestSha256 === wanted) return found.side;
    fallback ??= found.side;
  }
  if (fallback !== null) return fallback;
  if (sourceError !== null) throw sourceError;
  throw new Error(`Published artifact has no ${cellId} cell`);
}
