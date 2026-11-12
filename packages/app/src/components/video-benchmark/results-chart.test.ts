import { describe, expect, it } from 'vitest';
import fixture from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';
import { videoPoints } from './points';
import { DEFAULT_RESULTS_STATE, resultProjection, type ResultsState } from './results';
import type { ResultsEvidence } from './results-evidence';
import { leadCell } from './deployment';
import {
  chartedCells,
  comparesEngines,
  RESULTS_X_METRICS,
  resultsChartSeries,
  resultsClip,
  resultsMetricLabel,
  type ResultsChartSelection,
  type ResultsChartSeries,
} from './results-chart';

const eligible = videoPoints([fixture as unknown as VideoHistoryPage]).find(
  (p) => p.hardwareKey === 'h200' && p.concurrency === 1 && p.scheduled === 20,
)!;

/** One H200 deployment: `gpus` boards, P50 seconds, decoded video-s per hour and kJ per clip. */
const deployment = (
  name: string,
  gpus: number,
  p50: number,
  videoSecondsPerHour: number,
  energyKj: number,
  change: Partial<VideoPoint> = {},
): VideoPoint => ({
  ...eligible,
  id: `${name}:c1`,
  runId: '100',
  participating: gpus,
  allocated: gpus,
  p50,
  p90: p50 + 1,
  videoSecondsPerHour,
  energyKj,
  ...change,
});

// Video-s per $ is videoSecondsPerHour / (gpus × $/GPU-hr): fast 100/h, mid 200/h, slow 150/h.
const fast = deployment('fast', 4, 30, 400, 200);
const mid = deployment('mid', 1, 60, 200, 100);
const slow = deployment('slow', 2, 70, 300, 50);

const cells = (
  points: VideoPoint[],
  state: Partial<ResultsState> = {},
  named: VideoPoint[] = [],
) => {
  const projection = resultProjection(points, { ...DEFAULT_RESULTS_STATE, ...state }, named);
  return [...projection.deploymentCells, ...projection.overlayDeploymentCells];
};
const selection = (change: Partial<ResultsChartSelection> = {}): ResultsChartSelection => ({
  x: 'p50',
  y: 'videoSecondsPerDollar',
  basis: 'participating',
  tier: 'h',
  optimal: false,
  hidden: [],
  lossy: false,
  ...change,
});
const ids = (points: { cell: { point: VideoPoint } }[]) => points.map((p) => p.cell.point.id);
const runtime = (series: ResultsChartSeries[]) =>
  series.map((s) => [s.engine, s.optimizations.join('+'), s.lossy]);
const value = (series: ResultsChartSeries, id: string) =>
  series.points.find((p) => p.cell.point.id === id)?.y;

const layout = (name: string, gpus: number, p50: number, kj: number, tp: number) =>
  deployment(name, gpus, p50, 400, kj, {
    server: { ...eligible.server!, tp, ulysses: gpus / tp },
  });

const run = (name: string, engine: string, p50: number, optimizations: string[]) =>
  deployment(name, 4, p50, 400 - p50, 200, {
    hardwareKey: 'b200',
    results: { engine, optimizations } as ResultsEvidence,
  });

/** A twin needs a recorded layout to match on. */
const laidOutRun = (name: string, engine: string, p50: number, optimizations: string[]) =>
  deployment(name, 4, p50, 400 - p50, 200, {
    hardwareKey: 'b200',
    server: { tp: 2, ulysses: 2, attention: null },
    results: { engine, optimizations } as ResultsEvidence,
  });

const b200Point = (name: string, engine: string, p50: number, change: Partial<VideoPoint> = {}) =>
  deployment(name, 4, p50, 400 - p50, 200, {
    hardwareKey: 'b200',
    results: { engine } as ResultsEvidence,
    ...change,
  });

const b200Deployment = (name: string, engine: string, gpus: number, p50: number, perHour: number) =>
  deployment(name, gpus, p50, perHour, 200, {
    hardwareKey: 'b200',
    results: { engine } as ResultsEvidence,
  });

