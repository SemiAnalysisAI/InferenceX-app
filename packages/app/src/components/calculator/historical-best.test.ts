import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { Sequence } from '@/lib/catalog/data-mappings';

import {
  bestSoFarProgression,
  groupHistoryByHwKeyAndDate,
  mergeProgressionsByChip,
  selectBestFromGroups,
  selectHistoricalBest,
  type GroupHistoryOptions,
  type SelectBestOptions,
} from './historical-best';
import type { InterpolatedResult } from './types';

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
  it('never merges FP4 and FP8 sweeps of one config into a chimeric frontier', () => {
    // FP4 only reaches 40 tok/s/user and FP8 only starts at 60, so neither
    // measures the 50 target; a merged frontier would interpolate one anyway.
    const rows = [
      sweep('2026-06-01', 20, 1500, { precision: 'fp4' }),
      sweep('2026-06-01', 40, 1300, { precision: 'fp4' }),
      sweep('2026-06-01', 60, 1000, { precision: 'fp8' }),
      sweep('2026-06-01', 80, 200, { precision: 'fp8' }),
    ];

    const outcome = selectHistoricalBest(options(rows, { precisions: ['fp4', 'fp8'] }));
    expect(outcome.best).toEqual([]);
    expect(outcome.unmeasured).toHaveLength(1);
    expect(outcome.unmeasured[0]!.datesConsidered).toBe(1);
  });

  it("picks a config's best precision and reports it, counting dates once", () => {
    const rows = [
      sweep('2026-06-01', 20, 800, { precision: 'fp8' }),
      sweep('2026-06-01', 80, 400, { precision: 'fp8' }),
      sweep('2026-06-01', 20, 1600, { precision: 'fp4' }),
      sweep('2026-06-01', 80, 1000, { precision: 'fp4' }),
    ];

    const entry = selectHistoricalBest(options(rows, { precisions: ['fp4', 'fp8'] })).best[0]!;
    expect(entry.precision).toBe('fp4');
    expect(entry.datesConsidered).toBe(1);
    expect(entry.datesMeasured).toBe(1);
    expect(entry.latestRankValue).toBeCloseTo(entry.rankValue, 6);

    const groups = groupHistoryByHwKeyAndDate(options(rows, { precisions: ['fp4', 'fp8'] }));
    const [progression] = bestSoFarProgression(groups, options(rows));
    expect(progression!.steps.map((step) => [step.date, step.precision])).toEqual([
      ['2026-06-01', 'fp4'],
    ]);
    expect(progression!.datesConsidered).toBe(1);
  });

  it('returns empty results for empty input', () => {
    expect(selectHistoricalBest(options([]))).toEqual({ best: [], unmeasured: [], datesSeen: 0 });
    expect(selectHistoricalBest(options([makeRow()], { precisions: [] })).best).toEqual([]);
  });

  it('promotes an earlier date when it beat the latest at the target', () => {
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
    expect(entry.result.value).toBeLessThan(1000);
  });

  it('reports an hwKey measured nowhere near the target instead of dropping it', () => {
    const rows = [sweep('2026-06-01', 60, 900), sweep('2026-06-01', 90, 400)];

    const { best, unmeasured } = selectHistoricalBest(options(rows, { targetValue: 20 }));
    expect(best).toEqual([]);
    expect(unmeasured).toHaveLength(1);
    expect(unmeasured[0]!.nearestBelow).toBeNull();
    expect(unmeasured[0]!.nearestAbove).toBe(60);
    expect(unmeasured[0]!.datesConsidered).toBe(1);
  });

  it('never reports a neighbourhood that brackets the target it just excluded', () => {
    const rows = [sweep('2026-06-01', 20, 1000), sweep('2026-07-01', 80, 400)];

    const { best, unmeasured } = selectHistoricalBest(options(rows, { targetValue: 50 }));
    expect(best).toEqual([]);
    expect(unmeasured).toHaveLength(1);
    const entry = unmeasured[0]!;
    expect(entry.nearestBelow).toBe(20);
    expect(entry.nearestAbove).toBe(80);
    expect(entry.datesConsidered).toBe(2);
    expect(entry.nearestBelow).toBeLessThan(50);
    expect(entry.nearestAbove).toBeGreaterThan(50);
  });

  it('ranks by the injected accessor, not by throughput', () => {
    const rows = [
      sweep('2026-06-01', 40, 1000),
      sweep('2026-06-01', 60, 900),
      sweep('2026-07-01', 40, 800),
      sweep('2026-07-01', 60, 700),
    ];

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
    const rows = [
      sweep('2026-06-01', 30, 2000),
      sweep('2026-06-01', 40, 1800),
      sweep('2026-07-01', 60, 900),
      sweep('2026-07-01', 80, 400),
    ];

    const { best, unmeasured } = selectHistoricalBest(options(rows, { targetValue: 50 }));
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
    expect(best[0]!.rankValue).toBeGreaterThan(best[1]!.rankValue);
    expect(best[0]!.hwKey).toContain('b300');
    expect(best[1]!.hwKey).toContain('h200');
    for (const entry of best) expect(entry.result.resultKey).toBe(entry.hwKey);
  });

  it('pools precisions into one frontier per hwKey', () => {
    const rows = [
      sweep('2026-06-01', 40, 700, { precision: 'fp4' }),
      sweep('2026-06-01', 60, 500, { precision: 'fp4' }),
      sweep('2026-06-01', 40, 1500, { precision: 'fp8' }),
      sweep('2026-06-01', 60, 1200, { precision: 'fp8' }),
    ];

    const { best } = selectHistoricalBest(options(rows, { precisions: ['fp4', 'fp8'] }));
    expect(best).toHaveLength(1);
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
    expect(entry.runUrls).toEqual([june]);
  });

  it('reports every run pooled into a winning date', () => {
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
    expect(best[0]!.date).toBe('2026-06-01');
    expect(best[0]!.result.value).toBeGreaterThan(10);
    expect(best[0]!.result.value).toBeLessThan(30);
  });

  it('reuses one grouping across several targets', () => {
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

describe('bestSoFarProgression', () => {
  it('keeps only the dates that beat every earlier date', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 400 : 200)),
      ...[30, 60].map((iv) => sweep('2026-05-02', iv, iv === 30 ? 900 : 500)),
      ...[30, 60].map((iv) => sweep('2026-05-10', iv, iv === 30 ? 700 : 400)),
      ...[30, 60].map((iv) => sweep('2026-05-27', iv, iv === 30 ? 1600 : 800)),
    ];

    const groups = groupHistoryByHwKeyAndDate(options(rows));
    const progressions = bestSoFarProgression(groups, { ...options(rows), targetValue: 45 });

    expect(progressions).toHaveLength(1);
    const p = progressions[0]!;
    expect(p.steps.map((s) => s.date)).toEqual(['2026-04-25', '2026-05-02', '2026-05-27']);
    expect(p.datesMeasured).toBe(4);
    expect(p.datesConsidered).toBe(4);
  });

  it('is strictly increasing in rank value', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 400 : 200)),
      ...[30, 60].map((iv) => sweep('2026-05-02', iv, iv === 30 ? 900 : 500)),
      ...[30, 60].map((iv) => sweep('2026-05-27', iv, iv === 30 ? 1600 : 800)),
    ];
    const groups = groupHistoryByHwKeyAndDate(options(rows));
    const p = bestSoFarProgression(groups, { ...options(rows), targetValue: 45 }).at(0)!;
    for (let i = 1; i < p.steps.length; i += 1) {
      expect(p.steps[i]!.rankValue).toBeGreaterThan(p.steps[i - 1]!.rankValue);
    }
  });

  it('reports each step gain over the opening config, with the first at 1', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 400 : 200)),
      ...[30, 60].map((iv) => sweep('2026-05-27', iv, iv === 30 ? 1600 : 800)),
    ];
    const groups = groupHistoryByHwKeyAndDate(options(rows));
    const p = bestSoFarProgression(groups, { ...options(rows), targetValue: 45 }).at(0)!;
    expect(p.steps[0]!.factorOverFirst).toBe(1);
    expect(p.steps.at(-1)!.factorOverFirst).toBeCloseTo(
      p.steps.at(-1)!.rankValue / p.steps[0]!.rankValue,
      9,
    );
    expect(p.steps.at(-1)!.factorOverFirst).toBeGreaterThan(1);
  });

  it('never lets a clamped read become a step', () => {
    const rows = [
      ...[10, 30].map((iv) => sweep('2026-04-25', iv, iv === 10 ? 6000 : 5000)),
      ...[40, 60].map((iv) => sweep('2026-05-02', iv, iv === 40 ? 800 : 500)),
    ];
    const groups = groupHistoryByHwKeyAndDate(options(rows));
    const p = bestSoFarProgression(groups, { ...options(rows), targetValue: 45 }).at(0)!;
    expect(p.steps.map((s) => s.date)).toEqual(['2026-05-02']);
    expect(p.steps[0]!.result.clamped).toBeFalsy();
  });

  it('carries the run URLs for every step', () => {
    const runA = 'https://github.com/org/repo/actions/runs/111';
    const runB = 'https://github.com/org/repo/actions/runs/222';
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 400 : 200, { run_url: runA })),
      ...[30, 60].map((iv) => sweep('2026-05-27', iv, iv === 30 ? 1600 : 800, { run_url: runB })),
    ];
    const groups = groupHistoryByHwKeyAndDate(options(rows));
    const p = bestSoFarProgression(groups, { ...options(rows), targetValue: 45 }).at(0)!;
    expect(p.steps.map((s) => s.runUrls)).toEqual([[runA], [runB]]);
  });

  it('ends at the same config the all-time best selection reports', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 400 : 200)),
      ...[30, 60].map((iv) => sweep('2026-05-27', iv, iv === 30 ? 1600 : 800)),
      ...[30, 60].map((iv) => sweep('2026-06-10', iv, iv === 30 ? 900 : 500)),
    ];
    const opts = { ...options(rows), targetValue: 45 };
    const groups = groupHistoryByHwKeyAndDate(opts);
    const best = selectBestFromGroups(groups, opts).best[0]!;
    const p = bestSoFarProgression(groups, opts).at(0)!;
    expect(p.steps.at(-1)!.date).toBe(best.date);
    expect(p.steps.at(-1)!.rankValue).toBeCloseTo(best.rankValue, 9);
  });

  it('tracks each chip separately, ranked by its latest best', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 1400 : 900)),
      ...[30, 60].map((iv) =>
        sweep('2026-04-25', iv, iv === 30 ? 400 : 200, { hardware: 'h200', precision: 'fp8' }),
      ),
    ];
    const opts = { ...options(rows), precisions: ['fp4', 'fp8'], targetValue: 45 };
    const progressions = bestSoFarProgression(groupHistoryByHwKeyAndDate(opts), opts);
    expect(progressions).toHaveLength(2);
    expect(progressions[0]!.steps.at(-1)!.rankValue).toBeGreaterThan(
      progressions[1]!.steps.at(-1)!.rankValue,
    );
  });

  it('omits chips with no unclamped read at all', () => {
    const rows = [70, 90].map((iv) => sweep('2026-04-25', iv, iv === 70 ? 400 : 200));
    const opts = { ...options(rows), targetValue: 20 };
    expect(bestSoFarProgression(groupHistoryByHwKeyAndDate(opts), opts)).toEqual([]);
  });
});

