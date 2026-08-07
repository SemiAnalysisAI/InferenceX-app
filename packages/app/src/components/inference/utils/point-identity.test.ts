import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { scatterPointConfigId } from './point-identity';

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
});
