import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Sequence } from '@/lib/data-mappings';

import {
  groupHistoryByHwKeyAndDate,
  selectBestFromGroups,
  selectHistoricalBest,
  type GroupHistoryOptions,
  type SelectBestOptions,
} from './historical-best';
import type { InterpolatedResult } from './types';

/**
 * Rows go through the real `buildGpuGroups`, so `hardware` must exist in the
 * hardware registry and isl/osl must match the selected sequence.
 */
function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 8,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 8,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 8,
    offload_mode: 'off',
    image: 'sglang:test',
    metrics: {
      median_intvty: 50,
      tput_per_gpu: 900,
      output_tput_per_gpu: 300,
      input_tput_per_gpu: 600,
    },
    date: '2026-07-19',
    run_url: null,
    ...overrides,
  };
}

/** A sweep point: one row at a given interactivity / throughput on a given date. */
function sweep(
  date: string,
  interactivity: number,
  tputPerGpu: number,
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return makeRow({
    id: Math.round(interactivity * 1000 + tputPerGpu),
    date,
    conc: Math.round(tputPerGpu / interactivity),
    metrics: {
      median_intvty: interactivity,
      tput_per_gpu: tputPerGpu,
      output_tput_per_gpu: tputPerGpu * 0.3,
      input_tput_per_gpu: tputPerGpu * 0.7,
    },
    ...overrides,
  });
}

/** Ranks by total-token throughput — stands in for the injected cost-matrix accessor. */
const rankByThroughput = (r: InterpolatedResult) => r.value;

function options(
  rows: BenchmarkRow[],
  over: Partial<GroupHistoryOptions & SelectBestOptions> = {},
) {
  return {
    rows,
    sequence: Sequence.OneK_OneK,
    precisions: ['fp4'],
    targetValue: 50,
    mode: 'interactivity_to_throughput' as const,
    costProvider: 'costh' as const,
    rank: rankByThroughput,
    ...over,
  };
}