describe('resultsChartSeries', () => {
  it('selects each frontier with the declared direction of both axes', () => {
    const deployments = cells([fast, mid, slow]);
    const [perDollar] = resultsChartSeries(deployments, selection());
    expect(ids(perDollar.frontier)).toEqual(['fast:c1', 'mid:c1']);
    const [energy] = resultsChartSeries(deployments, selection({ y: 'kjPerClip' }));
    expect(ids(energy.frontier)).toEqual(['fast:c1', 'mid:c1', 'slow:c1']);
    expect(energy.frontier.map((p) => p.y)).toEqual([200, 100, 50]);
    const [p90] = resultsChartSeries(deployments, selection({ x: 'p90' }));
    expect(p90.frontier.map((p) => p.x)).toEqual([31, 61]);
  });

  it('keeps dominated deployments faded unless Optimal Only removes them', () => {
    const deployments = cells([fast, mid, slow]);
    const [all] = resultsChartSeries(deployments, selection());
    expect(ids(all.points).toSorted()).toEqual(['fast:c1', 'mid:c1', 'slow:c1']);
    expect(all.points.find((p) => p.cell.point.id === 'slow:c1')!.optimal).toBe(false);
    expect(all.measured).toBe(3);
    const [optimal] = resultsChartSeries(deployments, selection({ optimal: true }));
    expect(ids(optimal.points)).toEqual(['fast:c1', 'mid:c1']);
    expect(optimal.measured).toBe(3);
  });

  it('plots the selected GPU cost basis and omits a deployment without that basis', () => {
    const reserved = deployment('reserved', 4, 30, 400, 200, { allocated: 8 });
    const unknown = deployment('unknown', 1, 60, 200, 100, { allocated: null });
    const deployments = cells([reserved, unknown]);
    const [participating] = resultsChartSeries(deployments, selection());
    const [allocated] = resultsChartSeries(deployments, selection({ basis: 'allocated' }));
    expect(value(allocated, 'reserved:c1')).toBeCloseTo(value(participating, 'reserved:c1')! / 2);
    expect(value(participating, 'unknown:c1')).toBeGreaterThan(0);
    expect(value(allocated, 'unknown:c1')).toBeUndefined();
  });

  it('divides videos per GPU-hour by the GPU count of the selected basis', () => {
    const b200 = deployment('b200', 4, 30, 400, 200, { hardwareKey: 'b200', allocated: 8 });
    const unknown = deployment('unknown', 1, 60, 200, 100, { allocated: null });
    const deployments = cells([b200, unknown]);
    const videosPerHour = (eligible.valid! * 3600) / eligible.wallSeconds!;
    const plot = (basis: 'participating' | 'allocated') =>
      resultsChartSeries(deployments, selection({ y: 'videosPerGpuHour', basis }));
    const series = (basis: 'participating' | 'allocated', key: string) =>
      plot(basis).find((s) => s.hardwareKey === key)!;
    expect(value(series('participating', 'b200'), 'b200:c1')).toBeCloseTo(videosPerHour / 4);
    expect(value(series('allocated', 'b200'), 'b200:c1')).toBeCloseTo(videosPerHour / 8);
    expect(value(series('participating', 'h200'), 'unknown:c1')).toBeCloseTo(videosPerHour);
    expect(plot('allocated').some((s) => s.hardwareKey === 'h200')).toBe(false);
  });

  it('excludes hidden hardware and keeps a named run as its own series', () => {
    const b200 = deployment('b200', 4, 40, 300, 150, { hardwareKey: 'b200' });
    const named = deployment('named', 2, 20, 50, 400, { runId: '200', approved: false });
    const deployments = cells([fast, mid, b200], { unofficialRun: '200' }, [named]);
    const series = resultsChartSeries(deployments, selection({ optimal: true }));
    expect(series.map((s) => s.key)).toEqual(['b200:na', 'h200:na', 'h200:na-overlay']);
    const [, official, overlay] = series;
    expect(overlay.hardwareKey).toBe('h200');
    expect(ids(overlay.points)).toEqual(['named:c1']);
    expect(ids(official.points)).toEqual(['fast:c1', 'mid:c1']);
    expect(overlay.points[0].key).toBe('200:named:c1');
    const hidden = resultsChartSeries(deployments, selection({ hidden: ['h200'] }));
    expect(hidden.map((s) => s.key)).toEqual(['b200:na']);
  });

  it('plots each GPU’s best engine unless engines are compared, ranking a named run on its own', () => {
    const deployments = cells(
      [b200Point('sglang', 'sglang', 30), b200Point('vllm', 'vllm-omni', 40)],
      { unofficialRun: '200' },
      [b200Point('named', 'vllm-omni', 50, { runId: '200', approved: false })],
    );
    const plotted = (change: Partial<ResultsChartSelection>) =>
      resultsChartSeries(deployments, selection({ optimal: true, ...change }));
    const best = plotted({});
    expect(best.map((s) => [s.engine, s.overlay, ids(s.points)])).toEqual([
      ['sglang', false, ['sglang:c1']],
      ['vllm-omni', true, ['named:c1']],
    ]);
    expect(comparesEngines(best)).toBe(false);
    // Cards and clips stand for a GPU with the engine the chart draws, even when
    // another engine rates more videos per GPU-hour.
    const rated = [
      b200Point('sglang', 'sglang', 30),
      b200Point('vllm', 'vllm-omni', 40, { wallSeconds: 1 }),
    ];
    const charted = chartedCells(
      resultProjection(rated, DEFAULT_RESULTS_STATE),
      DEFAULT_RESULTS_STATE,
    );
    expect(leadCell(rated, 'b200', { tier: 'h' })?.id).toBe('vllm:c1');
    expect(
      leadCell(
        charted.map((c) => c.point),
        'b200',
        { tier: 'h' },
      )?.id,
    ).toBe('sglang:c1');
  });

  it('keeps the latency frontier and Best engine on the GPU axis', () => {
    // Ranked on GPU count, the 1-GPU vLLM-Omni deployment would win B200 and hide SGLang's 4-GPU one.
    const deployments = cells([
      b200Deployment('wide', 'sglang', 4, 30, 400),
      b200Deployment('narrow', 'sglang', 1, 100, 120),
      b200Deployment('vllm', 'vllm-omni', 1, 60, 200),
    ]);
    const plotted = (x: ResultsChartSelection['x']) =>
      resultsChartSeries(deployments, selection({ x, optimal: true })).map((s) => [
        s.key,
        s.points.map((p) => `${p.cell.point.id} ${p.optimal}`).toSorted(),
      ]);
    expect(plotted('gpus')).toEqual(plotted('p50'));
    const [gpus] = resultsChartSeries(deployments, selection({ x: 'gpus' }));
    expect(gpus.frontier.map((p) => p.x)).toEqual([1, 4]);
  });

  it('joins deployments that share a GPU count in latency order, whatever the row order', () => {
    const rows = [
      layout('two', 2, 100, 50, 2),
      layout('tp4', 4, 40, 120, 4),
      layout('u4', 4, 60, 80, 1),
      layout('eight', 8, 20, 200, 8),
    ];
    for (const order of [rows, rows.toReversed()]) {
      const [gpus] = resultsChartSeries(cells(order), selection({ x: 'gpus', y: 'kjPerClip' }));
      expect(ids(gpus.frontier)).toEqual(['two:c1', 'u4:c1', 'tp4:c1', 'eight:c1']);
    }
  });

  it('ranks the GPU axis only among deployments with a recorded GPU count', () => {
    const unplaced = deployment('unplaced', 1, 30, 400, 50, { participating: null });
    const deployments = cells([unplaced, fast, mid]);
    const [gpus] = resultsChartSeries(
      deployments,
      selection({ x: 'gpus', y: 'kjPerClip', optimal: true }),
    );
    expect(ids(gpus.points)).toEqual(['mid:c1', 'fast:c1']);
  });

  it('never lets a faster lossy series become a GPU’s default line', () => {
    // Same engine and layout with and without caching: two deployments, neither replaces the other.
    const deployments = cells([
      run('stock', 'sglang', 40, []),
      run('fused', 'sol-engine', 30, ['cuda-graph', 'kernel-fusion']),
      run('cached', 'sol-engine', 10, ['first-block-cache', 'sol-attn']),
      run('unreviewed', 'sol-engine', 5, ['mystery-cache']),
    ]);
    expect(runtime(resultsChartSeries(deployments, selection()))).toEqual([
      ['sol-engine', 'cuda-graph+kernel-fusion', false],
    ]);
    expect(runtime(resultsChartSeries(deployments, selection({ lossy: true })))).toEqual([
      ['sol-engine', 'cuda-graph+kernel-fusion', false],
      ['sol-engine', 'first-block-cache+sol-attn', true],
      ['sol-engine', 'mystery-cache', true],
    ]);
  });

  it('draws a lossy line’s lossless twin under Best engines, which never stands for its GPU', () => {
    const points = [
      laidOutRun('stock', 'sglang', 20, []),
      laidOutRun('fused', 'sol-engine', 30, ['cuda-graph']),
      laidOutRun('cached', 'sol-engine', 10, ['cuda-graph', 'first-block-cache']),
    ];
    const state = { ...DEFAULT_RESULTS_STATE, lossy: true };
    const drawn = resultsChartSeries(cells(points, state), selection({ lossy: true }));
    expect(drawn.map((s) => [s.engine, s.lossy, Boolean(s.twin)])).toEqual([
      ['sglang', false, false],
      ['sol-engine', false, true],
      ['sol-engine', true, false],
    ]);
    const charted = chartedCells(resultProjection(points, state), state);
    expect(charted.map((c) => c.point.id).toSorted()).toEqual(['cached:c1', 'stock:c1']);
  });
});

describe('resultsMetricLabel', () => {
  it('names the clip a latency measures only when every plotted cell generates it', () => {
    const plotted = cells([fast, mid, slow]);
    const p50 = RESULTS_X_METRICS.p50;
    expect(resultsMetricLabel(p50, 'en', resultsClip(plotted))).toBe(
      'Median latency per 8 s clip at 24 fps (s)',
    );
    expect(resultsMetricLabel(p50, 'zh', resultsClip(plotted))).toBe(
      '生成一段 8 秒、24 fps 视频的中位延迟 (s)',
    );
    const mixed = plotted.map((cell, i) =>
      i === 0 ? { ...cell, metadata: { ...cell.metadata, fps: 30 } } : cell,
    );
    expect(resultsMetricLabel(p50, 'en', resultsClip(mixed))).toBe('Median latency per clip (s)');
  });
});
