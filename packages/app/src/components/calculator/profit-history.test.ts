import { describe, expect, it } from 'vitest';

import type { AvailabilityRow, BenchmarkRow, RunConfigRow } from '@/lib/api';
import { Percentile } from '@/lib/data-mappings';

import {
  buildProfitHistoryResults,
  HISTORY_MAX_FADE,
  historyFadeShare,
  historyResultKey,
  orderProfitRowsForHistory,
  parseHistoryResultKey,
  profitHistoryAvailableDates,
  profitHistoryChipOptions,
  profitHistoryCurrentRunId,
  profitHistoryDateRanks,
  profitHistoryEntryDate,
  profitHistoryEntryLabel,
  profitHistoryLegendKeys,
  profitHistoryMissing,
  shadeHistoryColor,
} from './profit-history';

function availability(overrides: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    model: 'kimik3',
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    date: '2026-08-31',
    ...overrides,
  };
}

/** An agentic sweep point on a date; `hardware` must be a registry chip. */
function agenticRow(
  date: string,
  hardware: string,
  interactivity: number,
  tputPerGpu: number,
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return {
    id: Math.round(interactivity * 1000 + tputPerGpu),
    hardware,
    framework: 'sglang',
    model: 'kimik3',
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
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: Math.round(tputPerGpu / interactivity),
    offload_mode: 'on',
    image: 'sglang:test',
    metrics: {
      p90_itl: 1 / interactivity,
      p90_e2el: 10,
      tput_per_gpu: tputPerGpu,
      output_tput_per_gpu: tputPerGpu * 0.008,
      input_tput_per_gpu: tputPerGpu * 0.992,
      server_gpu_cache_hit_rate: 0.9,
    },
    date,
    run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${date}-${hardware}`,
    ...overrides,
  };
}

const KIMI_KEYS = ['kimik3'];

describe('historyResultKey', () => {
  it('round-trips a base key and date, including a precision-suffixed base', () => {
    expect(parseHistoryResultKey(historyResultKey('b200_sglang__fp4', '2026-06-14'))).toEqual({
      baseKey: 'b200_sglang__fp4',
      date: '2026-06-14',
    });
  });

  it('round-trips a run entry, whose own `~r<runId>` suffix is not the separator', () => {
    expect(
      parseHistoryResultKey(historyResultKey('b200_sglang', '2026-06-14~r27489075807')),
    ).toEqual({ baseKey: 'b200_sglang', date: '2026-06-14~r27489075807' });
  });

  it('leaves an undated key alone', () => {
    expect(parseHistoryResultKey('b200_sglang')).toEqual({ baseKey: 'b200_sglang' });
  });
});

describe('profitHistoryEntryLabel', () => {
  it('prints a plain date as is', () => {
    expect(profitHistoryEntryLabel('2026-06-14')).toBe('2026-06-14');
    expect(profitHistoryEntryLabel('2026-06-14', new Map())).toBe('2026-06-14');
  });

  it('numbers a run entry the way the changelog does', () => {
    const numbering = new Map([
      ['2026-06-14~r1', 1],
      ['2026-06-14~r2', 2],
    ]);
    expect(profitHistoryEntryLabel('2026-06-14~r2', numbering)).toBe('2026-06-14 #2');
    expect(profitHistoryEntryDate('2026-06-14~r2')).toBe('2026-06-14');
  });
});

describe('profitHistoryChipOptions', () => {
  const rows = [
    availability({ hardware: 'gb300', framework: 'sglang' }),
    availability({ hardware: 'b200', framework: 'sglang' }),
    // Another model's rows never leak in.
    availability({ hardware: 'mi355x', framework: 'vllm', model: 'glm5.2' }),
    // Single-turn rows are not what the estimator prices.
    availability({ hardware: 'h200', framework: 'vllm', benchmark_type: 'single_turn', isl: 1024 }),
    // A precision outside the selection is not offered either.
    availability({ hardware: 'b300', framework: 'vllm', precision: 'fp8' }),
  ];

  it('offers known agentic configs for the model at the selected precisions, in registry order', () => {
    const options = profitHistoryChipOptions(rows, KIMI_KEYS, ['fp4']);
    // HW_REGISTRY sorts the newest chip first, as the /inference selector does.
    expect(options.map((o) => o.value)).toEqual(['gb300_sglang', 'b200_sglang']);
    expect(options[0]!.label).toContain('GB300');
  });

  it('returns nothing before availability loads', () => {
    expect(profitHistoryChipOptions(undefined, KIMI_KEYS, ['fp4'])).toEqual([]);
  });
});

describe('profitHistoryAvailableDates', () => {
  const rows = [
    availability({ date: '2026-08-31' }),
    availability({ date: '2026-06-14' }),
    availability({ date: '2026-07-01', hardware: 'gb300' }),
  ];

  it('lists the sorted run dates of the selected chips only', () => {
    expect(profitHistoryAvailableDates(rows, KIMI_KEYS, ['fp4'], ['b200_sglang'])).toEqual([
      '2026-06-14',
      '2026-08-31',
    ]);
  });

  it('is empty with no chip selected', () => {
    expect(profitHistoryAvailableDates(rows, KIMI_KEYS, ['fp4'], [])).toEqual([]);
  });
});

describe('buildProfitHistoryResults', () => {
  const options = {
    selectedGPUs: ['b200_sglang'],
    precisions: ['fp4'],
    percentile: Percentile.P90,
    targetValue: 60,
    mode: 'interactivity_to_throughput' as const,
    costProvider: 'costh' as const,
  };

  it('interpolates the selected chip at the target on each date and stamps the date', () => {
    const rowsByDate = [
      {
        date: '2026-06-14',
        rows: [
          agenticRow('2026-06-14', 'b200', 40, 800),
          agenticRow('2026-06-14', 'b200', 80, 400),
        ],
      },
    ];
    const results = buildProfitHistoryResults(rowsByDate, options);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      hwKey: 'b200_sglang',
      resultKey: 'b200_sglang|2026-06-14',
      date: '2026-06-14',
      clamped: false,
    });
    // Monotone Hermite between the two knots, the same spline the current bars
    // use, so the value lands between them rather than on the chord.
    expect(results[0]!.value).toBeGreaterThan(400);
    expect(results[0]!.value).toBeLessThan(800);
  });

  it('ignores chips outside the selection and keeps one run per chip per date', () => {
    const rowsByDate = [
      {
        date: '2026-06-14',
        rows: [
          agenticRow('2026-06-14', 'b200', 40, 800, {
            run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100',
          }),
          agenticRow('2026-06-14', 'b200', 80, 400, {
            run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100',
          }),
          // A later run the same day supersedes the earlier one.
          agenticRow('2026-06-14', 'b200', 40, 1600, {
            id: 9001,
            run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/200',
          }),
          agenticRow('2026-06-14', 'b200', 80, 800, {
            id: 9002,
            run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/200',
          }),
          agenticRow('2026-06-14', 'gb300', 40, 900),
          agenticRow('2026-06-14', 'gb300', 80, 500),
        ],
      },
    ];
    const results = buildProfitHistoryResults(rowsByDate, options);
    expect(results.map((r) => r.hwKey)).toEqual(['b200_sglang']);
    // Only the later run's curve (1600 → 800) is priced, so the value clears
    // the earlier run's best point.
    expect(results[0]!.value).toBeGreaterThan(800);
    expect(results[0]!.value).toBeLessThan(1600);
  });

  it('returns nothing with no chip selected', () => {
    expect(
      buildProfitHistoryResults(
        [{ date: '2026-06-14', rows: [agenticRow('2026-06-14', 'b200', 40, 800)] }],
        { ...options, selectedGPUs: [] },
      ),
    ).toEqual([]);
  });
});

describe('orderProfitRowsForHistory', () => {
  it('keeps chips in their incoming order and sorts each chip oldest → today', () => {
    const rows = [
      { hwKey: 'gb300_sglang', date: undefined },
      { hwKey: 'b200_sglang', date: '2026-06-14' },
      { hwKey: 'gb300_sglang', date: '2026-06-14' },
      { hwKey: 'b200_sglang', date: undefined },
      { hwKey: 'gb300_sglang', date: '2026-07-20' },
    ];
    expect(orderProfitRowsForHistory(rows).map((r) => `${r.hwKey}@${r.date ?? 'now'}`)).toEqual([
      'gb300_sglang@2026-06-14',
      'gb300_sglang@2026-07-20',
      'gb300_sglang@now',
      'b200_sglang@2026-06-14',
      'b200_sglang@now',
    ]);
  });

  it('orders same-day runs by run id after the earlier date', () => {
    const rows = [
      { hwKey: 'b200_sglang', date: '2026-07-20~r9' },
      { hwKey: 'b200_sglang', date: '2026-07-20~r10' },
      { hwKey: 'b200_sglang', date: '2026-06-14' },
    ];
    expect(orderProfitRowsForHistory(rows).map((r) => r.date)).toEqual([
      '2026-06-14',
      '2026-07-20~r9',
      '2026-07-20~r10',
    ]);
  });
});

describe('profitHistoryDateRanks', () => {
  it('ranks dates oldest first with today last', () => {
    const { rank, count } = profitHistoryDateRanks([
      { date: undefined },
      { date: '2026-07-20' },
      { date: '2026-06-14' },
    ]);
    expect(count).toBe(3);
    expect(rank('2026-06-14')).toBe(0);
    expect(rank('2026-07-20')).toBe(1);
    expect(rank(undefined)).toBe(2);
  });

  it('gives each same-day run its own rank in run order', () => {
    const { rank, count } = profitHistoryDateRanks([
      { date: '2026-07-20~r10' },
      { date: '2026-07-20~r9' },
      { date: undefined },
    ]);
    expect(count).toBe(3);
    expect(rank('2026-07-20~r9')).toBe(0);
    expect(rank('2026-07-20~r10')).toBe(1);
  });
});

describe('historyFadeShare', () => {
  it('fades the oldest date most and today not at all', () => {
    expect(historyFadeShare(0, 3)).toBeCloseTo(HISTORY_MAX_FADE);
    expect(historyFadeShare(1, 3)).toBeCloseTo(HISTORY_MAX_FADE / 2);
    expect(historyFadeShare(2, 3)).toBe(0);
  });

  it('never fades a lone date', () => {
    expect(historyFadeShare(0, 1)).toBe(0);
  });
});

describe('shadeHistoryColor', () => {
  it('lifts lightness toward the theme ceiling and eases chroma, keeping the hue', () => {
    expect(shadeHistoryColor('oklch(0.500 0.200 150.0)', 0.5, 'light')).toBe(
      'oklch(0.680 0.150 150.0)',
    );
  });

  it('returns the colour unchanged with no fade or an unparseable value', () => {
    expect(shadeHistoryColor('oklch(0.500 0.200 150.0)', 0, 'dark')).toBe(
      'oklch(0.500 0.200 150.0)',
    );
    expect(shadeHistoryColor('var(--muted-foreground)', 0.5, 'dark')).toBe(
      'var(--muted-foreground)',
    );
  });
});

describe('profitHistoryCurrentRunId', () => {
  const scope = {
    modelDbKeys: ['kimik3'],
    selectedGPUs: ['b200_sglang'],
    selectedPrecisions: ['fp4'],
    benchmarkType: 'agentic_traces' as const,
  };
  function rc(over: Partial<RunConfigRow>): RunConfigRow {
    return {
      github_run_id: 1,
      run_started_at: '2026-08-10T00:00:00Z',
      html_url: null,
      head_sha: null,
      model: 'kimik3',
      precision: 'fp4',
      hardware: 'b200',
      framework: 'sglang',
      spec_method: 'none',
      disagg: false,
      ...over,
    };
  }
  const changelogs = [
    {
      date: '2026-08-10',
      runConfigs: [
        rc({ github_run_id: 27480000002, run_started_at: '2026-08-10T12:00:00Z' }),
        rc({ github_run_id: 27480000001, run_started_at: '2026-08-10T03:00:00Z' }),
        // Another chip's later run is not this comparison's main run.
        rc({
          github_run_id: 27480000009,
          run_started_at: '2026-08-10T20:00:00Z',
          hardware: 'h200',
        }),
      ],
    },
    { date: '2026-07-15', runConfigs: [rc({ github_run_id: 27470000001 })] },
  ];

  it('picks the latest enumerated run of the current date for the compared chips', () => {
    expect(profitHistoryCurrentRunId(changelogs, '2026-08-10', scope, '999')).toBe('27480000002');
  });

  it('falls back to the global run id until the current date is in the changelog', () => {
    expect(profitHistoryCurrentRunId(changelogs, '2026-08-31', scope, '999')).toBe('999');
    expect(profitHistoryCurrentRunId([], '2026-08-10', scope, '')).toBeUndefined();
  });
});

describe('profitHistoryLegendKeys', () => {
  const rows = [
    { hwKey: 'b200_sglang' },
    { hwKey: 'gb300_sglang' },
    // Priced only on a comparison date; today's run has no row for it.
    { hwKey: 'mi355x_vllm' },
  ];
  const today = ['gb300_sglang', 'b200_sglang', 'h200_vllm'];

  it("lists today's priced chips in availability order without a comparison", () => {
    expect(profitHistoryLegendKeys(today, rows, false)).toEqual(['gb300_sglang', 'b200_sglang']);
  });

  it('keeps a chip that only priced on an earlier entry while comparing', () => {
    expect(profitHistoryLegendKeys(today, rows, true)).toEqual([
      'gb300_sglang',
      'b200_sglang',
      'mi355x_vllm',
    ]);
  });
});

describe('profitHistoryMissing', () => {
  const label = (hwKey: string) => hwKey.toUpperCase();
  const entry = (e: string) => `on ${e}`;

  it('names each compared chip with no bar on an entry, the current date included', () => {
    const rows = [
      { hwKey: 'b200_sglang', date: undefined },
      { hwKey: 'b200_sglang', date: '2026-07-15' },
      { hwKey: 'mi355x_vllm', date: '2026-07-15' },
    ];
    expect(
      profitHistoryMissing(
        rows,
        ['2026-07-15', '2026-08-10~r5'],
        ['b200_sglang', 'mi355x_vllm'],
        label,
        entry,
        '2026-08-31',
      ),
    ).toEqual([
      'B200_SGLANG • on 2026-08-10~r5',
      'MI355X_VLLM • on 2026-08-10~r5',
      'MI355X_VLLM • 2026-08-31',
    ]);
  });

  it('is empty when every compared chip priced everywhere', () => {
    const rows = [
      { hwKey: 'b200_sglang', date: undefined },
      { hwKey: 'b200_sglang', date: '2026-07-15' },
    ];
    expect(
      profitHistoryMissing(rows, ['2026-07-15'], ['b200_sglang'], label, entry, '2026-08-31'),
    ).toEqual([]);
  });
});
