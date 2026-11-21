import { describe, expect, it } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';

import { powerXInsight } from './powerx-insight';

const m = (y: number) => ({ y, roof: false });

function row(x: number, overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    hwKey: 'gb300_dynamo-sglang',
    model: 'kimik3.1',
    precision: 'fp4',
    conc: 64,
    x,
    y: 1,
    date: '2026-11-01',
    disagg: true,
    num_prefill_gpu: 8,
    num_decode_gpu: 16,
    measuredAvgPower: m(800),
    measuredPrefillAvgPower: m(1000),
    measuredDecodeAvgPower: m(700),
    measuredPowerPercentTdp: m(57.1),
    measuredJPerOutputToken: m(2),
    reconstructedPrefillJPerOutputToken: m(1.4),
    measuredDecodeJPerOutputToken: m(0.6),
    measuredPrefillJPerInputToken: m(0.05),
    ...overrides,
  } as InferenceData;
}

const aggregated = (x: number) =>
  row(x, {
    hwKey: 'mi355x_sglang',
    disagg: false,
    measuredPrefillAvgPower: undefined,
    measuredDecodeAvgPower: undefined,
  });

describe('powerXInsight', () => {
  it('has no finding when every visible row is aggregated', () => {
    for (const view of ['energy', 'power', 'breakdown'] as const) {
      expect(powerXInsight({ view, role: 'all', points: [aggregated(80)] })).toBeNull();
    }
  });

  it('charges prefill its reconstructed share of measured J per output token, not J per input token', () => {
    const insight = powerXInsight({ view: 'energy', role: 'all', points: [row(80)] });
    expect(insight?.finding).toMatchObject({ kind: 'energy', share: { prefill: 0.7 } });
  });

  it('reads the row nearest 80 tok/s/user, skipping role clones, hidden and aggregated rows', () => {
    const near = row(70);
    const clone = row(80, { powerVariant: { kind: 'role', id: 'prefill' } });
    const hidden = row(81, { hidden: true });
    const insight = powerXInsight({
      view: 'power',
      role: 'prefill',
      points: [row(20), near, clone, hidden, aggregated(80), row(400)],
    });
    expect(insight?.point).toBe(near);
    expect(insight?.hardware).toEqual(['gb300_dynamo-sglang']);
  });

  it('skips rows that lack the view’s figures instead of showing an empty finding', () => {
    const noEnergy = row(80, { reconstructedPrefillJPerOutputToken: undefined });
    const withEnergy = row(30);
    expect(
      powerXInsight({ view: 'energy', role: 'all', points: [noEnergy, withEnergy] })?.point,
    ).toBe(withEnergy);
  });

  it('scales % of TDP per pool from the pool’s average draw', () => {
    const finding = powerXInsight({ view: 'power', role: 'all', points: [row(80)] })?.finding;
    expect(finding?.kind).toBe('power');
    if (finding?.kind !== 'power') return;
    expect(finding.percentTdp?.prefill).toBeCloseTo((57.1 * 1000) / 800);
    expect(finding.percentTdp?.decode).toBeCloseTo((57.1 * 700) / 800);
  });

  it('weights the GPU layer share by each pool’s GPU count', () => {
    const finding = powerXInsight({
      view: 'breakdown',
      role: 'all',
      points: [row(80, { utilityModeledWatts: m(1600) })],
    })?.finding;
    expect(finding).toMatchObject({ kind: 'gpuLayer', facilityUplift: 2 });
    if (finding?.kind !== 'gpuLayer') return;
    expect(finding.share.prefill).toBeCloseTo(8000 / (8000 + 16 * 700));
  });

  it('has no All GPUs finding on Over time, but states the pool draw under a role', () => {
    expect(powerXInsight({ view: 'time', role: 'all', points: [row(80)] })).toBeNull();
    expect(powerXInsight({ view: 'time', role: 'decode', points: [row(80)] })?.finding.kind).toBe(
      'power',
    );
  });
});
