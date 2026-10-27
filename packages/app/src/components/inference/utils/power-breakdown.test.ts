import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import type { InferenceData } from '../types';
import {
  bandAtWatts,
  bandPartsAt,
  bandTarget,
  bandWattsPerGpu,
  breakdownItWattsPerGpu,
  breakdownSeriesAtBoundary,
  buildPowerBreakdowns,
  buildPowerBreakdownsWithOverlays,
  compareBreakdownsAt,
  cssHatchAngle,
  defaultComparisonInteractivity,
  HATCH_ANGLE,
  isHatchedBand,
  MEASURED_POWER_BANDS,
  nearestBreakdownPoint,
  partTarget,
  POWER_BAND_CATEGORIES,
  POWER_BAND_OPACITY,
  POWER_BANDS,
  POWER_BREAKDOWN_STACK_ORDER,
  POWER_PART_BEHAVIOUR,
  powerBandFillOpacity,
  powerBandOf,
  powerBandsOf,
  powerBreakdownInteractivity,
  powerBreakdownPointLabels,
  powerLayerEmphasis,
  powerLayerFill,
  powerPartEmphasis,
  powerPartRows,
  sameLayerTarget,
  sparklineGeometry,
  stackedBandsAt,
  stackPowerBands,
  type PowerBreakdownPoint,
  type PowerBreakdownSeries,
} from './power-breakdown';
import { estimateChassisPower, SYSTEM_POWER_CATEGORIES } from '@/lib/power/system-power-model';

const metric = (y: number) => ({ y, roof: false });

function row(gpuWatts: number, overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
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
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-08',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: gpuWatts,
      avg_total_gpu_power_w: gpuWatts * 8,
      median_intvty: 100,
    },
    ...overrides,
  } as BenchmarkRow;
}

let nextId = 1;
function point(
  gpuWatts: number,
  overrides: Partial<InferenceData> = {},
  rowOverrides: Partial<BenchmarkRow> = {},
): InferenceData {
  const modeledSystemPower = modelSystemPower(row(gpuWatts, rowOverrides));
  return {
    id: nextId++,
    x: 100,
    y: gpuWatts,
    median_intvty: 100,
    hwKey: 'b200_sglang',
    date: '2026-09-08',
    tp: 8,
    physicalChips: 8,
    precision: 'fp8',
    conc: 1,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    model: 'Qwen-3.5-397B-A17B',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    decode_tp: 8,
    output_tput_per_gpu: 50,
    tpPerGpu: metric(50),
    tpPerMw: metric(50),
    costh: metric(1),
    costr: metric(1),
    costhi: metric(1),
    costri: metric(1),
    measuredAvgPower: metric(gpuWatts),
    utilityModeledWatts: metric(1),
    modeledSystemPower,
    ...overrides,
  };
}

describe('buildPowerBreakdowns', () => {
  it('splits each point into parts that sum to All in Measured W/GPU', () => {
    const [series] = buildPowerBreakdowns([point(600, { conc: 64 }), point(250, { conc: 1 })]);
    expect(series.label).toContain('B200');
    expect(series.points.map((entry) => entry.concurrency)).toEqual([1, 64]);
    for (const entry of series.points) {
      const sum = Object.values(entry.wattsPerGpu).reduce((total, watts) => total + watts, 0);
      expect(sum).toBeCloseTo(entry.totalWattsPerGpu, 9);
      expect(entry.wattsPerGpu.gpu).toBeCloseTo(entry.point.measuredAvgPower!.y, 9);
      expect(entry.wattsPerGpu.facility).toBeGreaterThan(0);
    }
    // Measured parts sit at the bottom; categories with no watts are left out.
    expect(series.categories[0]).toBe('gpu');
    expect(series.categories).not.toContain('measuredCpu');
    expect(series.categories).toEqual(
      POWER_BREAKDOWN_STACK_ORDER.filter((key) => series.categories.includes(key)),
    );
    expect(series.tdpWattsPerGpu).toBeGreaterThan(0);
    expect(series.allInProvisionedWattsPerGpu).toBeGreaterThan(series.points[1].totalWattsPerGpu);
  });

  it('groups by hardware and precision and drops points without a supported estimate', () => {
    const series = buildPowerBreakdowns([
      point(300),
      point(300, { precision: 'fp4' }, { precision: 'fp4' }),
      point(300, { conc: 8, modeledSystemPower: undefined }),
      point(300, { conc: 16 }, { metrics: { median_intvty: 100 } }),
    ]);
    expect(series.map((entry) => entry.key).toSorted()).toEqual([
      'b200_sglang|fp4',
      'b200_sglang|fp8',
    ]);
    expect(series.every((entry) => entry.points.length === 1)).toBe(true);
  });
});