describe('mergeProgressionsByChip', () => {
  const twoFrameworks = [
    ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 900 : 500)),
    ...[30, 60].map((iv) => sweep('2026-06-01', iv, iv === 30 ? 1000 : 600)),
    ...[30, 60].map((iv) =>
      sweep('2026-05-02', iv, iv === 30 ? 600 : 300, { framework: 'trtllm' }),
    ),
    ...[30, 60].map((iv) =>
      sweep('2026-07-04', iv, iv === 30 ? 1600 : 800, { framework: 'trtllm' }),
    ),
  ];

  const mergeAt = (rows: BenchmarkRow[], targetValue = 45) => {
    const opts = { ...options(rows), targetValue };
    return mergeProgressionsByChip(bestSoFarProgression(groupHistoryByHwKeyAndDate(opts), opts));
  };

  it('draws one line per chip, not one per software config', () => {
    const chips = mergeAt(twoFrameworks);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.baseGpu).toBe('b300');
    expect(chips[0]!.key).toBe('b300');
  });

  it('follows whichever config is ahead at each moment', () => {
    const chips = mergeAt(twoFrameworks);
    const steps = chips[0]!.steps;
    expect(steps.map((s) => s.date)).toEqual(['2026-04-25', '2026-06-01', '2026-07-04']);
    expect(steps.map((s) => s.result.hwKey)).toEqual(['b300_sglang', 'b300_sglang', 'b300_trt']);
    expect(chips[0]!.hwKeysUsed).toEqual(['b300_sglang', 'b300_trt']);
  });

  it('is monotonic, so a losing config never pulls the line down', () => {
    const steps = mergeAt(twoFrameworks)[0]!.steps;
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!.rankValue).toBeGreaterThan(steps[i - 1]!.rankValue);
    }
  });

  it('measures gain against the merged opening rung, not the winner own first run', () => {
    const steps = mergeAt(twoFrameworks)[0]!.steps;
    expect(steps[0]!.factorOverFirst).toBe(1);
    expect(steps.at(-1)!.factorOverFirst).toBeCloseTo(
      steps.at(-1)!.rankValue / steps[0]!.rankValue,
      9,
    );
    expect(steps.at(-1)!.factorOverFirst).toBeGreaterThan(1);
  });

  it('lets disagg compete for the same line as aggregated configs', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 900 : 500)),
      ...[30, 60].map((iv) =>
        sweep('2026-05-02', iv, iv === 30 ? 1600 : 800, {
          framework: 'sglang-disagg',
          disagg: true,
        }),
      ),
    ];
    const chips = mergeAt(rows);
    expect(chips).toHaveLength(1);
    const chip = chips[0]!;
    expect(chip.baseGpu).toBe('b300');
    expect(chip.steps.map((s) => s.date)).toEqual(['2026-04-25', '2026-05-02']);
    expect(chip.disagg).toBe(true);
  });

  it('does not flag a chip as disagg when none of its rungs are', () => {
    expect(mergeAt(twoFrameworks)[0]!.disagg).toBe(false);
  });

  it('separates distinct silicon', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 900 : 500)),
      ...[30, 60].map((iv) =>
        sweep('2026-05-02', iv, iv === 30 ? 1600 : 800, { hardware: 'b200' }),
      ),
    ];
    const chips = mergeAt(rows);
    expect(chips.map((c) => c.baseGpu).toSorted()).toEqual(['b200', 'b300']);
  });

  it('ranks chips by where they ended up', () => {
    const rows = [
      ...[30, 60].map((iv) => sweep('2026-04-25', iv, iv === 30 ? 900 : 500)),
      ...[30, 60].map((iv) =>
        sweep('2026-05-02', iv, iv === 30 ? 1600 : 800, { hardware: 'b200' }),
      ),
    ];
    const chips = mergeAt(rows);
    expect(chips[0]!.baseGpu).toBe('b200');
    expect(chips[0]!.steps.at(-1)!.rankValue).toBeGreaterThan(chips[1]!.steps.at(-1)!.rankValue);
  });

  it('returns nothing for no progressions', () => {
    expect(mergeProgressionsByChip([])).toEqual([]);
  });
});

