import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { getAllRankingPageEntries } from '@/lib/rankings';

import { buildRankingsViewEntries, newestRowDate, rankingsViewCsvRows } from './rankings-view';

let nextId = 1;

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'b200',
    framework: 'sglang',
    model: 'qwen3.5',
    precision: 'fp8',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 16,
    offload_mode: 'off',
    image: null,
    metrics: { median_intvty: 50, tput_per_gpu: 1000 },
    date: '2026-07-20',
    run_url: null,
    ...overrides,
  } as BenchmarkRow;
}

function frontier(hardware: string, totals: [number, number, number, number]): BenchmarkRow[] {
  return [30, 50, 75, 100].map((intvty, index) =>
    row({
      hardware,
      conc: index + 1,
      metrics: { median_intvty: intvty, tput_per_gpu: totals[index] },
    }),
  );
}

function entryFor(kind: 'fastest-gpu' | 'cheapest-gpu', slug: string) {
  const entry = getAllRankingPageEntries().find(
    (candidate) => candidate.kind === kind && candidate.model.slug === slug,
  );
  if (!entry) throw new Error(`no ranking entry for ${kind}/${slug}`);
  return entry;
}

const ROWS = [
  ...frontier('b200', [1400, 1000, 700, 500]),
  ...frontier('mi355x', [1100, 800, 500, 300]),
];

describe('buildRankingsViewEntries', () => {
  it('pins a single entry when a scenario is explicit', () => {
    const entries = buildRankingsViewEntries(
      entryFor('fastest-gpu', 'qwen-3-5'),
      ROWS,
      'single_turn_8k1k',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].scenario).toBe('single_turn_8k1k');
    expect(entries[0].rows.map((r) => [r.rank, r.hardware, r.value])).toEqual([
      [1, 'b200', 1000],
      [2, 'mi355x', 800],
    ]);
    expect(entries[0].rows[0].unit).toBe('tokens_per_second_per_gpu');
  });

  it('follows the curated overview scenarios when no scenario is given', () => {
    // Kimi K3 is curated to agentx only — the default must not add a
    // single-turn entry even though single-turn rows exist.
    const entries = buildRankingsViewEntries(
      entryFor('cheapest-gpu', 'kimi-k3'),
      ROWS.map((r) => ({ ...r, model: 'kimik3' })),
      null,
    );
    expect(entries.map((entry) => entry.scenario)).toEqual(['agentx']);
  });
});

describe('newestRowDate', () => {
  it('keeps the running max across batches', () => {
    expect(newestRowDate([row({ date: '2026-07-01' })], null)).toBe('2026-07-01');
    expect(newestRowDate([row({ date: '2026-06-01' })], '2026-07-01')).toBe('2026-07-01');
    expect(newestRowDate([], null)).toBeNull();
  });
});

describe('rankingsViewCsvRows', () => {
  it('flattens entries to one row per ranked hardware', () => {
    const entries = buildRankingsViewEntries(
      entryFor('cheapest-gpu', 'qwen-3-5'),
      ROWS,
      'single_turn_8k1k',
    );
    const csvRows = rankingsViewCsvRows('cheapest-gpu', 50, entries);
    expect(csvRows).toHaveLength(2);
    expect(csvRows[0]).toMatchObject({
      kind: 'cheapest-gpu',
      model_slug: 'qwen-3-5',
      scenario: 'single_turn_8k1k',
      tier: 50,
      rank: 1,
      unit: 'usd_per_million_tokens',
    });
  });
});
