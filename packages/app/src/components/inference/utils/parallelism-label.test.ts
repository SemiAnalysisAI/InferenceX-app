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

  it('appends PP suffix only when pp > 1', () => {
    expect(configSegmentLabel(8, 1, false, 2)).toBe('TP8PP2');
    expect(configSegmentLabel(8, 8, false, 2)).toBe('TEP8PP2');
    expect(configSegmentLabel(8, 8, true, 4)).toBe('DEP8PP4');
    expect(configSegmentLabel(4, 16, true, 2)).toBe('DPAEP16PP2');
  });

  it('renders no PP part when pp is 1, 0, or absent', () => {
    expect(configSegmentLabel(8, 1, false, 1)).toBe('TP8');
    expect(configSegmentLabel(8, 1, false, 0)).toBe('TP8');
    expect(configSegmentLabel(8, 1, false, undefined)).toBe('TP8');
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

  it('includes PP in a single-segment config only when > 1', () => {
    expect(parallelismLabel({ tp: 8, ep: 1, pp: 2 })).toBe('TP8PP2');
    expect(parallelismLabel({ tp: 8, ep: 1, pp: 1 })).toBe('TP8');
    expect(parallelismLabel({ tp: 8, ep: 1, pp: 0 })).toBe('TP8');
  });

  it('applies per-role PP to multinode-disagg segments', () => {
    expect(
      parallelismLabel({
        tp: 8,
        ep: 1,
        disagg: true,
        isMultinode: true,
        prefillTp: 8,
        prefillEp: 1,
        prefillPp: 2,
        prefillNumWorkers: 2,
        decodeTp: 8,
        decodeEp: 1,
        decodePp: 1,
        decodeNumWorkers: 1,
      }),
    ).toBe('2xTP8PP2+1xTP8');
  });

  it('drops the decode segment when the decode pool is absent (0 workers, tp 0)', () => {
    // Prefill-only agentic multinode runs (e.g. Kimi-K3 TP8 PP2 on b200-dgxc)
    // emit decode_num_workers=0 / decode_tp=0 — the label is just the active
    // side, without the 1x multiplier: "TP8PP2", not "1xTP8PP2+0xTP0".
    expect(
      parallelismLabel({
        tp: 0,
        ep: 0,
        disagg: true,
        isMultinode: true,
        prefillTp: 8,
        prefillEp: 1,
        prefillPp: 2,
        prefillNumWorkers: 1,
        decodeTp: 0,
        decodeEp: 0,
        decodePp: 1,
        decodeNumWorkers: 0,
      }),
    ).toBe('TP8PP2');
  });

  it('keeps the Nx multiplier on a lone segment with multiple workers', () => {
    expect(
      parallelismLabel({
        tp: 0,
        ep: 0,
        disagg: true,
        isMultinode: true,
        prefillTp: 8,
        prefillEp: 1,
        prefillPp: 2,
        prefillNumWorkers: 2,
        decodeTp: 0,
        decodeEp: 0,
        decodeNumWorkers: 0,
      }),
    ).toBe('2xTP8PP2');
  });

  it('drops the prefill segment when the prefill pool is absent', () => {
    expect(
      parallelismLabel({
        tp: 8,
        ep: 8,
        disagg: true,
        isMultinode: true,
        prefillTp: 0,
        prefillEp: 0,
        prefillNumWorkers: 0,
        decodeTp: 8,
        decodeEp: 8,
        decodeNumWorkers: 1,
      }),
    ).toBe('TEP8');
  });

  it('keeps zero-worker segments whose tp is set (pool exists, worker count unknown)', () => {
    expect(
      parallelismLabel({
        tp: 8,
        ep: 4,
        disagg: true,
        isMultinode: true,
        prefillTp: 4,
        prefillEp: 4,
        prefillNumWorkers: 0,
        decodeTp: 8,
        decodeEp: 8,
        decodeNumWorkers: 1,
      }),
    ).toBe('0xTEP4+1xTEP8');
  });
});
