import { describe, expect, it } from 'vitest';
import fixture from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';
import { videoPoints } from './points';
import { DEFAULT_RESULTS_STATE, resultProjection, type ResultsState } from './results';
import {
  resultsChartSeries,
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
  ...change,
});
const ids = (points: { cell: { point: VideoPoint } }[]) => points.map((p) => p.cell.point.id);
const value = (series: ResultsChartSeries, id: string) =>
  series.points.find((p) => p.cell.point.id === id)?.y;

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

  it('excludes hidden hardware and keeps a named run as its own series', () => {
    const b200 = deployment('b200', 4, 40, 300, 150, { hardwareKey: 'b200' });
    const named = deployment('named', 2, 20, 50, 400, { runId: '200', approved: false });
    const deployments = cells([fast, mid, b200], { unofficialRun: '200' }, [named]);
    const series = resultsChartSeries(deployments, selection({ optimal: true }));
    expect(series.map((s) => s.key)).toEqual(['b200', 'h200', 'h200-overlay']);
    const [, official, overlay] = series;
    expect(overlay.hardwareKey).toBe('h200');
    expect(ids(overlay.points)).toEqual(['named:c1']);
    expect(ids(official.points)).toEqual(['fast:c1', 'mid:c1']);
    expect(overlay.points[0].key).toBe('200:named:c1');
    const hidden = resultsChartSeries(deployments, selection({ hidden: ['h200'] }));
    expect(hidden.map((s) => s.key)).toEqual(['b200']);
  });
});
