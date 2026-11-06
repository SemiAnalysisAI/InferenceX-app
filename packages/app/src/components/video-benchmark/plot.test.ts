import { describe, expect, it } from 'vitest';
import history from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import { X_METRICS, Y_METRICS, type VideoPoint } from './metrics';
import { listedVideoCells, plotVideoPoints } from './plot';
import { videoPoints } from './points';
import { DEFAULT_VIDEO_DASHBOARD_STATE, type VideoDashboardState } from './video-url-state';

const base: VideoPoint = {
  id: 'h200-4g-c1',
  runId: '1',
  artifactId: 1,
  cell: 'c1',
  hardwareKey: 'h200',
  hardwareName: 'NVIDIA H200',
  runtime: 'r',
  model: 'm',
  workload: 'w',
  concurrency: 1,
  participating: 4,
  allocated: 8,
  replicas: null,
  valid: 20,
  completed: 20,
  scheduled: 20,
  failed: 0,
  samples: 20,
  p50: 150,
  p90: 151,
  wallSeconds: 3000, // 6.0 videos per GPU-hour
  durationSeconds: 8,
  frameCount: 192,
  energyKj: 400,
  avgPowerW: 2700,
  enforcedLimitW: 2800,
  server: { tp: 2, ulysses: 2, attention: null },
  status: 'complete',
  observedAt: null,
};
const cell = (patch: Partial<VideoPoint>): VideoPoint => ({ ...base, ...patch });
// H200 deployments: 8 boards are faster but less efficient, 2 boards slower but more efficient,
// and a second 4-board split that is dominated by the first (slower and less efficient).
const h200 = [
  base,
  cell({
    id: 'h200-8g',
    participating: 8,
    server: { tp: 4, ulysses: 2, attention: null },
    p90: 85,
    p50: 84,
    wallSeconds: 1700,
  }), // 5.29
  cell({
    id: 'h200-2g',
    participating: 2,
    server: { tp: 2, ulysses: 1, attention: null },
    p90: 290,
    p50: 289,
    wallSeconds: 5400,
  }), // 6.67
  cell({
    id: 'h200-4g-tp4',
    server: { tp: 4, ulysses: 1, attention: null },
    p90: 160,
    p50: 159,
    wallSeconds: 3100,
  }), // 5.81
];
// Two clients on the one-replica 4-board deployment: queued, with a marginally higher rate than C1.
const queued = cell({ id: 'h200-4g-c2', concurrency: 2, p90: 300, p50: 299, wallSeconds: 2990 });
const b200 = cell({
  id: 'b200-4g',
  hardwareKey: 'b200',
  hardwareName: 'NVIDIA B200',
  p90: 78,
  p50: 77,
  wallSeconds: 1560,
});
const colorFor = (key: string) => `color-${key}`;
const state: VideoDashboardState = {
  ...DEFAULT_VIDEO_DASHBOARD_STATE,
  x: 'p90Latency',
  y: 'videosPerGpuHour',
};
const plot = (
  points: VideoPoint[],
  s: VideoDashboardState = state,
  hidden: ReadonlySet<string> = new Set(),
) => plotVideoPoints(points, s, colorFor, hidden);
const ids = (points: { id: string }[]) => points.map((p) => p.id);

