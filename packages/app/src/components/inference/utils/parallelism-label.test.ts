import { describe, expect, it } from 'vitest';

import { configSegmentLabel, parallelismLabel } from './parallelism-label';

describe('configSegmentLabel', () => {
  it('collapses symmetric tp===ep to TEP / DEP by dp-attention', () => {
    expect(configSegmentLabel(8, 8, false)).toBe('TEP8');
    expect(configSegmentLabel(8, 8, true)).toBe('DEP8');
  });

  it('uses EP / DPAEP when ep>1 and tp!==ep', () => {
    expect(configSegmentLabel(4, 16, false)).toBe('EP16');
    expect(configSegmentLabel(4, 16, true)).toBe('DPAEP16');
  });

  it('uses TP / DPATP when ep<=1 or absent', () => {
    expect(configSegmentLabel(8, 1, false)).toBe('TP8');
    expect(configSegmentLabel(8, undefined, false)).toBe('TP8');
    expect(configSegmentLabel(8, 1, true)).toBe('DPATP8');
  });
});

describe('parallelismLabel', () => {
  it('falls back to bare tp when no ep data', () => {
    expect(parallelismLabel({ tp: 8 })).toBe('8');
  });

  it('labels a single-segment config', () => {
    expect(parallelismLabel({ tp: 8, ep: 8, dpAttention: true })).toBe('DEP8');
    expect(parallelismLabel({ tp: 4, ep: 8, dpAttention: false })).toBe('EP8');
  });

  it('builds multinode-disagg per-role worker segments', () => {
    expect(
      parallelismLabel({
        tp: 8,
        ep: 4,
        disagg: true,
        isMultinode: true,
        prefillTp: 4,
        prefillEp: 4,
        prefillDpAttention: false,
        prefillNumWorkers: 2,
        decodeTp: 8,
        decodeEp: 8,
        decodeDpAttention: true,
        decodeNumWorkers: 1,
      }),
    ).toBe('2xTEP4+1xDEP8');
  });

  it('single-node disagg uses the single (decode) segment, not worker syntax', () => {
    // is_multinode false → no "NxPrefill+MxDecode" expansion.
    expect(
      parallelismLabel({ tp: 8, ep: 8, dpAttention: false, disagg: true, isMultinode: false }),
    ).toBe('TEP8');
  });
});
