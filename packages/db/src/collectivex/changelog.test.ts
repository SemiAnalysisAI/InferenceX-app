import { describe, expect, it } from 'vitest';

import { type ChangelogEntry, linkRows } from './changelog';
import { makeRawMatrix, makeRawShard } from './test-fixture';

type Json = Record<string, any>;

const SHA = 'e'.repeat(40);

function epResult(options: Parameters<typeof makeRawShard>[0] = {}): Json {
  return { ...makeRawShard(options), provenance: { source_sha: SHA, source_dirty: false } };
}

function matrixOf(docs: Json[]): Json {
  return makeRawMatrix(
    docs.map((doc) => ({
      caseId: doc.identity.case_id,
      sku: doc.identity.case_factors.sku,
      case: doc.identity.case_factors.case,
    })),
  );
}

/** The same document as PostgreSQL jsonb returns it: object keys in another order, -0 as 0. */
function asStored(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(asStored);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toReversed()
        .map(([key, item]) => [key, asStored(item)]),
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function entryFor(overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    index: 7,
    date: '2026-11-07',
    prNumber: 4882,
    prLink: 'https://github.com/SemiAnalysisAI/InferenceX/pull/4882',
    pools: ['h200-dgxc'],
    selectors: { backends: ['deepep-v2'], modes: ['normal'] },
    description: "Charge vLLM's finalize copy in DeepEP V2 normal combine.",
    ...overrides,
  };
}

describe('linkRows', () => {
  const bf16 = epResult();
  const fp8 = epResult({ precision: 'fp8' });
  const matrix = matrixOf([bf16, fp8]);

  it('does not report a re-uploaded document that only differs in key order from the stored one', () => {
    // Negative zero is the one number jsonb does not return as written: it comes back as 0.
    const uploaded = structuredClone(bf16);
    uploaded.measurement.rows[0].signed_zero = -0;
    const stored = asStored(uploaded) as Json;
    expect(JSON.stringify(stored)).not.toBe(JSON.stringify(uploaded));
    expect(Object.is(stored.measurement.rows[0].signed_zero, 0)).toBe(true);

    const [row] = linkRows(
      [entryFor()],
      matrix,
      { runId: '1793577600', docs: [uploaded, fp8] },
      { runId: '1793491200', docs: [stored, asStored(fp8)] },
    );
    expect(row).toMatchObject({ run_id: '1793577600', entry_index: 7, pr_number: 4882 });
    expect(row.changes).toEqual([]);
  });

  it('reports a re-measured case with the pair-period p50 before and after', () => {
    const rerun = structuredClone(bf16);
    rerun.measurement.rows[0].components.pair_period.percentiles_us.p50 = 640.52;
    rerun.implementation.library_version = '2.1.0+local@01dc3aa';
    const [row] = linkRows(
      [entryFor()],
      matrix,
      { runId: '1793577600', docs: [rerun, fp8] },
      { runId: '1793491200', docs: [asStored(bf16), asStored(fp8)] },
    );
    expect(row.changes).toHaveLength(1);
    expect(row.changes[0]).toMatchObject({
      sku: 'h200-dgxc',
      case_id: bf16.identity.case_id,
      before: { run_id: '1793491200', status: 'success', library_version: null },
      after: { run_id: '1793577600', status: 'success', library_version: '2.1.0+local@01dc3aa' },
    });
    expect(row.changes[0].before?.pair_period_p50_us[0]).toEqual([1, 871]);
    expect(row.changes[0].after.pair_period_p50_us[0]).toEqual([1, 640.5]);
  });

  it('reports a case the previous run did not hold as new, and skips cases it does not select', () => {
    const lowLatency = epResult({ mode: 'low-latency' });
    const [row] = linkRows(
      [entryFor()],
      matrixOf([bf16, fp8, lowLatency]),
      { runId: '1793577600', docs: [bf16, fp8, lowLatency] },
      { runId: '1793491200', docs: [asStored(fp8)] },
    );
    // bf16 is new; fp8 is unchanged; the low-latency case is outside the entry's selectors.
    expect(row.changes.map((change) => [change.case_id, change.before])).toEqual([
      [bf16.identity.case_id, null],
    ]);

    const [first] = linkRows([entryFor()], matrix, { runId: '1793491200', docs: [bf16] }, null);
    expect(first.changes.map((change) => change.case_id)).toEqual([bf16.identity.case_id]);
  });
});
