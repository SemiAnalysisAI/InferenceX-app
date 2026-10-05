import { describe, expect, it } from 'vitest';
import {
  deploymentKey,
  isQueueing,
  layoutLabel,
  leadCell,
  queueingStatus,
  sharedLayoutCells,
} from './deployment';
import type { VideoPoint } from './metrics';

const base: VideoPoint = {
  id: 'a',
  runId: '1',
  artifactId: 1,
  cell: 'c1',
  hardwareKey: 'h200',
  hardwareName: 'NVIDIA H200',
  runtime: 'r',
  model: 'm',
  workload: 'w',
  workloadKey: 'synthetic-workload',
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
  wallSeconds: 3000,
  durationSeconds: 8,
  frameCount: 192,
  energyKj: 400,
  avgPowerW: 2700,
  enforcedLimitW: 2800,
  server: { tp: 2, ulysses: 2, attention: null },
  status: 'complete',
  observedAt: null,
};
const options = { tier: 'h' } as const;

describe('deployment', () => {
  it('keys a deployment by boards and model split, not by concurrency', () => {
    const c4: VideoPoint = { ...base, concurrency: 4 };
    expect(deploymentKey(c4)).toBe(deploymentKey(base));
    expect(
      deploymentKey({
        ...base,
        server: { tp: 1, ulysses: 4, attention: null },
      }),
    ).not.toBe(deploymentKey(base));
    expect(deploymentKey({ ...base, participating: null, server: null })).not.toBe(
      deploymentKey(base),
    );
  });
  it('treats concurrency above the replica count as queueing, with one replica when unknown', () => {
    expect(isQueueing(base)).toBe(false);
    expect(isQueueing({ ...base, concurrency: 2 })).toBe(true);
    expect(isQueueing({ ...base, concurrency: 4, replicas: 4 })).toBe(false);
    expect(isQueueing({ ...base, concurrency: 8, replicas: 4 })).toBe(true);
    expect(isQueueing({ ...base, concurrency: null })).toBe(false);
  });
  it('labels the layout in both locales and omits unknown parts', () => {
    expect(layoutLabel(base, 'en')).toBe('4 GPU · TP2 × Ulysses 2');
    expect(layoutLabel({ ...base, replicas: 2 }, 'zh')).toBe(
      '4 张 GPU · TP2 × Ulysses 2 · 2 个副本',
    );
    expect(layoutLabel({ ...base, server: null }, 'en')).toBe('4 GPU');
    expect(layoutLabel({ ...base, participating: null, server: null }, 'en')).toBe('—');
  });
  it('picks the layout most hardware share without substituting an unmatched layout', () => {
    const b200Eight = {
      ...base,
      id: 'b8',
      hardwareKey: 'b200',
      participating: 8,
      server: { tp: 4, ulysses: 2, attention: null },
      wallSeconds: 900,
    };
    const b200Four = {
      ...base,
      id: 'b4',
      hardwareKey: 'b200',
      wallSeconds: 1500,
    };
    const h100Two = {
      ...base,
      id: 'h2',
      hardwareKey: 'h100',
      participating: 2,
      server: { tp: 2, ulysses: 1, attention: null },
    };
    const queued = { ...base, id: 'q', concurrency: 2 };
    // 4g:tp2:u2 is shared by h200 and b200; h100's 2-GPU cell cannot join this comparison.
    expect(
      sharedLayoutCells([base, queued, b200Eight, b200Four, h100Two]).map((p) => p.id),
    ).toEqual(['a', 'b4']);
    expect(sharedLayoutCells([])).toEqual([]);
  });
  it('leads with the most efficient non-queued deployment of the hardware', () => {
    const eightBoards = {
      ...base,
      id: 'b',
      participating: 8,
      server: { tp: 4, ulysses: 2, attention: null },
      p50: 90,
      wallSeconds: 1800, // 20 × 3600 / (1800 × 8) = 5.0 videos per GPU-hour
    };
    const queued = { ...base, id: 'c', concurrency: 2, wallSeconds: 2900 }; // higher rate, but queued
    // base: 20 × 3600 / (3000 × 4) = 6.0 videos per GPU-hour
    expect(leadCell([eightBoards, queued, base], 'h200', options)?.id).toBe('a');
    expect(leadCell([eightBoards, queued, base], 'b200', options)).toBeUndefined();
    const tie = {
      ...eightBoards,
      id: 'd',
      participating: 4,
      wallSeconds: 3000,
      p50: 120,
    };
    expect(leadCell([base, tie], 'h200', options)?.id).toBe('d');
    const noRate = { ...base, id: 'e', wallSeconds: null };
    expect(leadCell([noRate], 'h200', options)?.id).toBe('e');
  });
  it('requires a known shared workload and layout at C1 for evidence comparisons', () => {
    const matching = { ...base, id: 'b', hardwareKey: 'b200', runtime: 'different-runtime' };
    const variants: VideoPoint[] = [
      {
        ...base,
        id: 'different-workload',
        hardwareKey: 'h100',
        workloadKey: 'other',
      },
      {
        ...base,
        id: 'missing-workload',
        hardwareKey: 'h100',
        workloadKey: null,
      },
      { ...base, id: 'missing-layout', hardwareKey: 'h100', server: null },
      { ...base, id: 'different-replicas', hardwareKey: 'h100', replicas: 2 },
      { ...base, id: 'c2', hardwareKey: 'h100', concurrency: 2, replicas: 2 },
    ];
    for (const variant of variants)
      expect(sharedLayoutCells([base, matching, variant]).map((p) => p.id)).toEqual(['a', 'b']);
    expect(sharedLayoutCells([{ ...base, workloadKey: null }])).toEqual([]);
    expect(sharedLayoutCells([{ ...base, server: null }])).toEqual([]);
    expect(sharedLayoutCells([{ ...base, concurrency: 2, replicas: 2 }])).toEqual([]);
  });
  it('keeps recorded replica, Ring, CFG, offload, batch and generation configurations distinct', () => {
    const variants: VideoPoint[] = [
      base,
      { ...base, replicas: 2 },
      { ...base, runtime: 'different-runtime' },
      { ...base, deployment: { ring: 2 } },
      { ...base, deployment: { cfg: 2 } },
      { ...base, deployment: { offload: { ditCpu: true } } },
      { ...base, deployment: { batchSize: 2, scheduling: 'fixed_batch' } },
      { ...base, deployment: { precision: 'fp8' } },
      { ...base, deployment: { generationKey: 'steps:25' } },
      { ...base, deployment: { acceleration: 'cache' } },
      { ...base, server: { ...base.server!, attention: 'flash' } },
    ];
    expect(new Set(variants.map(deploymentKey)).size).toBe(variants.length);
  });
  it('uses recorded fixed-batch capacity instead of applying the legacy batch-one rule', () => {
    const batched = {
      ...base,
      replicas: 2,
      deployment: { batchSize: 2, scheduling: 'fixed_batch' },
    };
    expect(isQueueing({ ...batched, concurrency: 4 })).toBe(false);
    expect(isQueueing({ ...batched, concurrency: 5 })).toBe(true);
  });
  it('never selects a failed-hardware observation as a representative or evidence comparison', () => {
    const failed: VideoPoint = {
      ...base,
      id: 'failed',
      wallSeconds: 100,
      hardwareHealth: { status: 'fail', reason: 'thermal throttle', evidence: 'health.json' },
    };
    expect(leadCell([failed, base], 'h200', options)?.id).toBe('a');
    expect(sharedLayoutCells([failed, base]).map((p) => p.id)).toEqual(['a']);
  });

  it('does not equate unknown batch capacity with an observed batch or configured dynamic maximum', () => {
    const modern = { ...base, replicas: 1, concurrency: 2, deployment: { scheduling: 'dynamic' } };
    expect(queueingStatus(modern)).toBe('unknown');
    expect(
      queueingStatus({ ...modern, deployment: { scheduling: 'dynamic', maxBatchSize: 1 } }),
    ).toBe('queueing');
    expect(
      queueingStatus({ ...modern, deployment: { scheduling: 'dynamic', maxBatchSize: 4 } }),
    ).toBe('unknown');
    expect(queueingStatus({ ...modern, concurrency: null })).toBe('unknown');
    expect(queueingStatus({ ...modern, replicas: null })).toBe('unknown');
    expect(queueingStatus({ ...modern, replicas: null, concurrency: 1 })).toBe('unqueued');
    expect(deploymentKey({ ...base, deployment: { batchSize: null } })).toBe(deploymentKey(base));
    expect(deploymentKey({ ...base, deployment: { offload: { ditCpu: false } } })).not.toBe(
      deploymentKey(base),
    );
  });
});