describe('powerBreakdownInteractivity', () => {
  it('places points on the chart interactivity axis, ordered by it, and drops points without one', () => {
    const interactivity = powerBreakdownInteractivity('p90_intvty');
    expect(interactivity).toMatchObject({ field: 'p90_intvty', fromChart: true });
    const [series] = buildPowerBreakdowns(
      [
        point(600, { conc: 64, p90_intvty: 20 }),
        point(250, { conc: 1, p90_intvty: 140 }),
        point(400, { conc: 8, p90_intvty: 70 }),
        point(450, { conc: 16 }),
      ],
      'en',
      interactivity,
    );
    expect(series.points.map((entry) => [entry.concurrency, entry.interactivity])).toEqual([
      [64, 20],
      [8, 70],
      [1, 140],
    ]);
  });

  it('reads trace-derived AgentX axes from point.x and falls back to median on latency charts', () => {
    const derived = powerBreakdownInteractivity('p90_e2e_norm_intvty');
    expect(derived.fromChart).toBe(true);
    expect(derived.value(point(300, { x: 31.5 }))).toBe(31.5);
    const latency = powerBreakdownInteractivity('median_e2el');
    expect(latency).toMatchObject({ field: 'median_intvty', fromChart: false });
    expect(latency.value(point(300, { x: 9, median_intvty: 42 }))).toBe(42);
  });
});

describe('powerBreakdownPointLabels', () => {
  it('numbers repeated concurrencies so every bar keeps a distinct tick', () => {
    const [series] = buildPowerBreakdowns([
      point(250, { conc: 1, median_intvty: 120 }),
      point(400, { conc: 16, date: '2026-09-01', median_intvty: 40 }),
      point(420, { conc: 16, date: '2026-09-08', median_intvty: 38 }),
    ]);
    expect(powerBreakdownPointLabels(series.points)).toEqual(['c16 · 1', 'c16 · 2', 'c1']);
  });
});

describe('breakdownSeriesAtBoundary', () => {
  it('counts IT only by dropping the facility part from categories and totals', () => {
    const [series] = buildPowerBreakdowns([point(500)]);
    const entry = series.points[0];
    expect(series.categories).toContain('facility');
    expect(entry.wattsPerGpu.facility).toBeGreaterThan(0);
    const itSeries = breakdownSeriesAtBoundary(series, false);
    expect(itSeries.categories).not.toContain('facility');
    expect(itSeries.categories).toEqual(series.categories.filter((key) => key !== 'facility'));
    expect(itSeries.points[0].wattsPerGpu.facility).toBe(0);
    expect(itSeries.points[0].totalWattsPerGpu).toBeCloseTo(
      entry.totalWattsPerGpu - entry.wattsPerGpu.facility,
      9,
    );
    expect(itSeries.points[0].totalWattsPerGpu).toBeCloseTo(breakdownItWattsPerGpu(entry), 9);
    // The IT stack still sums to its total exactly, without the facility layer.
    const bands = powerBandsOf(itSeries.categories);
    expect(bands).toEqual(['gpu', 'server', 'fansPsu', 'network']);
    const segments = stackPowerBands(itSeries.points[0], bands);
    expect(segments.at(-1)!.y1).toBeCloseTo(itSeries.points[0].totalWattsPerGpu, 9);
    // Facility × PUE identity: IT × PUE = facility total.
    expect(itSeries.points[0].totalWattsPerGpu * entry.pue).toBeCloseTo(entry.totalWattsPerGpu, 6);
    // Including the facility returns the series untouched.
    expect(breakdownSeriesAtBoundary(series, true)).toBe(series);
  });
});

function fakeSeries(label: string, points: [interactivity: number, total: number][]) {
  return {
    key: label,
    hwKey: label,
    precision: 'fp8',
    label,
    categories: ['gpu'],
    tdpWattsPerGpu: null,
    allInProvisionedWattsPerGpu: null,
    points: points.map(
      ([interactivity, total]) =>
        ({ interactivity, totalWattsPerGpu: total }) as unknown as PowerBreakdownPoint,
    ),
  } as PowerBreakdownSeries;
}

