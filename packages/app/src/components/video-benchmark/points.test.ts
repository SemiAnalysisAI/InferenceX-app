import { describe, expect, it } from 'bun:test';
import type { VideoHistoryObservation, VideoHistoryPage } from './history';
import { latestVideoCells, namedRunPoints, videoPoints } from './points';
import type { ResultsEvidence } from './results-evidence';

const observation: VideoHistoryObservation = {
  id: 'sha:c1',
  cell: 'c1',
  hardware: 'NVIDIA H200',
  concurrency: 1,
  runtime: '71de97b2',
  workload: 'w',
  workloadKey: 'formal-plan-and-semantics',
  model: 'MiniMaxAI/MiniMax-H3',
  status: 'complete',
  valid: 20,
  completed: 20,
  scheduled: 20,
  failed: 0,
  samples: 20,
  p50: 150.6,
  p90: 151.1,
  energyKj: 410.95,
  participating: 4,
  allocated: 4,
  replicas: null,
  wallSeconds: 3013.4,
  videoSecondsPerHour: 192,
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
      approved: true,
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
      approved: true,
      error: null,
      sources: [{ ...source, observations: [{ ...observation, p50: 999 }] }],
    },
  ],
};

describe('videoPoints', () => {
  it.each([true, false, undefined])(
    'preserves approval %s and provenance for one exact named run',
    (approved) => {
      const history = structuredClone(page);
      for (const entry of history.entries) entry.approved = approved;
      const other = structuredClone(history.entries[0]);
      other.runId = '999';
      for (const item of other.sources)
        for (const row of item.observations) row.id = `other:${row.id}`;
      history.entries.unshift(other);
      const named = namedRunPoints([history], '34342452354');
      expect(named.map((point) => point.id)).toEqual(['sha:c1', 'sha:c2']);
      expect(named[0]).toMatchObject({
        approved,
        runId: '34342452354',
        artifactId: 10107476604,
        p50: 150.6,
        videoSecondsPerHour: 192,
        publishedAt: '2026-09-10T00:00:00Z',
      });
      if (approved !== true) expect(videoPoints([history])).toEqual([]);
    },
  );

  it('keeps a legacy stored source in History without turning it into an official chart point', () => {
    const legacy = structuredClone(page);
    delete legacy.entries[0].approved;
    legacy.entries[1].approved = false;
    expect(legacy.entries[0].sources[0].observations).toHaveLength(2);
    expect(videoPoints([legacy])).toEqual([]);
  });
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
      workloadKey: 'formal-plan-and-semantics',
      p50: 150.6,
      enforcedLimitW: 2800,
      server: { tp: 2, ulysses: 2, attention: 'auto' },
      observedAt: '2026-09-09T10:00:00Z',
    });
    const versioned = structuredClone(page);
    versioned.entries[0].sources[0].observations[0].workloadKey =
      '{"plan":{"model_id":"m","schema_version":2},"semantics":null}';
    expect(videoPoints([versioned])[0].workloadKey).toBe(
      '{"plan":{"model_id":"m"},"semantics":null}',
    );
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
      'workloadKey',
    ])
      delete obs[key];
    const [point] = videoPoints([legacy]);
    expect(point.participating).toBeNull();
    expect(point.wallSeconds).toBeNull();
    expect(point.server).toBeNull();
    expect(point.workloadKey).toBeNull();
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
  it('lets a newer recorded layout supersede a cell published before layouts were recorded', () => {
    const entry = (runId: string, id: string, server: VideoHistoryObservation['server']) => ({
      ...page.entries[0],
      id: `${runId}.1`,
      runId,
      sources: [{ ...source, id: runId, observations: [{ ...observation, id, server }] }],
    });
    const points = videoPoints([
      {
        ...page,
        entries: [entry('5', 'recorded:c1', observation.server), entry('4', 'legacy:c1', null)],
      },
    ]);
    expect(latestVideoCells(points).map((p) => p.id)).toEqual(['recorded:c1']);
  });
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

const served = (
  id: string,
  hardware: string,
  engine: string,
  server: typeof observation.server,
  optimizations: string[] = [],
) => ({
  ...observation,
  id,
  hardware,
  server,
  results: { engine, optimizations } as ResultsEvidence,
});

describe('latestVideoCells', () => {
  it('never lets one engine replace another engine at the same hardware, GPUs and concurrency', () => {
    const split = { tp: 1, ulysses: 4, attention: null };
    const cells = latestVideoCells(
      videoPoints([
        // Nor is a stock cell an older layout of the same engine with caching.
        pageOf('6', 'H100', [
          served('h100-cached:c1', 'H100', 'sglang', split, ['first-block-cache']),
        ]),
        pageOf('5', 'H100', [served('h100-stock:c1', 'H100', 'sglang', null)]),
        pageOf('4', 'B200', [served('b200-vllm:c1', 'B200', 'vllm-omni', split)]),
        pageOf('3', 'B200', [served('b200-sglang:c1', 'B200', 'sglang', split)]),
        // An SGLang cell from before layouts were recorded is no older layout of vLLM-Omni.
        pageOf('2', 'H200', [served('h200-vllm:c1', 'H200', 'vllm-omni', split)]),
        pageOf('1', 'H200', [served('h200-sglang:c1', 'H200', 'sglang', null)]),
      ]),
    );
    expect(cells.map((p) => p.id).toSorted()).toEqual([
      'b200-sglang:c1',
      'b200-vllm:c1',
      'h100-cached:c1',
      'h100-stock:c1',
      'h200-sglang:c1',
      'h200-vllm:c1',
    ]);
  });
});
