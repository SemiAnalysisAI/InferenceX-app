import type postgres from 'postgres';
import type { MeasurementReceipt } from '../lib/measurement-receipt';

type Sql = ReturnType<typeof postgres>;

/** Claim before writes. A partial import resumes only the same immutable accepted snapshot. */
export async function claimMeasurementSnapshot(
  sql: Sql,
  receipt: MeasurementReceipt,
): Promise<void> {
  const claimed = await sql`
    insert into measurement_snapshots (source_repo, source_run_id, source_attempt, receipt_id, bundle_digest, receipt, state)
    values (${receipt.repository}, ${receipt.source_run_id}, ${receipt.source_attempt}, ${receipt.receipt_id}, ${receipt.bundle_digest}, ${JSON.stringify(receipt)}::jsonb, 'writing')
    on conflict (source_repo, source_run_id, source_attempt) do update
      set updated_at = now()
      where measurement_snapshots.receipt_id = excluded.receipt_id
        and measurement_snapshots.bundle_digest = excluded.bundle_digest
    returning receipt_id
  `;
  if (claimed.length !== 1)
    throw new Error('Run already belongs to a different accepted measurement snapshot');
}

export async function completeMeasurementSnapshot(
  sql: Sql,
  receipt: MeasurementReceipt,
): Promise<void> {
  await sql`update measurement_snapshots set state = 'complete', updated_at = now()
    where source_repo = ${receipt.repository} and source_run_id = ${receipt.source_run_id}
      and source_attempt = ${receipt.source_attempt} and receipt_id = ${receipt.receipt_id}`;
}

/** Legacy compatibility cannot bypass an already accepted immutable snapshot. */
export async function assertLegacySnapshotUnclaimed(
  sql: Sql,
  repository: string,
  runId: string,
  attempt: number,
): Promise<void> {
  const rows = await sql`select receipt_id from measurement_snapshots
    where source_repo = ${repository} and source_run_id = ${runId} and source_attempt = ${attempt}`;
  if (rows.length > 0)
    throw new Error('This run requires its previously accepted measurement receipt');
}