describe('cross-chip comparison', () => {
  const a = fakeSeries('A', [
    [10, 1500],
    [40, 1200],
    [160, 900],
  ]);
  const b = fakeSeries('B', [
    [20, 1300],
    [80, 1000],
  ]);

  it('defaults to the geometric middle of the range every chip covers', () => {
    expect(defaultComparisonInteractivity([a, b])).toBeCloseTo(40, 9);
    expect(defaultComparisonInteractivity([])).toBeNull();
  });

  it('falls back to the full range when chips do not overlap', () => {
    const low = fakeSeries('L', [
      [5, 1],
      [10, 1],
    ]);
    const high = fakeSeries('H', [
      [100, 1],
      [200, 1],
    ]);
    expect(defaultComparisonInteractivity([low, high])).toBeCloseTo(Math.sqrt(5 * 200), 9);
  });

  it("picks each chip's nearest point on a log scale and sorts by total", () => {
    const { rows, outOfRange } = compareBreakdownsAt([a, b], 56);
    expect(outOfRange).toEqual([]);
    expect(rows.map((r) => [r.series.label, r.entry.interactivity])).toEqual([
      ['B', 80],
      ['A', 40],
    ]);
  });

  it('leaves out chips with no point near the target', () => {
    const { rows, outOfRange } = compareBreakdownsAt([a, b], 160);
    expect(rows.map((r) => r.series.label)).toEqual(['A']);
    expect(outOfRange.map((s) => s.label)).toEqual(['B']);
    expect(compareBreakdownsAt([a], 0).outOfRange).toHaveLength(1);
  });
});

