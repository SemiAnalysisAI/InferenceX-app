import { describe, it, expect } from 'vitest';

import {
  clearAllMtpFamilies,
  getMtpEngineFamily,
  pickStickyMtpFamily,
  resolveMtpToggle,
} from './mtp-exclusion';

describe('getMtpEngineFamily', () => {
  it('returns null for non-MTP keys', () => {
    expect(getMtpEngineFamily('h100_vllm')).toBeNull();
    expect(getMtpEngineFamily('gb300_sglang')).toBeNull();
    expect(getMtpEngineFamily('h100')).toBeNull();
    expect(getMtpEngineFamily('')).toBeNull();
  });

  it('extracts the framework segment for MTP keys', () => {
    expect(getMtpEngineFamily('h100_vllm_mtp')).toBe('vllm');
    expect(getMtpEngineFamily('gb300_sglang_mtp')).toBe('sglang');
    expect(getMtpEngineFamily('h100_trt_mtp')).toBe('trt');
  });

  it('strips dynamo- and mori- engine-family prefixes', () => {
    expect(getMtpEngineFamily('h100_dynamo-vllm_mtp')).toBe('vllm');
    expect(getMtpEngineFamily('gb300_dynamo-sglang_mtp')).toBe('sglang');
    expect(getMtpEngineFamily('h100_dynamo-trt_mtp')).toBe('trt');
    expect(getMtpEngineFamily('mi355x_mori-sglang_mtp')).toBe('sglang');
  });
});

describe('pickStickyMtpFamily', () => {
  it('passes through when no MTP keys present', () => {
    const set = new Set(['h100_vllm', 'gb300_sglang']);
    const out = pickStickyMtpFamily(set, new Set());
    expect(out.result).toBe(set);
    expect(out.droppedFamilies).toEqual([]);
    expect(out.keptFamily).toBeNull();
  });

  it('passes through when only one MTP family present', () => {
    const set = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'gb300_sglang']);
    const out = pickStickyMtpFamily(set, new Set());
    expect(out.result).toBe(set);
    expect(out.droppedFamilies).toEqual([]);
    expect(out.keptFamily).toBe('vllm');
  });

  it('drops the non-sticky family when prev had one', () => {
    const proposed = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp', 'h100_vllm']);
    const prev = new Set(['h100_vllm_mtp']);
    const out = pickStickyMtpFamily(proposed, prev);
    expect(out.keptFamily).toBe('vllm');
    expect([...out.result].toSorted()).toEqual(['h100_vllm', 'h100_vllm_mtp']);
    expect(out.droppedFamilies).toEqual(['sglang']);
  });

  it('falls back to alphabetical when neither family was in prev', () => {
    const proposed = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp']);
    const out = pickStickyMtpFamily(proposed, new Set());
    expect(out.keptFamily).toBe('sglang');
    expect([...out.result]).toEqual(['gb300_sglang_mtp']);
    expect(out.droppedFamilies).toEqual(['vllm']);
  });

  it('treats dynamo/mori variants as the same family', () => {
    const proposed = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'gb300_dynamo-sglang_mtp']);
    const out = pickStickyMtpFamily(proposed, new Set(['h100_vllm_mtp']));
    expect(out.keptFamily).toBe('vllm');
    expect([...out.result].toSorted()).toEqual(['h100_dynamo-vllm_mtp', 'h100_vllm_mtp']);
    expect(out.droppedFamilies).toEqual(['sglang']);
  });
});

describe('clearAllMtpFamilies', () => {
  it('passes through when no MTP keys present', () => {
    const set = new Set(['h100_vllm', 'gb300_sglang']);
    const out = clearAllMtpFamilies(set);
    expect(out.result).toBe(set);
    expect(out.droppedFamilies).toEqual([]);
  });

  it('passes through when only one MTP family present', () => {
    const set = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'h100_vllm']);
    const out = clearAllMtpFamilies(set);
    expect(out.result).toBe(set);
    expect(out.droppedFamilies).toEqual([]);
  });

  it('drops every MTP family when multiple are present', () => {
    const proposed = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp', 'h100_vllm', 'gb300_sglang']);
    const out = clearAllMtpFamilies(proposed);
    expect([...out.result].toSorted()).toEqual(['gb300_sglang', 'h100_vllm']);
    expect(out.droppedFamilies.toSorted()).toEqual(['sglang', 'vllm']);
  });
});

describe('resolveMtpToggle', () => {
  it('falls through for non-MTP toggles', () => {
    const prev = new Set(['h100_vllm']);
    const all = new Set(['h100_vllm', 'gb300_sglang']);
    expect(resolveMtpToggle(prev, 'gb300_sglang', all)).toEqual({ kind: 'fallthrough' });
  });

  it('falls through when adding the only MTP family already active', () => {
    const prev = new Set(['h100_vllm_mtp']);
    const all = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'h100_vllm']);
    expect(resolveMtpToggle(prev, 'h100_dynamo-vllm_mtp', all)).toEqual({ kind: 'fallthrough' });
  });

  it('blocks adding an MTP key whose family conflicts with the existing one', () => {
    const prev = new Set(['h100_vllm_mtp']);
    const all = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp']);
    expect(resolveMtpToggle(prev, 'gb300_sglang_mtp', all)).toEqual({
      kind: 'block',
      attempted: 'sglang',
      existing: 'vllm',
    });
  });

  it('silent-disable-all when solo→restore would surface multiple MTP families', () => {
    // prev is a single non-MTP item; toggling it triggers "restore all", which
    // would surface all items including two MTP families.
    const prev = new Set(['h100_vllm']);
    const all = new Set(['h100_vllm', 'h100_vllm_mtp', 'gb300_sglang_mtp']);
    const decision = resolveMtpToggle(prev, 'h100_vllm', all);
    expect(decision.kind).toBe('silent-disable-all');
    if (decision.kind !== 'silent-disable-all') return;
    expect([...decision.result].toSorted()).toEqual(['h100_vllm']);
  });

  it('falls through when removing an MTP key (no add, no surfaced families)', () => {
    const prev = new Set(['h100_vllm_mtp', 'h100_vllm']);
    const all = new Set(['h100_vllm_mtp', 'h100_vllm']);
    expect(resolveMtpToggle(prev, 'h100_vllm_mtp', all)).toEqual({ kind: 'fallthrough' });
  });
});