describe('selectHistoricalBest', () => {
  it('returns empty results for empty input', () => {
    expect(selectHistoricalBest(options([]))).toEqual({ best: [], unmeasured: [], datesSeen: 0 });
    expect(selectHistoricalBest(options([makeRow()], { precisions: [] })).best).toEqual([]);
  });

  it('promotes an earlier date when it beat the latest at the target', () => {
    // June sweep is stronger at the target; July explored elsewhere and regressed.
    const rows = [
      sweep('2026-06-01', 20, 1200),
      sweep('2026-06-01', 50, 900),
      sweep('2026-06-01', 80, 400),
      sweep('2026-07-01', 20, 1000),
      sweep('2026-07-01', 50, 600),
      sweep('2026-07-01', 80, 300),
    ];

    const { best, datesSeen } = selectHistoricalBest(options(rows));
    expect(datesSeen).toBe(2);
    expect(best).toHaveLength(1);
    const entry = best[0]!;
    expect(entry.date).toBe('2026-06-01');
    expect(entry.latestDate).toBe('2026-07-01');
    expect(entry.supersededLatest).toBe(true);
    expect(entry.datesConsidered).toBe(2);
    expect(entry.datesMeasured).toBe(2);
    expect(entry.result.value).toBeCloseTo(900, 6);
    // The latest date is still reported, so the UI can show what was given up.
    expect(entry.latestRankValue).toBeCloseTo(600, 6);
  });

  it('keeps the latest date when it is genuinely the best', () => {
    const rows = [
      sweep('2026-06-01', 20, 900),
      sweep('2026-06-01', 50, 600),
      sweep('2026-07-01', 20, 1400),
      sweep('2026-07-01', 50, 1100),
    ];

    const entry = selectHistoricalBest(options(rows)).best[0]!;
    expect(entry.date).toBe('2026-07-01');
    expect(entry.supersededLatest).toBe(false);
    expect(entry.latestRankValue).toBeCloseTo(entry.rankValue, 6);
  });

  it('never lets a clamped read win', () => {
    // The June sweep tops out at 30 tok/s/user but is very high throughput
    // there. Clamping would credit 5000 tok/s/gpu at a target of 50, which
    // June never measured — that is the artifact this rule exists to kill.
    const rows = [
      sweep('2026-06-01', 10, 6000),
      sweep('2026-06-01', 30, 5000),
      sweep('2026-07-01', 40, 800),
      sweep('2026-07-01', 60, 500),
    ];

    const entry = selectHistoricalBest(options(rows)).best[0]!;
    expect(entry.date).toBe('2026-07-01');
    expect(entry.datesMeasured).toBe(1);
    expect(entry.datesConsidered).toBe(2);
    expect(entry.result.clamped).toBeFalsy();
    // Nowhere near June's clamped 5000.
    expect(entry.result.value).toBeLessThan(1000);
  });

  it('reports an hwKey measured nowhere near the target instead of dropping it', () => {
    const rows = [sweep('2026-06-01', 60, 900), sweep('2026-06-01', 90, 400)];

    const { best, unmeasured } = selectHistoricalBest(options(rows, { targetValue: 20 }));
    expect(best).toEqual([]);
    expect(unmeasured).toHaveLength(1);
    // The measured range lets the UI explain *why* there is no number.
    expect(unmeasured[0]!.measuredMin).toBe(60);
    expect(unmeasured[0]!.measuredMax).toBe(90);
    expect(unmeasured[0]!.datesConsidered).toBe(1);
  });

  it('ranks by the injected accessor, not by throughput', () => {
    const rows = [
      sweep('2026-06-01', 40, 1000),
      sweep('2026-06-01', 60, 900),
      sweep('2026-07-01', 40, 800),
      sweep('2026-07-01', 60, 700),
    ];

    // Inverting the ranking must invert the winner — proof the caller's
    // cost-matrix accessor is what decides, not a hardcoded field.
    const highest = selectHistoricalBest(options(rows)).best[0]!;
    const lowest = selectHistoricalBest(options(rows, { rank: (r) => -r.value })).best[0]!;
    expect(highest.date).toBe('2026-06-01');
    expect(lowest.date).toBe('2026-07-01');
  });

  it('ignores a rank that is not a finite number', () => {
    const rows = [sweep('2026-06-01', 40, 1000), sweep('2026-06-01', 60, 900)];
    const { best, unmeasured } = selectHistoricalBest(options(rows, { rank: () => NaN }));
    expect(best).toEqual([]);
    expect(unmeasured.map((u) => u.hwKey)).toHaveLength(1);
  });

  it('keeps each date on its own frontier', () => {
    // If dates were pooled, the June high-throughput point and the July
    // high-interactivity point would form one frontier and interpolate to a
    // config no single sweep ever produced.
    const rows = [
      sweep('2026-06-01', 30, 2000),
      sweep('2026-06-01', 40, 1800),
      sweep('2026-07-01', 60, 900),
      sweep('2026-07-01', 80, 400),
    ];

    const { best, unmeasured } = selectHistoricalBest(options(rows, { targetValue: 50 }));
    // Neither date measured 50, and pooling is the only way to get a read.
    expect(best).toEqual([]);
    expect(unmeasured).toHaveLength(1);
  });

  it('tracks separate hardware separately and ranks the winners', () => {
    const rows = [
      sweep('2026-06-01', 40, 1000, { hardware: 'b300' }),
      sweep('2026-06-01', 60, 800, { hardware: 'b300' }),
      sweep('2026-06-01', 40, 400, { hardware: 'h200', precision: 'fp8' }),
      sweep('2026-06-01', 60, 300, { hardware: 'h200', precision: 'fp8' }),
    ];

    const { best } = selectHistoricalBest(options(rows, { precisions: ['fp4', 'fp8'] }));
    expect(best).toHaveLength(2);
    // Ranked best first.
    expect(best[0]!.rankValue).toBeGreaterThan(best[1]!.rankValue);
    expect(best[0]!.hwKey).toContain('b300');
    expect(best[1]!.hwKey).toContain('h200');
    // One series per hwKey, keyed for the legend.
    for (const entry of best) expect(entry.result.resultKey).toBe(entry.hwKey);
  });

  it('pools precisions into one frontier per hwKey', () => {
    // Precision is part of the config, and the question is what the chip's best
    // config does — so fp8 winning on one date must be eligible.
    const rows = [
      sweep('2026-06-01', 40, 700, { precision: 'fp4' }),
      sweep('2026-06-01', 60, 500, { precision: 'fp4' }),
      sweep('2026-06-01', 40, 1500, { precision: 'fp8' }),
      sweep('2026-06-01', 60, 1200, { precision: 'fp8' }),
    ];

    const { best } = selectHistoricalBest(options(rows, { precisions: ['fp4', 'fp8'] }));
    expect(best).toHaveLength(1);
    // The fp8 frontier dominates, so the read reflects it.
    expect(best[0]!.result.value).toBeGreaterThan(1000);
  });

  it('restricts the search to the visible legend keys', () => {
    const rows = [
      sweep('2026-06-01', 40, 1000, { hardware: 'b300' }),
      sweep('2026-06-01', 60, 800, { hardware: 'b300' }),
      sweep('2026-06-01', 40, 400, { hardware: 'h200', precision: 'fp8' }),
      sweep('2026-06-01', 60, 300, { hardware: 'h200', precision: 'fp8' }),
    ];

    const all = selectHistoricalBest(options(rows, { precisions: ['fp4', 'fp8'] }));
    const visible = new Set([all.best[0]!.hwKey]);
    const filtered = selectHistoricalBest(
      options(rows, { precisions: ['fp4', 'fp8'], visibleHwKeys: visible }),
    );
    expect(filtered.best).toHaveLength(1);
    expect(filtered.best[0]!.hwKey).toBe(all.best[0]!.hwKey);
    expect(filtered.unmeasured).toEqual([]);
  });

  it('carries the winning date run URLs for auditability', () => {
    const june = 'https://github.com/org/repo/actions/runs/111';
    const july = 'https://github.com/org/repo/actions/runs/222';
    const rows = [
      sweep('2026-06-01', 40, 1200, { run_url: june }),
      sweep('2026-06-01', 60, 1000, { run_url: june }),
      sweep('2026-07-01', 40, 500, { run_url: july }),
      sweep('2026-07-01', 60, 400, { run_url: july }),
    ];

    const entry = selectHistoricalBest(options(rows)).best[0]!;
    expect(entry.date).toBe('2026-06-01');
    // Only the winning date's run — the number has to be traceable to it.
    expect(entry.runUrls).toEqual([june]);
  });

  it('reports every run pooled into a winning date', () => {
    // getAllBenchmarksForHistory has no DISTINCT ON, so a same-day re-sweep
    // lands in one bucket. Surfacing both URLs makes that visible.
    const a = 'https://github.com/org/repo/actions/runs/111';
    const b = 'https://github.com/org/repo/actions/runs/222';
    const rows = [
      sweep('2026-06-01', 40, 1200, { run_url: a }),
      sweep('2026-06-01', 60, 1000, { run_url: b }),
    ];

    const entry = selectHistoricalBest(options(rows)).best[0]!;
    expect(entry.runUrls.toSorted()).toEqual([a, b]);
  });

  it('still selects when runs have no URL', () => {
    const rows = [sweep('2026-06-01', 40, 1200), sweep('2026-06-01', 60, 1000)];
    const entry = selectHistoricalBest(options(rows)).best[0]!;
    expect(entry.runUrls).toEqual([]);
  });

  it('works in throughput_to_interactivity mode', () => {
    const rows = [
      sweep('2026-06-01', 30, 400),
      sweep('2026-06-01', 10, 900),
      sweep('2026-07-01', 20, 400),
      sweep('2026-07-01', 8, 900),
    ];

    const { best } = selectHistoricalBest(
      options(rows, { mode: 'throughput_to_interactivity', targetValue: 600 }),
    );
    expect(best).toHaveLength(1);
    // Reads an interactivity, and June's curve is the higher one.
    expect(best[0]!.date).toBe('2026-06-01');
    expect(best[0]!.result.value).toBeGreaterThan(10);
    expect(best[0]!.result.value).toBeLessThan(30);
  });

  it('reuses one grouping across several targets', () => {
    // The two stages exist so moving the slider re-reads the frontiers without
    // rebuilding them; the staged path must agree with the composed one.
    const rows = [
      sweep('2026-06-01', 20, 1200),
      sweep('2026-06-01', 50, 900),
      sweep('2026-06-01', 80, 400),
      sweep('2026-07-01', 20, 1000),
      sweep('2026-07-01', 50, 600),
      sweep('2026-07-01', 80, 300),
    ];

    const groups = groupHistoryByHwKeyAndDate(options(rows));
    expect(groups.datesSeen).toBe(2);
    expect([...groups.byHwKey.values()][0]).toHaveLength(2);

    for (const targetValue of [25, 50, 75]) {
      const staged = selectBestFromGroups(groups, { ...options(rows), targetValue });
      const composed = selectHistoricalBest(options(rows, { targetValue }));
      expect(staged.best.map((e) => [e.hwKey, e.date, e.rankValue])).toEqual(
        composed.best.map((e) => [e.hwKey, e.date, e.rankValue]),
      );
    }
  });

  it('drops rows whose sequence does not match the selection', () => {
    const rows = [
      sweep('2026-06-01', 40, 1000, { isl: 8192, osl: 1024 }),
      sweep('2026-06-01', 60, 800, { isl: 8192, osl: 1024 }),
    ];
    expect(selectHistoricalBest(options(rows)).best).toEqual([]);
    expect(selectHistoricalBest(options(rows)).datesSeen).toBe(0);
  });
});
