import { describe, expect, it } from 'vitest';
import type { VideoHistoryObservation, VideoHistoryPage } from './history';
import { dashboardCells, latestVideoCells, videoPoints } from './points';

const observation: VideoHistoryObservation = {
  id: 'sha:c1',
  cell: 'c1',
  hardware: 'NVIDIA H200',
  concurrency: 1,
  runtime: '71de97b2',
  workload: 'w',
  model: 'MiniMaxAI/MiniMax-H3',
  status: 'complete',
  valid: 20,
  completed: 20,
  scheduled: 20,
  failed: 0,
  samples: 20,
  p50: 150.6,
  p90: 151.1,
  clipsGpuHour: 5.97,
  energyKj: 410.95,
  participating: 4,
  allocated: 4,
  replicas: null,
  wallSeconds: 3013.4,
  durationSeconds: 8,
  frameCount: 192,
  avgPowerW: 2727.5,
  enforcedLimitW: 2800,
  server: { tp: 2, ulysses: 2, attention: 'auto' },
};
const artifact = {
  id: 10107476604,
  name: 'h3-video-34342452354-1',
  expired: false,
  size_in_bytes: 1,
  stored: true,
};
const source = {
  id: '34342452354',
  sha256: 'a',
  sourceSha: 'b',
  hardware: 'NVIDIA H200',
  execution: 'complete',
  observedAt: '2026-09-09T10:00:00Z',
  kind: 'observation' as const,
  observations: [observation, { ...observation, id: 'sha:c2', cell: 'c2', concurrency: 2 }],
  fidelity: null,
  calibration: null,
  releaseQualified: false,
  error: null,
};
const page: VideoHistoryPage = {
  schemaVersion: 1,
  nextPage: null,
  entries: [
    {
      id: '34342452354.10107476604',
      runId: '34342452354',
      artifact,
      publishedAt: '2026-09-10T00:00:00Z',
      error: null,
      sources: [
        source,
        {
          ...source,
          id: '1',
          kind: 'fidelity',
          observations: [],
          fidelity: 'fail',
          calibration: 'uncalibrated',
        },
      ],
    },
    {
      // An older re-export of the same source: same observation ids, stale numbers.
      id: '99.1',
      runId: '34342452354',
      artifact: { ...artifact, id: 1 },
      publishedAt: '2026-09-01T00:00:00Z',
      error: null,
      sources: [{ ...source, observations: [{ ...observation, p50: 999 }] }],
    },
  ],
};

describe('videoPoints', () => {
  it('flattens observation cells, maps hardware keys and keeps the newest publication of a source', () => {
    const points = videoPoints([page]);
    expect(points.map((p) => [p.id, p.concurrency])).toEqual([
      ['sha:c1', 1],
      ['sha:c2', 2],
    ]);
    expect(points[0]).toMatchObject({
      runId: '34342452354',
      artifactId: 10107476604,
      hardwareKey: 'h200',
      hardwareName: 'NVIDIA H200',
      p50: 150.6,
      enforcedLimitW: 2800,
      server: { tp: 2, ulysses: 2, attention: 'auto' },
      observedAt: '2026-09-09T10:00:00Z',
    });
  });
  it('sorts by HW_REGISTRY order, then concurrency', () => {
    const b200 = {
      ...page.entries[0],
      id: '2.2',
      runId: '2',
      sources: [
        {
          ...source,
          id: '2',
          observations: [{ ...observation, id: 'b:c1', hardware: 'NVIDIA B200' }],
        },
      ],
    };
    const h100 = {
      ...page.entries[0],
      id: '3.3',
      runId: '3',
      sources: [
        {
          ...source,
          id: '3',
          observations: [
            { ...observation, id: 'h:c4', hardware: 'NVIDIA H100 80GB HBM3', concurrency: 4 },
            { ...observation, id: 'h:c1', hardware: 'NVIDIA H100 80GB HBM3' },
          ],
        },
      ],
    };
    const points = videoPoints([{ ...page, entries: [h100, page.entries[0], b200] }]);
    expect(points.map((p) => p.id)).toEqual(['b:c1', 'sha:c1', 'sha:c2', 'h:c1', 'h:c4']);
  });
  it('tolerates pre-upgrade observations that lack the additive fields', () => {
    const legacy = structuredClone(page);
    const obs = legacy.entries[0].sources[0].observations[0] as unknown as Record<string, unknown>;
    for (const key of [
      'participating',
      'allocated',
      'wallSeconds',
      'durationSeconds',
      'frameCount',
      'avgPowerW',
      'enforcedLimitW',
      'server',
    ])
      delete obs[key];
    const [point] = videoPoints([legacy]);
    expect(point.participating).toBeNull();
    expect(point.wallSeconds).toBeNull();
    expect(point.server).toBeNull();
    expect(point.hardwareKey).toBe('h200');
  });
  it('keeps only the newest observation per hardware cell', () => {
    const rerun = {
      ...page.entries[0],
      id: '5.5',
      runId: '5',
      sources: [
        {
          ...source,
          id: '5',
          observations: [{ ...observation, id: 'again:c1', p50: 140 }],
        },
      ],
    };
    // Entry order is publication order (newest first): the rerun supersedes the older cell.
    const points = videoPoints([{ ...page, entries: [rerun, page.entries[0]] }]);
    expect(points.map((p) => p.id)).toEqual(['again:c1', 'sha:c1', 'sha:c2']);
    expect(latestVideoCells(points).map((p) => [p.id, p.p50])).toEqual([
      ['again:c1', 140],
      ['sha:c2', 150.6],
    ]);
  });
});