describe('agentic traces', () => {
  function agenticSweep(
    date: string,
    interactivity: number,
    tputPerGpu: number,
    cacheHitRate?: number,
  ): BenchmarkRow {
    return makeRow({
      id: Math.round(interactivity * 1000 + tputPerGpu),
      date,
      benchmark_type: 'agentic_traces',
      isl: null,
      osl: null,
      conc: Math.round(tputPerGpu / interactivity),
      metrics: {
        p90_itl: 1 / interactivity,
        p90_e2el: 10,
        tput_per_gpu: tputPerGpu,
        output_tput_per_gpu: tputPerGpu * 0.008,
        input_tput_per_gpu: tputPerGpu * 0.992,
        ...(cacheHitRate === undefined ? {} : { server_gpu_cache_hit_rate: cacheHitRate }),
      },
    });
  }

  const agenticRows = [
    agenticSweep('2026-08-07', 40, 800, 0.9),
    agenticSweep('2026-08-07', 80, 500, 0.95),
    agenticSweep('2026-08-14', 40, 1000, 0.88),
    agenticSweep('2026-08-14', 80, 700, 0.93),
  ];

  it('groups rows that have no ISL/OSL, keyed on the agentic sequence', () => {
    const groups = groupHistoryByHwKeyAndDate({
      rows: agenticRows,
      sequence: Sequence.AgenticTraces,
      precisions: ['fp4'],
    });
    expect(groups.datesSeen).toBe(2);
    const dated = [...groups.byHwKey.values()][0]!;
    expect(dated).toHaveLength(2);
    expect(dated[0]!.points).toHaveLength(2);
    expect(dated[0]!.points.map((p) => p.interactivity).toSorted((a, b) => a - b)).toEqual([
      40, 80,
    ]);
  });

  it('reads a cached fraction at the operating point, and none for fixed sequences', () => {
    const agentic = selectBestFromGroups(
      groupHistoryByHwKeyAndDate({
        rows: agenticRows,
        sequence: Sequence.AgenticTraces,
        precisions: ['fp4'],
      }),
      {
        targetValue: 60,
        mode: 'interactivity_to_throughput',
        costProvider: 'costh',
        rank: rankByThroughput,
      },
    );
    expect(agentic.best).toHaveLength(1);
    const rate = agentic.best[0]!.result.cacheHitRate!;
    expect(rate).toBeGreaterThan(0.88);
    expect(rate).toBeLessThan(0.95);

    const fixed = selectBestFromGroups(
      groupHistoryByHwKeyAndDate(
        options([sweep('2026-07-19', 40, 800), sweep('2026-07-19', 80, 500)]),
      ),
      {
        targetValue: 60,
        mode: 'interactivity_to_throughput',
        costProvider: 'costh',
        rank: rankByThroughput,
      },
    );
    expect(fixed.best[0]!.result.cacheHitRate).toBeUndefined();
  });

  it('still builds a best-so-far staircase when a later date wins', () => {
    const progressions = bestSoFarProgression(
      groupHistoryByHwKeyAndDate({
        rows: agenticRows,
        sequence: Sequence.AgenticTraces,
        precisions: ['fp4'],
      }),
      {
        targetValue: 60,
        mode: 'interactivity_to_throughput',
        costProvider: 'costh',
        rank: rankByThroughput,
      },
    );
    expect(progressions).toHaveLength(1);
    expect(progressions[0]!.steps.map((s) => s.date)).toEqual(['2026-08-07', '2026-08-14']);
  });
});