describe('six-layer overview', () => {
  it('folds the twelve parts into six layers, in stack order', () => {
    expect(POWER_BANDS).toEqual(['gpu', 'measuredCpu', 'server', 'fansPsu', 'network', 'facility']);
    expect(POWER_BANDS.flatMap((band) => POWER_BAND_CATEGORIES[band])).toEqual([
      ...SYSTEM_POWER_CATEGORIES,
    ]);
    expect(powerBandOf('gpu')).toBe('gpu');
    expect(powerBandOf('measuredCpu')).toBe('measuredCpu');
    expect(powerBandOf('cpu')).toBe('server');
    expect(powerBandOf('nic')).toBe('server');
    expect(powerBandOf('nvswitch')).toBe('server');
    expect(powerBandOf('other')).toBe('server');
    expect(powerBandOf('fans')).toBe('fansPsu');
    expect(powerBandOf('psuLoss')).toBe('fansPsu');
    expect(powerBandOf('network')).toBe('network');
    expect(powerBandOf('facility')).toBe('facility');
    expect([...MEASURED_POWER_BANDS]).toEqual(['gpu', 'measuredCpu']);
    // The layers a series draws are those with a non-empty part: HGX has no Grace layer,
    // a single-node run no network share, an IT-only stack no facility.
    expect(powerBandsOf(['gpu', 'cpu', 'fans', 'facility'])).toEqual([
      'gpu',
      'server',
      'fansPsu',
      'facility',
    ]);
    expect(powerBandsOf(['gpu', 'measuredCpu', 'nic', 'network'])).toEqual([
      'gpu',
      'measuredCpu',
      'server',
      'network',
    ]);
    expect(powerBandsOf(['gpu'])).toEqual(['gpu']);
  });

  it('stacks the layers so they sum to the total and each layer to its parts', () => {
    const [series] = buildPowerBreakdowns([point(500)]);
    const entry = series.points[0];
    const bands = powerBandsOf(series.categories);
    expect(bands).toEqual(['gpu', 'server', 'fansPsu', 'network', 'facility']);
    const stack = stackPowerBands(entry, bands);
    expect(stack.map((band) => band.key)).toEqual(bands);
    expect(stack[0].y0).toBe(0);
    for (let index = 1; index < stack.length; index++) {
      expect(stack[index].y0).toBe(stack[index - 1].y1);
    }
    expect(stack.at(-1)!.y1).toBeCloseTo(entry.totalWattsPerGpu, 9);
    expect(bandWattsPerGpu(entry, 'gpu')).toBeCloseTo(500, 9);
    expect(bandWattsPerGpu(entry, 'measuredCpu')).toBe(0);
    expect(
      bandWattsPerGpu(entry, 'server') +
        bandWattsPerGpu(entry, 'fansPsu') +
        bandWattsPerGpu(entry, 'network'),
    ).toBeCloseTo(breakdownItWattsPerGpu(entry) - entry.wattsPerGpu.gpu, 9);
    expect(bandWattsPerGpu(entry, 'facility')).toBeCloseTo(entry.wattsPerGpu.facility, 9);
    const parts = bandPartsAt(entry, 'server');
    expect(parts.map((part) => part.category)).toEqual(
      series.categories.filter((key) => powerBandOf(key) === 'server'),
    );
    expect(parts.map((part) => part.category)).toEqual([
      'cpu',
      'memory',
      'nic',
      'nvswitch',
      'storage',
      'other',
    ]);
    expect(parts.reduce((sum, part) => sum + part.watts, 0)).toBeCloseTo(
      bandWattsPerGpu(entry, 'server'),
      9,
    );
    expect(bandPartsAt(entry, 'fansPsu').map((part) => part.category)).toEqual(['fans', 'psuLoss']);
    expect(bandPartsAt(entry, 'gpu')).toEqual([{ category: 'gpu', watts: 500 }]);
    expect(bandPartsAt(entry, 'measuredCpu')).toEqual([]);
  });

  it('steps opacity down from the measured base and hatches each modeled layer at its own angle', () => {
    expect(POWER_BANDS.map((band) => POWER_BAND_OPACITY[band])).toEqual([
      0.9, 0.72, 0.5, 0.34, 0.2, 0,
    ]);
    expect(POWER_BANDS.map(isHatchedBand)).toEqual([false, false, true, true, true, true]);
    // The facility's stripes sit on a tint; every other layer's tint is its own step.
    expect(powerBandFillOpacity('facility')).toBe(0.18);
    expect(powerBandFillOpacity('server')).toBe(0.5);
    expect(powerBandFillOpacity('gpu')).toBe(0.9);
    expect(POWER_BANDS.map((band) => HATCH_ANGLE[band])).toEqual([45, 45, 45, 135, 0, 90]);
    expect(cssHatchAngle('server')).toBe(135);
    expect(cssHatchAngle('fansPsu')).toBe(225);
    expect(cssHatchAngle('network')).toBe(90);
    expect(cssHatchAngle('facility')).toBe(180);
    expect(powerLayerFill('var(--chip)', 0.5)).toBe(
      'color-mix(in oklab, var(--chip) 50%, transparent)',
    );
  });

  it('tells highlighted, faded and plain layers apart, by layer or by part', () => {
    expect(powerLayerEmphasis('server', null)).toBe('plain');
    expect(powerLayerEmphasis('server', { ...bandTarget('server'), pinned: false })).toBe(
      'highlighted',
    );
    expect(powerLayerEmphasis('gpu', { ...bandTarget('server'), pinned: true })).toBe('faded');
    // A part target raises its layer.
    expect(partTarget('nic')).toEqual({ band: 'server', category: 'nic' });
    expect(partTarget('fans')).toEqual({ band: 'fansPsu', category: 'fans' });
    expect(powerLayerEmphasis('server', { ...partTarget('nic'), pinned: false })).toBe(
      'highlighted',
    );
    expect(powerLayerEmphasis('fansPsu', { ...partTarget('nic'), pinned: false })).toBe('faded');
    expect(powerLayerEmphasis('facility', { ...partTarget('nic'), pinned: false })).toBe('faded');
    expect(sameLayerTarget(bandTarget('server'), partTarget('nic'))).toBe(false);
    expect(sameLayerTarget(partTarget('nic'), { band: 'server', category: 'nic' })).toBe(true);
    expect(sameLayerTarget(null, null)).toBe(true);
    // List rows: the hovered part, siblings of a layer hovered in the plot, or plain.
    expect(powerPartEmphasis('nic', null)).toBe('plain');
    expect(powerPartEmphasis('nic', { ...partTarget('nic'), pinned: false })).toBe('highlighted');
    expect(powerPartEmphasis('cpu', { ...partTarget('nic'), pinned: false })).toBe('plain');
    expect(powerPartEmphasis('cpu', { ...bandTarget('server'), pinned: false })).toBe('band');
    expect(powerPartEmphasis('fans', { ...bandTarget('server'), pinned: false })).toBe('plain');
    expect(powerPartEmphasis('gpu', { ...bandTarget('server'), pinned: false })).toBe('plain');
    expect(powerPartEmphasis('gpu', { ...bandTarget('gpu'), pinned: false })).toBe('band');
  });

  it('knows which parts are measured, move with load or stay fixed, as the model does', () => {
    const state = { workload: 'agentic', scaleOut: true } as const;
    const low = estimateChassisPower('h200', 8 * 226, state)!.breakdown;
    const high = estimateChassisPower('h200', 8 * 474, state)!.breakdown;
    for (const key of SYSTEM_POWER_CATEGORIES) {
      if (key === 'measuredCpu') continue;
      const behaviour = POWER_PART_BEHAVIOUR[key];
      if (behaviour === 'fixed') expect(high[key]).toBeCloseTo(low[key], 6);
      else expect(high[key]).toBeGreaterThan(low[key]);
    }
    expect(POWER_PART_BEHAVIOUR.gpu).toBe('measured');
    expect(POWER_PART_BEHAVIOUR.measuredCpu).toBe('measured');
    expect(POWER_PART_BEHAVIOUR.fans).toBe('load');
    expect(POWER_PART_BEHAVIOUR.psuLoss).toBe('load');
    expect(POWER_PART_BEHAVIOUR.facility).toBe('load');
  });
});