describe('dashboardCells', () => {
  const FORMAL =
    '1344 × 768 · 8 s · 24 fps · 50 steps · MiniMaxAI/MiniMax-H3 @ 42ed227ee7df · seed 11, 29 · A single continuous shot';
  const SHORT =
    '1344 × 768 · 4 s · 24 fps · 50 steps · MiniMaxAI/MiniMax-H3 @ 42ed227ee7df · seed 11 · A single continuous shot';
  const cell = (over: Partial<VideoHistoryObservation>): VideoHistoryObservation => ({
    ...observation,
    workload: FORMAL,
    ...over,
  });
  const pageOf = (
    runId: string,
    hardware: string,
    observations: VideoHistoryObservation[],
  ): VideoHistoryPage => ({
    schemaVersion: 1,
    nextPage: null,
    entries: [
      {
        ...page.entries[0],
        id: `${runId}.1`,
        runId,
        artifact: { ...artifact, id: Number(runId) },
        sources: [{ ...source, id: runId, hardware, observations }],
      },
    ],
  });

  it('drops cells under the sample floor even when they are the most efficient', () => {
    // A two-GPU smoke with four clips: the best videos per GPU-hour, no P90, not a benchmark point.
    const smoke = cell({
      id: 'sha:smoke',
      cell: 'smoke',
      samples: 4,
      valid: 4,
      scheduled: 4,
      p90: null,
      clipsGpuHour: 15.06,
      participating: 2,
      allocated: 2,
      server: { tp: 1, ulysses: 2, attention: 'auto' },
    });
    const { cells, workload, otherWorkloads } = dashboardCells(
      videoPoints([pageOf('1', 'NVIDIA H200', [cell({}), smoke])]),
    );
    expect(cells.map((p) => p.id)).toEqual(['sha:c1']);
    expect(workload).toBe(FORMAL.split(' · ').slice(0, 5).join(' · '));
    expect(otherWorkloads).toBe(0);
  });

  it('keeps the workload measured on the most hardware and counts the hidden ones', () => {
    const pages = [
      pageOf('1', 'NVIDIA H200', [
        cell({}),
        cell({ id: 'sha:short', cell: 'c1s', workload: SHORT }),
      ]),
      pageOf('2', 'NVIDIA B200', [cell({ id: 'sha:b1', hardware: 'NVIDIA B200' })]),
    ];
    const result = dashboardCells(videoPoints(pages));
    expect(result.workload).toBe(FORMAL.split(' · ').slice(0, 5).join(' · '));
    expect(result.cells.map((p) => p.id).toSorted()).toEqual(['sha:b1', 'sha:c1']);
    expect(result.otherWorkloads).toBe(1);
  });

  it('returns no cells and no workload when nothing reaches the floor', () => {
    const result = dashboardCells(
      videoPoints([pageOf('1', 'NVIDIA H200', [cell({ samples: 3 })])]),
    );
    expect(result).toEqual({ cells: [], workload: null, otherWorkloads: 1 });
  });
});
