import { at, number, rows, safePath, text } from './bundle';
import {
  metricValue,
  VIDEO_METRICS,
  type MetricId,
  type MetricOptions,
  type VideoPoint,
} from './metrics';
import { latestVideoCells } from './points';
import { servingCells, type ServingCell } from './serving';
import { storedBundle, type StoredArtifact, type StoredSource } from './stored';

/** Metrics the compare table shows, in row order. */
export const COMPARE_METRICS = [
  'p50Latency',
  'p90Latency',
  'videosPerGpuHour',
  'videosPerDollar',
  'dollarsPerVideo',
  'kjPerVideo',
  'powerPctCap',
] as const satisfies readonly MetricId[];
export type CompareMetricId = (typeof COMPARE_METRICS)[number];

export interface CompareRow {
  id: CompareMetricId;
  baseline: number | null;
  candidate: number | null;
  /** candidate / baseline; null when either side is missing. */
  ratio: number | null;
  /** (ratio − 1) × 100. */
  deltaPercent: number | null;
  /** By registry polarity; null when not comparable or when both sides are equal. */
  candidateBetter: boolean | null;
}

/** Measured C1 cells a reader can pick for comparison: registry hardware with a P50 (newest per hardware). */
export function comparablePoints(points: VideoPoint[]): VideoPoint[] {
  return latestVideoCells(points).filter(
    (p) => p.concurrency === 1 && p.hardwareKey !== null && p.p50 !== null,
  );
}

/** Side-by-side deltas; every null input stays null (never 0). */
export function compareMetrics(
  baseline: VideoPoint,
  candidate: VideoPoint,
  options: MetricOptions,
): CompareRow[] {
  return COMPARE_METRICS.map((id) => {
    const b = metricValue(baseline, id, options);
    const c = metricValue(candidate, id, options);
    if (b === null || c === null || !(b > 0))
      return {
        id,
        baseline: b,
        candidate: c,
        ratio: null,
        deltaPercent: null,
        candidateBetter: null,
      };
    const ratio = c / b;
    const lower = VIDEO_METRICS[id].polarity === 'lower';
    return {
      id,
      baseline: b,
      candidate: c,
      ratio,
      deltaPercent: (ratio - 1) * 100,
      candidateBetter: c === b ? null : lower ? c < b : c > b,
    };
  });
}

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

export interface CasePair {
  /** Case identity shared by both records. */
  key: string;
  caseId: string | null;
  prompt: string | null;
  seed: number | null;
  /** 0-based repetition among pairs with the same identity. */
  repetition: number;
  baseline: CaseRecord;
  candidate: CaseRecord;
}

/** Identity used for pairing: prompt + seed when known, else the plan case id. */
export function caseKey(record: Pick<CaseRecord, 'caseId' | 'prompt' | 'seed'>): string | null {
  if (record.prompt !== null && record.seed !== null)
    return `ps\u0000${record.seed}\u0000${record.prompt}`;
  return record.caseId === null ? null : `id\u0000${record.caseId}`;
}

/**
 * Match the k-th repetition of a case on one side with the k-th on the other,
 * in baseline order. Records without any case identity, and repetitions the
 * other side lacks, are counted rather than invented.
 */
export function pairCases(
  baseline: CaseRecord[],
  candidate: CaseRecord[],
): { pairs: CasePair[]; unmatched: { baseline: number; candidate: number } } {
  const queues = new Map<string, CaseRecord[]>();
  let unmatchedCandidate = 0;
  for (const record of candidate) {
    const key = caseKey(record);
    if (key === null) unmatchedCandidate++;
    else queues.set(key, [...(queues.get(key) ?? []), record]);
  }
  const pairs: CasePair[] = [];
  const repetitions = new Map<string, number>();
  let unmatchedBaseline = 0;
  for (const record of baseline) {
    const key = caseKey(record);
    const match = key === null ? undefined : queues.get(key)?.shift();
    if (key === null || match === undefined) {
      unmatchedBaseline++;
      continue;
    }
    const repetition = repetitions.get(key) ?? 0;
    repetitions.set(key, repetition + 1);
    pairs.push({
      key,
      caseId: record.caseId ?? match.caseId,
      prompt: record.prompt ?? match.prompt,
      seed: record.seed ?? match.seed,
      repetition,
      baseline: record,
      candidate: match,
    });
  }
  for (const queue of queues.values()) unmatchedCandidate += queue.length;
  return { pairs, unmatched: { baseline: unmatchedBaseline, candidate: unmatchedCandidate } };
}

/** Case records of one dashboard point plus the published URL of each media path. */
export interface CompareSide {
  records: CaseRecord[];
  urls: Map<string, string>;
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
      urls: new Map(source.assets.map(([path, asset]) => [path, asset.url])),
    },
  };
}

/**
 * Resolve a dashboard point inside its stored artifact (`format=media`): the
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