describe('powerPartRows', () => {
  const [series] = buildPowerBreakdowns([
    point(600, { conc: 64, median_intvty: 20 }),
    point(400, { conc: 8, median_intvty: 70 }),
    point(250, { conc: 1, median_intvty: 140 }),
  ]);
  const selected = series.points[1];
  const rows = powerPartRows(series, selected);

  it('lists every non-empty part heaviest first, the facility overhead last', () => {
    expect(rows[0].category).toBe('gpu');
    expect(rows.at(-1)!.category).toBe('facility');
    expect(rows.map((part) => part.category)).not.toContain('measuredCpu');
    expect(rows.map((part) => part.category).toSorted()).toEqual([...series.categories].toSorted());
    const itRows = rows.slice(0, -1);
    for (let index = 1; index < itRows.length; index += 1) {
      expect(itRows[index].watts).toBeLessThanOrEqual(itRows[index - 1].watts);
    }
    expect(rows[0]).toMatchObject({ band: 'gpu', behaviour: 'measured', selectedIndex: 1 });
    expect(rows.find((part) => part.category === 'fans')).toMatchObject({
      band: 'fansPsu',
      behaviour: 'load',
    });
    expect(rows.find((part) => part.category === 'nic')).toMatchObject({
      band: 'server',
      behaviour: 'fixed',
    });
  });

  it('shares of IT sum to 1 and the facility row is its share of the facility total', () => {
    const itRows = rows.slice(0, -1);
    expect(itRows.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1, 9);
    expect(rows[0].share).toBeCloseTo(400 / breakdownItWattsPerGpu(selected), 9);
    expect(rows.at(-1)!.share).toBeCloseTo(
      selected.wattsPerGpu.facility / selected.totalWattsPerGpu,
      9,
    );
  });

  it('gives each row its own history and scale across the series', () => {
    expect(rows[0].history).toEqual([600, 400, 250]);
    expect(rows[0].max).toBe(600);
    const fans = rows.find((part) => part.category === 'fans')!;
    expect(fans.history).toHaveLength(3);
    expect(fans.max).toBe(Math.max(...fans.history));
    expect(fans.max).toBeLessThan(rows[0].max);
  });

  it('omits the facility row at the IT boundary', () => {
    const itSeries = breakdownSeriesAtBoundary(series, false);
    const itRows = powerPartRows(itSeries, itSeries.points[1]);
    expect(itRows.map((part) => part.category)).not.toContain('facility');
    expect(itRows.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1, 9);
  });
});

describe('sparklineGeometry', () => {
  it('scales each sparkline to its own max with the dot on the selected point', () => {
    const spark = sparklineGeometry([10, 40, 20], 1, 72, 18);
    // 18 px high, 1 px inset: 10 of 40 sits at 17 − 4, 40 at the top, 20 at 17 − 8.
    expect(spark.line).toBe('M1,13L36,1L71,9');
    expect(spark.area).toBe('M1,13L36,1L71,9L71,17L1,17Z');
    expect(spark.dot).toEqual({ x: 36, y: 1 });
    // A different row with a smaller max still reaches the top of its own box.
    expect(sparklineGeometry([2, 4], 0, 72, 18).line).toBe('M1,9L71,1');
  });

  it('draws a single value as a flat mid-line and clamps the selected index', () => {
    expect(sparklineGeometry([5], 0, 72, 18).line).toBe('M36,1');
    expect(sparklineGeometry([0, 0], 5, 72, 18).dot).toEqual({ x: 71, y: 17 });
    expect(sparklineGeometry([], 0, 72, 18).line).toBe('M36,17');
  });
});

