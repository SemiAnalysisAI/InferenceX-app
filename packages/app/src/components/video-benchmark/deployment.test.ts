import { describe, expect, it } from 'vitest';
import { deploymentKey, isQueueing, layoutLabel, leadCell, sharedLayoutCells } from './deployment';
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
const options = { tier: 'h', basis: 'participating' } as const;

describe('deployment', () => {
  it('keys a deployment by boards and model split, not by concurrency', () => {
    const c4: VideoPoint = { ...base, concurrency: 4 };
    expect(deploymentKey(base)).toBe('4g:tp2:u2');
    expect(deploymentKey(c4)).toBe('4g:tp2:u2');
    expect(deploymentKey({ ...base, server: { tp: 1, ulysses: 4, attention: null } })).toBe(
      '4g:tp1:u4',
    );
    expect(deploymentKey({ ...base, participating: null, server: null })).toBe('nag:tpna:una');
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
  it('picks the layout most hardware share, falling back to the lead cell', () => {
    const b200Eight = {
      ...base,
      id: 'b8',
      hardwareKey: 'b200',
      participating: 8,
      server: { tp: 4, ulysses: 2, attention: null },
      wallSeconds: 900,
    };
    const b200Four = { ...base, id: 'b4', hardwareKey: 'b200', wallSeconds: 1500 };
    const h100Two = {
      ...base,
      id: 'h2',
      hardwareKey: 'h100',
      participating: 2,
      server: { tp: 2, ulysses: 1, attention: null },
    };
    const queued = { ...base, id: 'q', concurrency: 2 };
    // 4g:tp2:u2 is shared by h200 and b200; h100 only has a 2-GPU cell and keeps it.
    expect(
      sharedLayoutCells([base, queued, b200Eight, b200Four, h100Two]).map((p) => p.id),
    ).toEqual(['a', 'b4', 'h2']);
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
    const tie = { ...eightBoards, id: 'd', participating: 4, wallSeconds: 3000, p50: 120 };
    expect(leadCell([base, tie], 'h200', options)?.id).toBe('d');
    const noRate = { ...base, id: 'e', wallSeconds: null };
    expect(leadCell([noRate], 'h200', options)?.id).toBe('e');
  });
});
