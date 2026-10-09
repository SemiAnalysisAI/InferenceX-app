import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { pointTopologyKey, topologyLabel } from './topology-filter';

describe('topologyLabel', () => {
  it('spells out offload modes beside compact parallelism tokens', () => {
    const base = { physicalChips: 8, decode_tp: 8, decode_ep: 1, offload_mode: 'off' };
    const keys = [base, { ...base, offload_mode: 'on' }].map((point) =>
      pointTopologyKey(point as InferenceData),
    );
    expect(keys.map((key) => topologyLabel(key, 'en', keys))).toEqual([
      'Single-node · GPU8 · TP8 · EP1 · offload off',
      'Single-node · GPU8 · TP8 · EP1 · offload on',
    ]);
  });
});
