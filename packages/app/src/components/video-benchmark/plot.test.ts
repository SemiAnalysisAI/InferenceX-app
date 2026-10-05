import { describe, expect, it } from 'vitest';
import history from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import { X_METRICS, Y_METRICS, type VideoPoint } from './metrics';
import { listedVideoCells, plotVideoPoints } from './plot';
import { videoPoints } from './points';
import type { VideoQualityAssessment, VideoQualityMetricResult } from './quality';
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
  workloadKey: 'matched-workload',
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
      for (const y of Y_METRICS.filter((id) => id !== 'quality')) {
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

describe('comparison eligibility', () => {
  it('does not dominate or connect a different workload, generation setting, or unknown identity', () => {
    const points = [
      base,
      cell({
        id: 'different-plan',
        workloadKey: 'other-plan',
        participating: 2,
        p90: 10,
        wallSeconds: 200,
      }),
      cell({ id: 'different-steps', deployment: { generationKey: 'steps:25' }, participating: 8 }),
      cell({ id: 'unknown-one', workloadKey: null, participating: 2 }),
      cell({ id: 'unknown-two', workloadKey: null, participating: 8 }),
    ];
    const result = plot(points);
    expect(ids(result.plotted)).toEqual(ids(points));
    expect(Object.values(result.frontiers).every((group) => group.length === 1)).toBe(true);
    expect(result.multiLayout).toBe(false);
  });
  it('keeps multiple nonqueued observations of one deployment as unconnected points', () => {
    const first = cell({ replicas: 2 });
    const second = cell({
      id: 'same-layout-c2',
      replicas: 2,
      concurrency: 2,
      p90: 160,
      wallSeconds: 2500,
    });
    const result = plot([first, second]);
    expect(ids(result.plotted)).toEqual([first.id, second.id]);
    expect(Object.values(result.frontiers).every((group) => group.length === 1)).toBe(true);
    expect(result.multiLayout).toBe(false);
  });
  it('excludes failed hardware from the chart and table with either Optimal Only setting', () => {
    const failed = cell({
      id: 'failed',
      participating: 2,
      p90: 10,
      wallSeconds: 200,
      hardwareHealth: { status: 'fail', reason: 'throttling', evidence: 'health.json' },
    });
    for (const optimal of [true, false]) {
      expect(ids(plot([failed, base], { ...state, optimal }).plotted)).toEqual([base.id]);
      expect(ids(listedVideoCells([failed, base], { ...state, optimal }, new Set()))).toEqual([
        base.id,
      ]);
    }
  });
  it('does not rank unrecorded capacity as a deployment improvement', () => {
    const unknown = cell({
      id: 'scheduler',
      concurrency: 4,
      replicas: 1,
      deployment: { batchSize: 4, scheduling: 'unknown' },
    });
    expect(ids(plot([unknown], { ...state, optimal: false }).plotted)).toEqual([]);
    expect(listedVideoCells([unknown], { ...state, optimal: false }, new Set())).toEqual([]);
  });
});

// Synthetic calibrated scores test eligibility only; retained measurements are unjudged.
function quality(overrides: Partial<VideoQualityMetricResult> = {}): VideoQualityAssessment {
  const metric: VideoQualityMetricResult = {
    value: 4,
    status: 'pass',
    direction: 'higher',
    evaluatorId: 'fixture-human',
    evaluatorVersion: 'fixture-v1',
    evaluatorSha256: 'b'.repeat(64),
    samples: 20,
    total: 20,
    calibration: {
      status: 'calibrated',
      cohortId: 'fixture-calibration',
      threshold: 3,
      provenance: 'fixture://preregistered',
      frozenAt: '2026-09-01T00:00:00Z',
    },
  };
  return {
    scale: 'ordinal_0_to_4',
    contractId: 'fixture-protocol',
    contractSha256: 'a'.repeat(64),
    rubricVersion: 'fixture-v1',
    rubricSha256: 'c'.repeat(64),
    metrics: {
      prompt_adherence: { ...metric, ...overrides },
      visual_fidelity: { ...metric },
      temporal_consistency: { ...metric },
      motion_plausibility: { ...metric },
      audio_quality: { ...metric },
      audio_content: { ...metric },
      av_sync: { ...metric },
    },
  };
}

describe('quality-qualified frontier', () => {
  it('retains a declared calibrated zero and excludes a faster point failing another dimension', () => {
    const zero = quality({
      value: 0,
      calibration: { ...quality().metrics.prompt_adherence!.calibration!, threshold: 0 },
    });
    const failed = quality();
    failed.metrics.audio_content = { ...failed.metrics.audio_content!, status: 'fail' };
    const points = [
      cell({ quality: zero }),
      cell({ id: 'faster-audio-failure', participating: 2, p90: 10, quality: failed }),
    ];
    for (const optimal of [true, false]) {
      const selected = { ...state, optimal, y: 'quality' as const, qualityThreshold: 0 };
      expect(plot(points, selected).plotted.map((p) => [p.id, p.y])).toEqual([[base.id, 0]]);
      expect(ids(listedVideoCells(points, selected, new Set()))).toEqual([base.id]);
    }
  });
  it('filters before dominance and applies the same eligibility with Optimal Only off', () => {
    const accepted = cell({ quality: quality() });
    const below = cell({
      id: 'fast-low-quality',
      participating: 2,
      p90: 10,
      wallSeconds: 200,
      quality: quality({ value: 3 }),
    });
    const unjudged = cell({ id: 'fast-unjudged', participating: 8, p90: 20, wallSeconds: 200 });
    for (const optimal of [true, false]) {
      const selected = { ...state, optimal, qualityThreshold: 4 };
      expect(ids(plot([below, unjudged, accepted], selected).plotted)).toEqual([base.id]);
      expect(ids(listedVideoCells([below, unjudged, accepted], selected, new Set()))).toEqual([
        base.id,
      ]);
    }
  });
  it('keeps evaluator and calibration cohorts separate even when each score is eligible', () => {
    const first = cell({ quality: quality() });
    const other = cell({
      id: 'other-evaluator',
      participating: 2,
      p90: 10,
      wallSeconds: 200,
      quality: quality({ evaluatorVersion: 'fixture-v2' }),
    });
    const result = plot([first, other], { ...state, y: 'quality' });
    expect(ids(result.plotted)).toEqual([base.id, 'other-evaluator']);
    expect(result.plotted.map((p) => p.y)).toEqual([4, 4]);
    expect(Object.values(result.frontiers).every((group) => group.length === 1)).toBe(true);
    expect(result.multiLayout).toBe(false);
  });
  it('returns no quality table or chart rows for uncalibrated retained measurements', () => {
    for (const optimal of [true, false]) {
      const selected = { ...state, optimal, y: 'quality' as const };
      expect(plot(h200, selected).plotted).toEqual([]);
      expect(listedVideoCells(h200, selected, new Set())).toEqual([]);
    }
  });
});