describe('plotVideoPoints', () => {
  it('builds a per-hardware frontier over deployments and, with Optimal Only off, draws the dominated ones faded', () => {
    const out = plot([...h200, b200], { ...state, optimal: false });
    expect(Object.keys(out).toSorted()).toEqual(['frontiers', 'multiLayout', 'plotted']);
    expect(ids(out.frontiers.h200)).toEqual(['h200-8g', 'h200-4g-c1', 'h200-2g']);
    expect(ids(out.frontiers.b200)).toEqual(['b200-4g']);
    expect(ids(out.plotted)).toEqual([
      'h200-4g-c1',
      'h200-8g',
      'h200-2g',
      'h200-4g-tp4',
      'b200-4g',
    ]);
    expect(out.plotted.map((p) => p.optimal)).toEqual([true, true, true, false, true]);
    expect(out.plotted[1]).toMatchObject({
      x: 85,
      y: expect.closeTo(5.2941, 3),
      color: 'color-h200',
      label: 'H200',
    });
    expect(out.multiLayout).toBe(true);
  });
  it('never plots a queued cell: more clients than replicas only queue on the batch-one server', () => {
    const out = plot([...h200, queued]);
    expect(ids(out.plotted)).not.toContain('h200-4g-c2');
    expect(ids(out.frontiers.h200)).toEqual(['h200-8g', 'h200-4g-c1', 'h200-2g']);
    // No axis pair or cost tier re-admits it.
    for (const x of X_METRICS) {
      for (const y of Y_METRICS) {
        expect(ids(plot([base, queued], { ...state, x, y, tier: 'r' }).plotted)).toEqual([
          'h200-4g-c1',
        ]);
      }
    }
    // An unrecorded replica count reads as one; one client per replica is not queueing.
    expect(ids(plot([cell({ id: 'c4-r2', concurrency: 4, replicas: 2 })]).plotted)).toEqual([]);
    expect(ids(plot([cell({ id: 'c2-r2', concurrency: 2, replicas: 2 })]).plotted)).toEqual([
      'c2-r2',
    ]);
    expect(ids(plot([cell({ id: 'c-na', concurrency: null })]).plotted)).toEqual(['c-na']);
  });
  it('plots only the C1 cells of the retained campaign, whose C2 and C4 cells queue on one replica', () => {
    // H100/H200/B200 C1/C2/C4 of 2026-09-09, n = 20 each, replicas unrecorded → one endpoint.
    const out = plot(
      videoPoints([history as unknown as VideoHistoryPage]),
      DEFAULT_VIDEO_DASHBOARD_STATE,
    );
    expect(out.plotted.map((p) => [p.hardwareKey, p.concurrency])).toEqual([
      ['b200', 1],
      ['h200', 1],
      ['h100', 1],
    ]);
    // P90 time to video against videos per $1 TCO at the hyperscaler tier ($1.73/$1.22/$1.17 GPU-hr).
    expect(out.plotted.map((p) => [p.x, p.y])).toEqual([
      [expect.closeTo(78.316, 3), expect.closeTo(6.6625, 3)],
      [expect.closeTo(151.105, 3), expect.closeTo(4.8961, 3)],
      [expect.closeTo(168.1135, 3), expect.closeTo(4.5933, 3)],
    ]);
    expect(out.multiLayout).toBe(false);
    expect(Object.values(out.frontiers).map((f) => f.length)).toEqual([1, 1, 1]);
    expect(out.plotted.every((p) => p.optimal)).toBe(true);
  });
  it('is a scatter of single deployments when each hardware has one layout', () => {
    const out = plot([base, b200]);
    expect(out.multiLayout).toBe(false);
    expect(Object.values(out.frontiers).every((f) => f.length === 1)).toBe(true);
    expect(out.plotted.every((p) => p.optimal)).toBe(true);
  });
  it('drops hidden hardware and cells missing either metric', () => {
    const out = plot(
      [
        base,
        b200,
        cell({ id: 'no-p90', hardwareKey: 'h100', hardwareName: 'H100', samples: 4, p90: null }),
      ],
      state,
      new Set(['b200']),
    );
    expect(ids(out.plotted)).toEqual(['h200-4g-c1']);
    expect(out.frontiers).not.toHaveProperty('b200');
  });
});

describe('Optimal Only', () => {
  it('hides dominated deployments by default without moving the frontiers', () => {
    const on = plot([...h200, b200]);
    const off = plot([...h200, b200], { ...state, optimal: false });
    expect(ids(on.plotted)).toEqual(['h200-4g-c1', 'h200-8g', 'h200-2g', 'b200-4g']);
    expect(on.plotted.every((p) => p.optimal)).toBe(true);
    expect(ids(on.frontiers.h200)).toEqual(ids(off.frontiers.h200));
    expect(ids(on.frontiers.b200)).toEqual(ids(off.frontiers.b200));
    expect(on.multiLayout).toBe(true);
  });
  it('lists the same cells in the table: frontier only when on, every non-queued deployment when off', () => {
    const points = [...h200, queued, b200];
    expect(ids(listedVideoCells(points, state, new Set()))).toEqual([
      'h200-4g-c1',
      'h200-8g',
      'h200-2g',
      'b200-4g',
    ]);
    expect(ids(listedVideoCells(points, { ...state, optimal: false }, new Set()))).toEqual([
      'h200-4g-c1',
      'h200-8g',
      'h200-2g',
      'h200-4g-tp4',
      'b200-4g',
    ]);
    expect(ids(listedVideoCells(points, state, new Set(['h200'])))).toEqual(['b200-4g']);
  });
  it('lists a cell without a value on the selected axis only when Optimal Only is off', () => {
    const unmetered = cell({
      id: 'h200-4g-nopower',
      energyKj: null,
      server: { tp: 1, ulysses: 4, attention: null },
    });
    const energy: VideoDashboardState = { ...state, y: 'kjPerVideo' };
    expect(ids(listedVideoCells([base, unmetered], energy, new Set()))).toEqual(['h200-4g-c1']);
    expect(
      ids(listedVideoCells([base, unmetered], { ...energy, optimal: false }, new Set())),
    ).toEqual(['h200-4g-c1', 'h200-4g-nopower']);
  });
});
