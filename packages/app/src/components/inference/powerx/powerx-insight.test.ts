import { describe, expect, it } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';
import type { PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';

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
  it('charges prefill its reconstructed share of measured J per output token, not J per input token', () => {
    const insight = powerXInsight({ view: 'energy', role: 'all', points: [row(80)] });
    expect(insight?.finding).toMatchObject({ kind: 'energy', share: { prefill: 0.7 } });
  });

  it('reads the usable row nearest 80 tok/s/user, skipping clones, hidden, aggregated and incomplete rows', () => {
    const near = row(70);
    const points = [
      row(20),
      near,
      row(80, { powerVariant: { kind: 'role', id: 'prefill' } }),
      row(81, { hidden: true }),
      aggregated(80),
      row(79, { reconstructedPrefillJPerOutputToken: undefined }),
      row(400),
    ];
    const insight = powerXInsight({ view: 'energy', role: 'all', points });
    expect(insight?.point).toBe(near);
    expect(insight?.hardware).toEqual(['gb300_dynamo-sglang']);
  });

  it('scales % of TDP per pool from the pool’s average draw, on Over time too under a role', () => {
    const finding = powerXInsight({ view: 'draw', role: 'all', points: [row(80)] })?.finding;
    expect(finding).toMatchObject({
      kind: 'power',
      percentTdp: {
        prefill: expect.closeTo((57.1 * 1000) / 800),
        decode: expect.closeTo((57.1 * 700) / 800),
      },
    });
    const time = powerXInsight({ view: 'time', role: 'decode', points: [row(80)] });
    expect(time?.finding).toEqual(finding!);
  });

  it('weights the GPU layer share by each pool’s GPU count', () => {
    const finding = powerXInsight({
      view: 'where',
      role: 'all',
      points: [row(80, { utilityModeledWatts: m(1600) })],
    })?.finding;
    expect(finding).toMatchObject({
      kind: 'gpuLayer',
      facilityUplift: 2,
      share: { prefill: expect.closeTo(8000 / (8000 + 16 * 700)) },
    });
  });
});

/** A trace with one GPU row per entry, each stepping `from` → `to` W after 6 s; no role = aggregated. */
function trace(
  hwKey: string,
  rows: { role?: 'prefill' | 'decode'; from: number; to: number }[],
): PowerTimelineTrace {
  const power = rows.map(({ from, to }) =>
    Array.from({ length: 12 }, (_, t) => (t < 6 ? from : to)),
  );
  const series = {
    artifact: 'power_validation',
    startMs: 0,
    bucketSeconds: 1,
    gpus: rows.map((_, index) => index),
    t: power[0].map((_, index) => index),
    power,
    devices: rows.map(({ role }, index) => ({ id: `gpu-${index}`, role })),
  };
  const point = { hwKey, conc: 16, x: 40, y: 1, disagg: true } as InferenceData;
  return { key: hwKey, point, runId: '1', series, windowStartMs: null, windowEndMs: null };
}

describe('Over time insight under All GPUs', () => {
  it('reads the largest 5 s load swing among traces that split into prefill and decode pools', () => {
    // GB200: prefill ramps 200 → 900 W while decode holds 400 W, a 350 W mean swing (1,200 W
    // TDP). GB300 swings 150 W. MI355X swings most but runs aggregated, so it cannot split.
    const gb200 = trace('gb200_dynamo-vllm', [
      { role: 'prefill', from: 200, to: 900 },
      { role: 'decode', from: 400, to: 400 },
    ]);
    const gb300 = trace('gb300_dynamo-vllm', [
      { role: 'prefill', from: 300, to: 600 },
      { role: 'decode', from: 500, to: 500 },
    ]);
    const traces = [trace('mi355x_vllm', [{ from: 200, to: 1000 }]), gb300, gb200];
    const insight = powerXInsight({ view: 'time', role: 'all', points: [], traces });
    expect(insight?.point).toBe(gb200.point);
    expect(insight?.finding).toMatchObject({ kind: 'swing', deltaWatts: 350, tdpWatts: 1200 });
  });
});
