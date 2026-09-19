import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import type postgres from 'postgres';
import { expect, it } from 'vitest';
import {
  claimMeasurementSnapshot,
  completeMeasurementSnapshot,
  assertLegacySnapshotUnclaimed,
} from './measurement-snapshot';
import type { MeasurementReceipt } from '../lib/measurement-receipt';

it('resumes partial imports with the same receipt and rejects replacement after completion', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      fs.readFileSync(
        new URL('../../migrations/016_measurement_snapshots.sql', import.meta.url),
        'utf8',
      ),
    );
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await db.query(query, values);
      return result.rows;
    }) as unknown as ReturnType<typeof postgres>;
    const receipt = JSON.parse(
      fs.readFileSync(
        new URL('../lib/fixtures/measurement-receipt/receipt.json', import.meta.url),
        'utf8',
      ),
    ) as MeasurementReceipt;
    await assertLegacySnapshotUnclaimed(sql, 'org/repo', '100', 2);
    await claimMeasurementSnapshot(sql, receipt);
    await expect(assertLegacySnapshotUnclaimed(sql, 'org/repo', '100', 2)).rejects.toThrow(
      'previously accepted',
    );
    await claimMeasurementSnapshot(sql, receipt);
    const partial = await db.query(
      'select source_run_id, source_attempt, state from measurement_snapshots',
    );
    expect(partial.rows).toEqual([{ source_run_id: 100, source_attempt: 2, state: 'writing' }]);
    await completeMeasurementSnapshot(sql, receipt);
    await claimMeasurementSnapshot(sql, receipt);
    await expect(
      claimMeasurementSnapshot(sql, { ...receipt, receipt_id: 'f'.repeat(64) }),
    ).rejects.toThrow('different accepted');
    const complete = await db.query('select state, receipt_id from measurement_snapshots');
    expect(complete.rows).toEqual([
      {
        state: 'complete',
        receipt_id: '2e12626c30ec11cf1738c7541a36444af53c29bad4f59f927930618e298e7a01',
      },
    ]);
  } finally {
    await db.close();
  }
}, 20_000);