describe('nearestBreakdownPoint', () => {
  const series = fakeSeries('A', [
    [10, 1500],
    [40, 1200],
    [160, 900],
  ]);

  it('returns the point nearest the target on a log scale, however far', () => {
    expect(nearestBreakdownPoint(series, 56)?.interactivity).toBe(40);
    expect(nearestBreakdownPoint(series, 5000)?.interactivity).toBe(160);
    expect(nearestBreakdownPoint(series, 0)?.interactivity).toBe(10);
    expect(nearestBreakdownPoint(fakeSeries('E', []), 10)).toBeNull();
  });
});

describe('stackedBandsAt', () => {
  const bands = ['gpu', 'server', 'facility'] as const;
  const entry = (gpu: number, cpu: number, facility: number): PowerBreakdownPoint => ({
    point: point(gpu),
    concurrency: 1,
    interactivity: 1,
    configKey: '',
    configLabel: '',
    wattsPerGpu: {
      gpu,
      measuredCpu: 0,
      cpu,
      memory: 0,
      nic: 0,
      nvswitch: 0,
      storage: 0,
      other: 0,
      fans: 0,
      psuLoss: 0,
      network: 0,
      facility,
    },
    totalWattsPerGpu: gpu + cpu + facility,
    pue: 1.2,
    cpuBasis: null,
    chassisBasis: 'full',
  });
  const points = [
    { x: 0, entry: entry(100, 20, 30) },
    { x: 100, entry: entry(200, 40, 30) },
  ];

  it('interpolates every band linearly between the neighbouring points', () => {
    const stack = stackedBandsAt(points, 50, bands);
    expect(stack.map((band) => [band.key, band.y0, band.y1, band.watts])).toEqual([
      ['gpu', 0, 150, 150],
      ['server', 150, 180, 30],
      ['facility', 180, 210, 30],
    ]);
  });

  it('clamps to the ends outside the points', () => {
    expect(stackedBandsAt(points, -10, bands)[0].watts).toBe(100);
    expect(stackedBandsAt(points, 500, bands)[0].watts).toBe(200);
  });

  it('names the band under a watts value and nothing above the stack', () => {
    const stack = stackedBandsAt(points, 50, bands);
    expect(bandAtWatts(stack, 160)?.key).toBe('server');
    expect(bandAtWatts(stack, 0)?.key).toBe('gpu');
    expect(bandAtWatts(stack, 300)).toBeNull();
    expect(bandAtWatts(stack, -1)).toBeNull();
  });
});

describe('buildPowerBreakdownsWithOverlays', () => {
  const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/999/attempts/1';
  const official = [point(500), point(400, { conc: 4, x: 200, median_intvty: 200 }, { conc: 4 })];
  const overlay = [
    point(520, { run_url: runUrl }),
    point(410, { run_url: runUrl, conc: 4, x: 200, median_intvty: 200 }, { conc: 4 }),
  ];
  const runInfos = [
    { id: 1, branch: 'main', url: 'u1' },
    { id: 2, branch: 'powerx', url: 'u2' },
    { id: 999, branch: 'single-hue', url: runUrl },
  ];

  it('keeps an unofficial run as its own series in the run colour slot, after the official line', () => {
    const series = buildPowerBreakdownsWithOverlays([...official, ...overlay], {
      points: overlay,
      runIndexByUrl: { [runUrl]: 2 },
      runInfos,
    });
    expect(series.map((entry) => entry.key)).toEqual(['b200_sglang|fp8', 'b200_sglang|fp8|run2']);
    expect(series[0].overlayRunIndex).toBeUndefined();
    expect(series[0].points).toHaveLength(2);
    expect(series[1].overlayRunIndex).toBe(2);
    expect(series[1].points.map((entry) => entry.wattsPerGpu.gpu)).toEqual([520, 410]);
    expect(series[1].label).toContain(series[0].label);
    expect(series[1].label).not.toBe(series[0].label);
  });

  it('is the plain breakdown without overlay points', () => {
    expect(buildPowerBreakdownsWithOverlays(official, undefined)).toEqual(
      buildPowerBreakdowns(official),
    );
  });
});
