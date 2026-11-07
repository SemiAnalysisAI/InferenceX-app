import { describe, expect, it } from 'vitest';

import { trendMetricDependencies } from '@/components/inference/hooks/interpolated-trend-core';
import type { BenchmarkRow } from '@/lib/api/api';

import {
  achievableAt,
  buildFrontierHistory,
  comparisonBuckets,
  frontierArea,
  frontierChapters,
  frontierAreas,
  frontierRegressions,
  frontierValueAt,
  historyFromFirstData,
  averageSoftwareGain,
  softwareGainByInteractivity,
  softwareGainBarMaxLog,
  softwareGains,
  vendorsAtOtherPrecisions,
  leadMargins,
  pooledFrontier,
  seriesFrontiersAt,
  territoryShares,
  type BuildFrontierHistoryOptions,
  type FrontierVertex,
} from './frontier-history-core';

function row(
  hardware: string,
  date: string,
  interactivity: number,
  throughput: number,
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return {
    id: Math.round(Math.random() * 1e9),
    hardware,
    framework: 'trt',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    isl: 1024,
    osl: 1024,
    conc: 64,
    image: 'test',
    metrics: { tput_per_gpu: throughput, median_intvty: interactivity },
    date,
    run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${date.replaceAll('-', '')}`,
    ...overrides,
  };
}

const OPTIONS: BuildFrontierHistoryOptions = {
  selectedPrecisions: ['fp8'],
  selectedYAxisMetric: 'y_tpPerGpu',
  metricKey: 'tpPerGpu',
  requestedMetrics: trendMetricDependencies('tpPerGpu'),
  higherIsBetter: true,
};

const vertex = (x: number, y: number): FrontierVertex => ({
  x,
  y,
  conc: 1,
  precision: 'fp8',
  measured: '2026-01-01',
  runUrl: null,
  config: 'h200_trt',
  image: null,
});

describe('achievableAt', () => {
  it('returns the first vertex at or beyond the interactivity, never extrapolating', () => {
    const frontier = [vertex(20, 900), vertex(60, 300)];
    expect(achievableAt(frontier, 10)?.y).toBe(900);
    expect(achievableAt(frontier, 30)?.y).toBe(300);
    expect(achievableAt(frontier, 61)).toBeNull();
  });
});

describe('buildFrontierHistory', () => {
  const rows = [
    row('h200', '2026-03-01', 20, 400),
    row('h200', '2026-03-01', 50, 200),
    row('b200', '2026-03-05', 20, 900),
    row('b200', '2026-03-05', 60, 300),
  ];

  it('carries each configuration forward to later snapshots', () => {
    const history = buildFrontierHistory(rows, OPTIONS);
    expect(history.dates).toEqual(['2026-03-01', '2026-03-05']);
    const frontiers = seriesFrontiersAt(history, 1);
    expect([...frontiers.keys()].toSorted()).toEqual(['b200_trt', 'h200_trt']);
    expect(frontiers.get('h200_trt')!.map((v) => v.y)).toEqual([400, 200]);
  });

  it('assigns each interactivity level to the dominating series', () => {
    const history = buildFrontierHistory(rows, OPTIONS);
    expect(history.ownership[0].every((cell) => cell === null || cell.owner === 'h200_trt')).toBe(
      true,
    );
    expect(history.ownership[1].filter(Boolean).every((cell) => cell!.owner === 'b200_trt')).toBe(
      true,
    );
    expect(territoryShares(history, 1)).toEqual([
      expect.objectContaining({ key: 'b200_trt', share: 1 }),
    ]);
  });

  it('records the overtake with its multiplier and new-hardware cause', () => {
    const [overtake] = buildFrontierHistory(rows, OPTIONS).overtakes;
    expect(overtake).toMatchObject({
      date: '2026-03-05',
      winner: 'b200_trt',
      loser: 'h200_trt',
      kind: 'new-hardware',
      ongoing: true,
    });
    expect(overtake.multiplier).toBeGreaterThan(1);
  });

  it('flags reigns shorter than a week as brief', () => {
    const flicker = [
      ...rows,
      row('h200', '2026-03-20', 20, 1000),
      row('h200', '2026-03-20', 50, 900),
      row('h200', '2026-03-21', 20, 400),
      row('h200', '2026-03-21', 50, 200),
    ];
    const history = buildFrontierHistory(flicker, OPTIONS);
    const regained = history.overtakes.find((o) => o.date === '2026-03-20');
    expect(regained).toMatchObject({ winner: 'h200_trt', brief: true, heldDays: 1 });
  });

  it('prefers lower values when the metric is lower-is-better', () => {
    const history = buildFrontierHistory(rows, { ...OPTIONS, higherIsBetter: false });
    const owners = history.ownership[1].filter(Boolean).map((cell) => cell!.owner);
    expect(owners).toContain('h200_trt');
  });

  it('pools frontiers with the series that measured each vertex', () => {
    const history = buildFrontierHistory(rows, OPTIONS);
    const pooled = pooledFrontier(seriesFrontiersAt(history, 1), true);
    expect(pooled.map((v) => v.key)).toEqual(['b200_trt', 'b200_trt']);
  });
});

describe('vendor grouping', () => {
  const rows = [
    row('h200', '2026-03-01', 20, 400),
    row('b200', '2026-03-01', 60, 300),
    row('mi355x', '2026-03-01', 20, 600, { framework: 'sglang' }),
  ];

  it('pools every chip of a vendor into one series', () => {
    const history = buildFrontierHistory(rows, { ...OPTIONS, groupBy: 'vendor' });
    expect(history.series.map((s) => [s.key, s.vendor])).toEqual([
      ['AMD', 'AMD'],
      ['NVIDIA', 'NVIDIA'],
    ]);
    expect(
      seriesFrontiersAt(history, 0)
        .get('NVIDIA')!
        .map((v) => v.y),
    ).toEqual([400, 300]);
  });

  it('ranks vendors at each bucket with the leader over runner-up ratio', () => {
    const history = buildFrontierHistory(rows, { ...OPTIONS, groupBy: 'vendor' });
    const [slow, fast] = leadMargins(history, 0, ['NVIDIA', 'AMD'], [20, 60]);
    expect(slow).toEqual({ x: 20, leader: 'AMD', runnerUp: 'NVIDIA', ratio: 1.5 });
    expect(fast).toEqual({ x: 60, leader: 'NVIDIA', runnerUp: null, ratio: null });
  });
});

describe('frontierArea', () => {
  it('integrates the dominance step function from zero to the fastest vertex', () => {
    expect(frontierArea([vertex(20, 900), vertex(60, 300)], true)).toBe(20 * 900 + 40 * 300);
  });

  it('integrates the reciprocal for lower-is-better metrics', () => {
    expect(frontierArea([vertex(10, 2), vertex(30, 4)], false)).toBe(10 / 2 + 20 / 4);
  });

  it('tracks each series over every snapshot date', () => {
    const history = buildFrontierHistory(
      [row('h200', '2026-03-01', 20, 400), row('b200', '2026-03-05', 20, 900)],
      OPTIONS,
    );
    expect(frontierAreas(history).get('b200_trt')).toEqual([0, 20 * 900]);
    expect(frontierAreas(history).get('h200_trt')).toEqual([20 * 400, 20 * 400]);
  });
});

describe('comparisonBuckets', () => {
  it('samples the ownership levels evenly, keeping both ends', () => {
    const history = buildFrontierHistory(
      [row('h200', '2026-03-01', 10, 400), row('h200', '2026-03-01', 100, 100)],
      OPTIONS,
    );
    const buckets = comparisonBuckets(history, 5);
    expect(buckets).toHaveLength(5);
    expect(buckets[0]).toBe(history.levels[0]);
    expect(buckets.at(-1)).toBe(history.levels.at(-1));
  });
});

describe('sweep cleaning', () => {
  const fullSweep = (date: string, scale = 1) =>
    [10, 20, 30, 40, 50].map((x) => row('h200', date, x, (1000 - x * 10) * scale, { conc: x }));
  const frontierOn = (rows: BenchmarkRow[], date: string) => {
    const history = buildFrontierHistory(rows, OPTIONS);
    return seriesFrontiersAt(history, history.dates.indexOf(date)).get('h200_trt')!;
  };

  it('keeps the last full sweep when a nightly stops early', () => {
    const rows = [...fullSweep('2026-03-01'), row('h200', '2026-03-12', 10, 100)];
    expect(frontierOn(rows, '2026-03-12').map((v) => v.measured)).toEqual(
      Array.from({ length: 5 }, () => '2026-03-01'),
    );
  });

  it('accepts a deliberately narrower sweep once it repeats', () => {
    const narrow = (date: string) => [row('h200', date, 10, 500), row('h200', date, 20, 400)];
    const rows = [
      ...fullSweep('2026-03-01'),
      ...narrow('2026-03-10'),
      ...narrow('2026-03-20'),
      ...narrow('2026-03-30'),
    ];
    expect(frontierOn(rows, '2026-03-30').map((v) => v.y)).toEqual([500, 400]);
  });

  it('uses the best full sweep of the past week, so a bad night does not dent the frontier', () => {
    const rows = [...fullSweep('2026-03-01'), ...fullSweep('2026-03-03', 0.5)];
    expect(frontierOn(rows, '2026-03-03')[0].y).toBe(900);
    const later = [...rows, ...fullSweep('2026-03-09', 0.5)];
    expect(frontierOn(later, '2026-03-09')[0].y).toBe(450);
  });
});

describe('frontierValueAt', () => {
  const frontier = [vertex(20, 900), vertex(60, 300), vertex(100, 100)];

  it('reads the drawn monotone curve between vertices', () => {
    const mid = frontierValueAt(frontier, 40)!;
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(900);
    expect(frontierValueAt(frontier, 60)).toBe(300);
  });

  it('holds the slowest value below the curve and stops past the fastest vertex', () => {
    expect(frontierValueAt(frontier, 5)).toBe(900);
    expect(frontierValueAt(frontier, 101)).toBeNull();
  });
});

const sweep = (hardware: string, date: string, scale: number, image: string, extra = {}) =>
  [10, 20, 30].map((x) =>
    row(hardware, date, x, (1000 - x * 10) * scale, { conc: x, image, ...extra }),
  );

describe('frontierChapters', () => {
  it('explains a pooled step by the series and image that moved it', () => {
    const rows = [
      ...sweep('h200', '2026-03-01', 1, 'trt:1.0'),
      ...sweep('h200', '2026-03-20', 1.5, 'trt:1.1'),
    ];
    const history = buildFrontierHistory(rows, OPTIONS);
    const [chapter] = frontierChapters(history, ['h200_trt'], true);
    expect(chapter).toMatchObject({
      date: '2026-03-20',
      track: null,
      driver: 'h200_trt',
      cause: 'software-update',
      configs: ['h200_trt'],
      image: { from: 'trt:1.0', to: 'trt:1.1' },
    });
    expect(chapter.change).toBeCloseTo(1.5);
    expect(chapter.peak?.ratio).toBeCloseTo(1.5);
  });

  it('ignores steps under the threshold and marks a new series on its own track', () => {
    const rows = [
      ...sweep('h200', '2026-03-01', 1, 'trt:1.0'),
      ...sweep('h200', '2026-03-20', 1.05, 'trt:1.0'),
      ...sweep('b200', '2026-03-20', 2, 'trt:2.0'),
    ];
    const history = buildFrontierHistory(rows, OPTIONS);
    const each = frontierChapters(history, ['h200_trt', 'b200_trt'], false);
    expect(each).toEqual([
      expect.objectContaining({ track: 'b200_trt', cause: 'new-series', change: null }),
    ]);
    const [pooled] = frontierChapters(history, ['h200_trt', 'b200_trt'], true);
    expect(pooled).toMatchObject({ driver: 'b200_trt', cause: 'new-series' });
  });

  it('names the configuration that fell off a frontier when it regresses', () => {
    const rows = [
      ...sweep('h200', '2026-03-01', 1, 'trt:1.0'),
      ...sweep('h200', '2026-03-20', 0.5, 'trt:1.0'),
    ];
    const history = buildFrontierHistory(rows, OPTIONS);
    const [chapter] = frontierChapters(history, ['h200_trt'], false);
    expect(chapter).toMatchObject({ cause: 'regression', configs: ['h200_trt'], image: null });
    expect(chapter.change).toBeCloseTo(0.5);
  });

  it('names the serving image a regressed configuration moved to', () => {
    const rows = [
      ...sweep('h200', '2026-03-01', 1, 'trt:1.0'),
      ...sweep('h200', '2026-03-20', 0.5, 'trt:2.0-dev'),
    ];
    const history = buildFrontierHistory(rows, OPTIONS);
    const [chapter] = frontierChapters(history, ['h200_trt'], false);
    expect(chapter).toMatchObject({
      cause: 'regression',
      configs: ['h200_trt'],
      image: { from: 'trt:1.0', to: 'trt:2.0-dev' },
    });
  });
});

describe('frontierRegressions', () => {
  const rows = [
    ...sweep('h200', '2026-03-01', 1, 'trt:1.0'),
    ...sweep('h200', '2026-03-10', 1.2, 'trt:1.1'),
    ...sweep('h200', '2026-03-20', 0.9, 'trt:2.0-dev'),
    ...sweep('b200', '2026-03-01', 2, 'trt:1.0'),
    ...sweep('b200', '2026-03-20', 1.9, 'trt:1.0'),
  ];
  const history = buildFrontierHistory(rows, OPTIONS);
  const last = history.dates.length - 1;

  it('flags a frontier well below its best, against its best date and image', () => {
    const [regression] = frontierRegressions(history, last, ['h200_trt', 'b200_trt']);
    expect(regression).toMatchObject({
      key: 'h200_trt',
      bestDate: '2026-03-10',
      config: 'h200_trt',
      image: { from: 'trt:1.1', to: 'trt:2.0-dev' },
    });
    expect(regression.change).toBeCloseTo(0.75);
    expect(regression.peak?.ratio).toBeCloseTo(0.75);
  });

  it('ignores drops under the threshold and dates before the drop', () => {
    expect(frontierRegressions(history, last, ['b200_trt'])).toEqual([]);
    expect(frontierRegressions(history, history.dates.indexOf('2026-03-10'), ['h200_trt'])).toEqual(
      [],
    );
  });

  it('treats a lower value as better for a lower-is-better metric', () => {
    const costHistory = buildFrontierHistory(rows, { ...OPTIONS, higherIsBetter: false });
    expect(frontierRegressions(costHistory, last, ['h200_trt'])).toEqual([]);
  });
});

describe('historyFromFirstData', () => {
  const rows = [
    row('h200', '2026-03-01', 20, 400),
    row('b200', '2026-03-05', 20, 900),
    row('b200', '2026-03-09', 20, 950),
  ];

  it('starts the timeline at the first date the chosen series has data', () => {
    const history = buildFrontierHistory(rows, OPTIONS);
    const trimmed = historyFromFirstData(history, ['b200_trt']);
    expect(trimmed.dates).toEqual(['2026-03-05', '2026-03-09']);
    expect(trimmed.ownership).toHaveLength(2);
    expect(trimmed.overtakes.every((o) => trimmed.dates[o.dateIndex] === o.date)).toBe(true);
    expect(seriesFrontiersAt(trimmed, 0).get('b200_trt')![0].y).toBe(900);
  });

  it('keeps the whole timeline when a chosen series has data from the start', () => {
    const history = buildFrontierHistory(rows, OPTIONS);
    expect(historyFromFirstData(history, ['h200_trt', 'b200_trt'])).toBe(history);
  });
});

describe('vendorsAtOtherPrecisions', () => {
  it('lists vendors that only have data at unselected precisions', () => {
    const rows = [
      row('h200', '2026-03-01', 20, 400),
      row('mi355x', '2026-03-01', 20, 600, { framework: 'sglang', precision: 'fp4' }),
      row('b200', '2026-03-01', 20, 900, { precision: 'fp4' }),
    ];
    expect(vendorsAtOtherPrecisions(rows, OPTIONS)).toEqual([
      { vendor: 'AMD', precisions: ['fp4'], hardware: ['mi355x'] },
    ]);
  });
});

describe('software gains', () => {
  const rows = [
    row('b200', '2026-03-01', 20, 900),
    ...sweep('h200', '2026-03-05', 1, 'trt:1.0'),
    ...sweep('h200', '2026-03-20', 2, 'trt:1.0'),
  ];

  it('indexes each chip to its own first snapshot', () => {
    const history = buildFrontierHistory(rows, { ...OPTIONS, groupBy: 'gpu' });
    const gains = softwareGains(history).get('h200')!;
    expect(gains[0]).toBeNull();
    expect(gains[1]).toBe(1);
    expect(gains.at(-1)).toBeCloseTo(2);
  });

  it('compares the current curve with the first one at each interactivity', () => {
    const history = buildFrontierHistory(rows, { ...OPTIONS, groupBy: 'gpu' });
    const last = history.dates.length - 1;
    const [slow, mid, beyond] = softwareGainByInteractivity(history, 'h200', last, [10, 20, 40]);
    expect(slow.ratio).toBeCloseTo(2);
    expect(mid.ratio).toBeCloseTo(2);
    expect(beyond.ratio).toBeNull();
  });

  it('averages the gain across reached interactivity levels as a geometric mean', () => {
    const history = buildFrontierHistory(rows, { ...OPTIONS, groupBy: 'gpu' });
    const last = history.dates.length - 1;
    const gains = softwareGainByInteractivity(history, 'h200', last, [10, 20, 40]);
    expect(averageSoftwareGain(gains)).toBeCloseTo(2);
    expect(
      averageSoftwareGain([
        { x: 10, ratio: 2 },
        { x: 20, ratio: 0.5 },
        { x: 40, ratio: null },
      ]),
    ).toBeCloseTo(1);
    expect(
      averageSoftwareGain([
        { x: 10, ratio: 8 },
        { x: 20, ratio: 2 },
      ]),
    ).toBeCloseTo(4);
    expect(averageSoftwareGain([{ x: 10, ratio: null }])).toBeNull();
    expect(averageSoftwareGain([])).toBeNull();
  });

  it('keeps the bar scale large enough for a peak before the final snapshot', () => {
    const history = buildFrontierHistory(
      [
        ...sweep('h200', '2026-03-01', 1, 'trt:1.0'),
        ...sweep('h200', '2026-03-20', 4, 'trt:1.1'),
        ...sweep('h200', '2026-04-10', 2, 'trt:1.2'),
      ],
      { ...OPTIONS, groupBy: 'gpu' },
    );
    expect(softwareGainByInteractivity(history, 'h200', 2, [20])[0].ratio).toBeCloseTo(2);
    expect(softwareGainBarMaxLog(history, ['h200'], [20])).toBeCloseTo(2);
  });
});
