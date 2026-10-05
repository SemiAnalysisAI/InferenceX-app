import { at, number, rows, text, type Json } from './bundle';
import type { VideoHistoryPage } from './history';
import type { ServingCell } from './serving';

export interface ServingCellEvidence {
  cell: string | null;
  concurrency: number | null;
  status: string;
  workloadKey: string | null;
  mode: string | null;
  scheduled: number | null;
  /** Durable attempt intent, not proof that the server received the request. */
  attempted: number | null;
  /** Legacy completion includes local media analysis. */
  completed: number | null;
  /** Attempted records with failed status; timedOut is a subset, not an additive count. */
  failed: number | null;
  timedOut: number | null;
  notStarted: number | null;
  valid: number | null;
  unjudged: number | null;
  /** The original failed field also counts invalid and unstarted scheduled slots. */
  legacyFailedSlots: number | null;
  unfinished: number | null;
  deliveryDeadlineSeconds: number | null;
  /** Cell quality aggregates cannot establish the per-request quality/deadline intersection. */
  qualitySloGoodput: null;
  provenance: 'request-ledger' | 'cell-summary' | 'legacy-projection' | 'unavailable';
}

export interface VideoServingEvidenceRow extends ServingCellEvidence {
  id: string;
  runId: string;
  artifactId: number;
  sourceId: string;
  hardware: string;
  sourceSha: string;
  error: string | null;
}

const count = (value: Json): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Read verified source records before any sample-floor, hardware or workload filtering. */
export function servingCellEvidence(
  cell: Pick<ServingCell, 'id' | 'concurrency' | 'cell' | 'run' | 'spec'>,
  qualityKnownAbsent = false,
): ServingCellEvidence {
  const summary = at(cell.run, 'summary');
  const completion = at(cell.cell, 'completion');
  const serving = at(cell.run, 'serving');
  const scheduled = count(at(completion, 'scheduled')) ?? count(at(summary, 'scheduled'));
  const records = rows(at(cell.run, 'records')).filter((r) => at(r, 'phase') === 'measurement');
  const fullLedger =
    scheduled !== null &&
    records.length === scheduled &&
    records.every((r) => text(at(r, 'slot_id')) && typeof at(r, 'attempted') === 'boolean') &&
    new Set(records.map((r) => at(r, 'slot_id'))).size === records.length;
  const attempts = records.filter((r) => at(r, 'attempted') === true);
  const attempted =
    count(at(completion, 'attempted')) ??
    count(at(serving, 'submitted')) ??
    (fullLedger ? attempts.length : null);
  const valid = count(at(summary, 'valid')) ?? count(at(completion, 'valid'));
  const knownStatuses =
    fullLedger && attempts.every((r) => ['succeeded', 'failed'].includes(text(at(r, 'status'))));
  const failed =
    count(at(summary, 'failed_attempts')) ??
    (knownStatuses
      ? attempts.filter((r) => at(r, 'status') === 'failed').length
      : attempted === 0
        ? 0
        : null);
  const knownTimeouts =
    fullLedger && attempts.every((r) => at(r, 'status') === 'succeeded' || text(at(r, 'outcome')));
  const timedOut =
    count(at(serving, 'outcomes', 'timed_out')) ??
    (knownTimeouts
      ? attempts.filter((r) => at(r, 'outcome') === 'timed_out').length
      : attempted === 0
        ? 0
        : null);
  const validRecords = records.filter(
    (r) => at(r, 'status') === 'succeeded' && at(r, 'media', 'valid') === true,
  );
  const noRecordJudgments = validRecords.every((r) =>
    ['quality', 'quality_judgment', 'quality_assessment'].every((key) => at(r, key) === null),
  );
  return {
    cell: cell.id,
    concurrency: cell.concurrency,
    status: text(at(cell.cell, 'status')),
    workloadKey: null,
    mode: text(at(serving, 'mode')) || text(at(cell.spec, 'serving', 'mode')) || null,
    scheduled,
    attempted,
    completed: count(at(summary, 'completed')) ?? count(at(completion, 'completed')),
    failed,
    timedOut,
    notStarted:
      count(at(completion, 'not_started')) ??
      count(at(summary, 'not_started')) ??
      (fullLedger ? records.length - attempts.length : null),
    valid,
    unjudged:
      qualityKnownAbsent &&
      noRecordJudgments &&
      ((fullLedger && validRecords.length === valid) || (attempted === 0 && valid === 0))
        ? valid
        : null,
    legacyFailedSlots: count(at(summary, 'failed')) ?? count(at(completion, 'failed')),
    unfinished: count(at(completion, 'unfinished')),
    deliveryDeadlineSeconds:
      number(at(serving, 'delivery_deadline_seconds')) ??
      number(at(cell.spec, 'serving', 'delivery_deadline_seconds')),
    qualitySloGoodput: null,
    provenance: fullLedger ? 'request-ledger' : 'cell-summary',
  };
}

/** Newest publication per sealed source/cell; never discard zero-sample or unknown-workload rows. */
export function videoServingEvidence(pages: VideoHistoryPage[]): VideoServingEvidenceRow[] {
  const result: VideoServingEvidenceRow[] = [];
  const seen = new Set<string>();
  for (const page of pages)
    for (const entry of page.entries) {
      if (entry.sources.length === 0 && entry.error && !seen.has(entry.id)) {
        seen.add(entry.id);
        result.push({
          ...servingCellEvidence({ id: '', concurrency: 0, cell: null, run: null, spec: null }),
          id: entry.id,
          runId: entry.runId,
          artifactId: entry.artifact.id,
          cell: null,
          concurrency: null,
          sourceId: '',
          hardware: '',
          sourceSha: '',
          provenance: 'unavailable',
          error: entry.error,
        });
      }
      for (const source of entry.sources) {
        if (source.kind !== 'observation') continue;
        const cells: ServingCellEvidence[] = source.serving?.length
          ? source.serving
          : source.observations.length > 0
            ? source.observations.map((o) => ({
                ...servingCellEvidence({
                  id: o.cell ?? '',
                  concurrency: o.concurrency ?? 0,
                  cell: null,
                  run: null,
                  spec: null,
                }),
                cell: o.cell,
                concurrency: o.concurrency,
                status: o.status,
                workloadKey: o.workloadKey ?? null,
                scheduled: o.scheduled,
                completed: o.completed,
                valid: o.valid,
                legacyFailedSlots: o.failed,
                provenance: 'legacy-projection',
              }))
            : [
                {
                  ...servingCellEvidence({
                    id: '',
                    concurrency: 0,
                    cell: null,
                    run: null,
                    spec: null,
                  }),
                  cell: null,
                  concurrency: null,
                  status: source.execution,
                  provenance: 'unavailable',
                },
              ];
        const identities = source.serving?.length
          ? source.serving.map((cell) => cell.cell ?? 'unknown')
          : source.observations.map((o) => o.cell ?? o.id);
        for (const [index, cell] of cells.entries()) {
          const id = `${source.id}:${source.sha256 ?? entry.id}:${identities[index] ?? 'unknown'}`;
          if (seen.has(id)) continue;
          seen.add(id);
          result.push({
            ...cell,
            id,
            runId: entry.runId,
            artifactId: entry.artifact.id,
            sourceId: source.id,
            hardware: source.hardware,
            sourceSha: source.sourceSha,
            error: source.error ?? entry.error,
          });
        }
      }
    }
  return result;
}
