import { describe, expect, it } from 'vitest';

import { speculativeDecodingLabel } from './speculative-decoding';

describe('speculativeDecodingLabel', () => {
  it('returns null when speculative decoding is off', () => {
    expect(speculativeDecodingLabel({ method: 'none' }, undefined, 'en')).toBeNull();
    expect(speculativeDecodingLabel({ method: '' }, undefined, 'en')).toBeNull();
    expect(speculativeDecodingLabel({ method: undefined }, undefined, 'en')).toBeNull();
  });

  it('falls back to the method label when no algorithm was recorded', () => {
    expect(speculativeDecodingLabel({ method: 'mtp' }, undefined, 'en')).toBe('MTP');
    expect(
      speculativeDecodingLabel({ method: 'draft_model', algorithm: null }, undefined, 'en'),
    ).toBe('Draft model');
    expect(speculativeDecodingLabel({ method: 'mtp' }, 'Kimi-K3', 'en')).toBe('DSpark');
  });

  it('names the algorithm and the draft model it ran with', () => {
    expect(
      speculativeDecodingLabel(
        {
          method: 'draft_model',
          algorithm: 'dflash',
          draftModel: 'RadixArk/Muse-Spark-Open-DFlash2',
        },
        undefined,
        'en',
      ),
    ).toBe('DFlash (RadixArk/Muse-Spark-Open-DFlash2)');
    expect(speculativeDecodingLabel({ method: 'mtp', algorithm: 'medusa' }, undefined, 'en')).toBe(
      'MEDUSA (native)',
    );
  });

  it('localizes built-in draft heads', () => {
    for (const draftModel of ['native', null, undefined]) {
      expect(
        speculativeDecodingLabel({ method: 'mtp', algorithm: 'mtp', draftModel }, undefined, 'en'),
      ).toBe('MTP (native)');
      expect(
        speculativeDecodingLabel({ method: 'mtp', algorithm: 'mtp', draftModel }, undefined, 'zh'),
      ).toBe('MTP (原生)');
    }
  });
});
