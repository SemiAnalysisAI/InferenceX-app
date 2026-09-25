import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { scatterPointConfigId, scatterPointJoinId } from './point-identity';

const point = (overrides: Partial<InferenceData>): InferenceData =>
  ({
    hwKey: 'h200_vllm',
    precision: 'fp8',
    tp: 8,
    conc: 32,
    ...overrides,
  }) as InferenceData;

describe('scatterPointConfigId', () => {
  it('keeps overlapping agentic MTP and standard-decoding points distinct', () => {
    const standard = scatterPointConfigId(
      point({ benchmark_type: 'agentic_traces', spec_decoding: 'none' }),
    );
    const mtp = scatterPointConfigId(
      point({ benchmark_type: 'agentic_traces', spec_decoding: 'mtp' }),
    );

    expect(standard).not.toBe(mtp);
    expect(standard).toContain('|spec-none');
    expect(mtp).toContain('|spec-mtp');
  });

  it('keeps agentic offload variants distinct alongside spec methods', () => {
    const off = scatterPointConfigId(
      point({
        benchmark_type: 'agentic_traces',
        spec_decoding: 'mtp',
        offload_mode: 'off',
      }),
    );
    const on = scatterPointConfigId(
      point({
        benchmark_type: 'agentic_traces',
        spec_decoding: 'mtp',
        offload_mode: 'on',
      }),
    );

    expect(off).not.toBe(on);
  });

  it('keeps recipe variants at the same topology and concurrency distinct', () => {
    const recipeA = scatterPointConfigId(
      point({
        recipe_fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );
    const recipeB = scatterPointConfigId(
      point({
        recipe_fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    );

    expect(recipeA).not.toBe(recipeB);
    expect(recipeA).toContain(
      '|recipe-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
  });

  it('preserves the legacy key when no recipe fingerprint exists', () => {
    expect(scatterPointConfigId(point({}))).not.toContain('|recipe-');
  });

  it('distinguishes otherwise-identical points when multiple dates render together', () => {
    const may = point({ date: '2026-05-15' });
    const june = point({ date: '2026-06-15' });
    expect(scatterPointConfigId(may)).toBe(scatterPointConfigId(june));

    expect(scatterPointJoinId(may, true)).not.toBe(scatterPointJoinId(june, true));
    expect(scatterPointJoinId(may, true)).toBe(`${scatterPointConfigId(may)}|date-2026-05-15`);
  });

  it('preserves current-run and undated identities when dates need no disambiguation', () => {
    const current = point({ date: '2026-06-15' });
    const undated = point({ date: '' });

    expect(scatterPointJoinId(current, false)).toBe(scatterPointConfigId(current));
    expect(scatterPointJoinId(undated, true)).toBe(scatterPointConfigId(undated));
  });
});
