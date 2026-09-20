import { describe, expect, it } from 'vitest';
import type { VideoPoint } from './metrics';
import { plotVideoPoints } from './plot';
import { DEFAULT_VIDEO_DASHBOARD_STATE } from './video-url-state';

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
  cell({ id: 'h200-4g-c2', concurrency: 2, p90: 300, p50: 299, wallSeconds: 2990 }), // queued, marginally higher rate
];
const b200 = cell({
  id: 'b200-4g',
  hardwareKey: 'b200',
  hardwareName: 'NVIDIA B200',
  p90: 78,
  p50: 77,
  wallSeconds: 1560,
});
const colorFor = (key: string) => `color-${key}`;
const state = {
  ...DEFAULT_VIDEO_DASHBOARD_STATE,
  x: 'p90Latency' as const,
  y: 'videosPerGpuHour' as const,
};

describe('plotVideoPoints', () => {
  it('builds a per-hardware frontier over deployments and leaves queued cells out of it', () => {
    const plot = plotVideoPoints([...h200, b200], state, colorFor, new Set());
    expect(plot.frontiers.h200.map((p) => p.id)).toEqual(['h200-8g', 'h200-4g-c1', 'h200-2g']);
    expect(plot.frontiers.b200.map((p) => p.id)).toEqual(['b200-4g']);
    expect(plot.plotted.map((p) => p.id)).toEqual([
      'h200-4g-c1',
      'h200-8g',
      'h200-2g',
      'h200-4g-tp4',
      'b200-4g',
    ]);
    expect(plot.plotted.find((p) => p.id === 'h200-4g-tp4')?.optimal).toBe(false);
    expect(plot.multiLayout).toBe(true);
    // B200 is faster and more efficient than every H200 deployment, so it is the whole global frontier.
    expect(plot.global.map((p) => p.id)).toEqual(['b200-4g']);
  });
  it('shows queued cells only on request, faded from every frontier', () => {
    const plot = plotVideoPoints(h200, { ...state, queue: true }, colorFor, new Set());
    const queued = plot.plotted.filter((p) => p.queued);
    expect(queued.map((p) => p.id)).toEqual(['h200-4g-c2']);
    expect(plot.frontiers.h200.map((p) => p.id)).not.toContain('h200-4g-c2');
    expect(plot.global.map((p) => p.id)).not.toContain('h200-4g-c2');
  });
  it('optimal-only hides dominated deployments and queued cells', () => {
    const plot = plotVideoPoints(
      h200,
      { ...state, queue: true, optimal: true },
      colorFor,
      new Set(),
    );
    expect(plot.plotted.map((p) => p.id)).toEqual(['h200-4g-c1', 'h200-8g', 'h200-2g']);
  });
  it('is a scatter of single deployments when each hardware has one layout', () => {
    const plot = plotVideoPoints([base, b200], state, colorFor, new Set());
    expect(plot.multiLayout).toBe(false);
    expect(Object.values(plot.frontiers).every((f) => f.length === 1)).toBe(true);
    expect(plot.global.map((p) => p.id)).toEqual(['b200-4g']);
  });
  it('drops hidden hardware and cells missing either metric', () => {
    const plot = plotVideoPoints(
      [
        base,
        b200,
        cell({ id: 'no-p90', hardwareKey: 'h100', hardwareName: 'H100', samples: 4, p90: null }),
      ],
      state,
      colorFor,
      new Set(['b200']),
    );
    expect(plot.plotted.map((p) => p.id)).toEqual(['h200-4g-c1']);
    expect(plot.frontiers).not.toHaveProperty('b200');
  });
});
