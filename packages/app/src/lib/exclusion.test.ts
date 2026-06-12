import { describe, it, expect } from 'vitest';

import { computeToggle } from '@/hooks/useTogglableSet';

import {
  buildExclusion,
  clearAllExclusionGroups,
  effectiveLegendItems,
  pickStickyGroup,
  resolveExclusionToggle,
  type ExclusionSpec,
} from './exclusion';

// The dsv4 MTP rule: `*_mtp` keys participate, dynamo-/mori- prefixes are
// stripped, and ATOM shares SGLang's comparability group.
const MTP_SPEC: ExclusionSpec[] = [
  { suffix: '_mtp', stripPrefixes: ['dynamo-', 'mori-'], groupAliases: { atom: 'sglang' } },
];
const ex = buildExclusion(MTP_SPEC);

describe('buildExclusion — familyOf', () => {
  it('returns null for non-participating keys', () => {
    expect(ex.familyOf('h100_vllm')).toBeNull();
    expect(ex.familyOf('gb300_sglang')).toBeNull();
    expect(ex.familyOf('h100')).toBeNull();
    expect(ex.familyOf('')).toBeNull();
  });

  it('extracts the literal engine family for participating keys', () => {
    expect(ex.familyOf('h100_vllm_mtp')).toBe('vllm');
    expect(ex.familyOf('gb300_sglang_mtp')).toBe('sglang');
    expect(ex.familyOf('h100_trt_mtp')).toBe('trt');
    expect(ex.familyOf('mi355x_atom_mtp')).toBe('atom');
  });

  it('strips configured engine-family prefixes', () => {
    expect(ex.familyOf('h100_dynamo-vllm_mtp')).toBe('vllm');
    expect(ex.familyOf('gb300_dynamo-sglang_mtp')).toBe('sglang');
    expect(ex.familyOf('h100_dynamo-trt_mtp')).toBe('trt');
    expect(ex.familyOf('mi355x_mori-sglang_mtp')).toBe('sglang');
  });
});

describe('buildExclusion — groupOf', () => {
  it('returns null for non-participating keys', () => {
    expect(ex.groupOf('mi355x_atom')).toBeNull();
    expect(ex.groupOf('mi355x_sglang')).toBeNull();
    expect(ex.groupOf('')).toBeNull();
  });

  it('collapses aliased families into a shared comparability group', () => {
    expect(ex.groupOf('mi355x_atom_mtp')).toBe('sglang');
    expect(ex.groupOf('mi355x_sglang_mtp')).toBe('sglang');
  });

  it('leaves other engines as their own group', () => {
    expect(ex.groupOf('mi355x_vllm_mtp')).toBe('vllm');
    expect(ex.groupOf('h100_dynamo-trt_mtp')).toBe('trt');
  });

  it('honors a custom suffix in the spec', () => {
    const eagle = buildExclusion([{ suffix: '_eagle' }]);
    expect(eagle.groupOf('h100_vllm_eagle')).toBe('vllm');
    expect(eagle.groupOf('h100_vllm_mtp')).toBeNull();
  });
});

// ATOM and SGLang share the upstream ROCm MTP path, so they belong to one
// comparability group: they may co-exist on a graph and are jointly exclusive
// with other engines (vLLM). Only enforced where the model has an exclusion rule.
describe('ATOM/SGLang comparability group', () => {
  it('treats ATOM + SGLang MTP as a single group (coexist, no drop)', () => {
    const set = new Set(['mi355x_atom_mtp', 'mi355x_sglang_mtp', 'mi355x_vllm']);
    const sticky = pickStickyGroup(set, new Set(), ex);
    expect(sticky.result).toBe(set);
    expect(sticky.droppedGroups).toEqual([]);
    expect(sticky.keptGroup).toBe('sglang');

    const cleared = clearAllExclusionGroups(set, ex);
    expect(cleared.result).toBe(set);
    expect(cleared.droppedGroups).toEqual([]);
  });

  it('keeps ATOM + SGLang exclusive from vLLM MTP', () => {
    const proposed = new Set(['mi355x_atom_mtp', 'mi355x_sglang_mtp', 'mi355x_vllm_mtp']);
    const cleared = clearAllExclusionGroups(proposed, ex);
    expect([...cleared.result]).toEqual([]);
    expect(cleared.droppedGroups.toSorted()).toEqual(['sglang', 'vllm']);
  });

  it('lets ATOM MTP coexist with SGLang MTP on toggle', () => {
    const prev = new Set(['mi355x_sglang_mtp', 'mi355x_sglang']);
    const all = new Set(['mi355x_sglang_mtp', 'mi355x_sglang', 'mi355x_atom_mtp', 'mi355x_atom']);
    expect(resolveExclusionToggle(prev, 'mi355x_atom_mtp', all, ex)).toEqual({
      kind: 'fallthrough',
    });
  });

  it('blocks vLLM MTP while ATOM MTP is active, naming ATOM as the conflict', () => {
    const prev = new Set(['mi355x_atom_mtp']);
    const all = new Set(['mi355x_atom_mtp', 'mi355x_vllm_mtp']);
    expect(resolveExclusionToggle(prev, 'mi355x_vllm_mtp', all, ex)).toEqual({
      kind: 'block',
      attempted: 'vllm',
      existing: 'atom',
    });
  });

  it('blocks ATOM MTP while vLLM MTP is active, naming vLLM as the conflict', () => {
    const prev = new Set(['mi355x_vllm_mtp']);
    const all = new Set(['mi355x_vllm_mtp', 'mi355x_atom_mtp']);
    expect(resolveExclusionToggle(prev, 'mi355x_atom_mtp', all, ex)).toEqual({
      kind: 'block',
      attempted: 'atom',
      existing: 'vllm',
    });
  });

  it('surfaces ATOM MTP in the legend universe when SGLang MTP is active', () => {
    const all = new Set([
      'mi355x_sglang',
      'mi355x_sglang_mtp',
      'mi355x_atom_mtp',
      'mi355x_vllm_mtp',
    ]);
    const active = new Set(['mi355x_sglang', 'mi355x_sglang_mtp']);
    const out = effectiveLegendItems(all, active, ex);
    // sglang_mtp active → sglang group active → atom_mtp (same group) kept,
    // vllm_mtp (different group) dropped.
    expect([...out].toSorted()).toEqual(['mi355x_atom_mtp', 'mi355x_sglang', 'mi355x_sglang_mtp']);
  });
});

describe('pickStickyGroup', () => {
  it('passes through when no participating keys present', () => {
    const set = new Set(['h100_vllm', 'gb300_sglang']);
    const out = pickStickyGroup(set, new Set(), ex);
    expect(out.result).toBe(set);
    expect(out.droppedGroups).toEqual([]);
    expect(out.keptGroup).toBeNull();
  });

  it('passes through when only one group present', () => {
    const set = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'gb300_sglang']);
    const out = pickStickyGroup(set, new Set(), ex);
    expect(out.result).toBe(set);
    expect(out.droppedGroups).toEqual([]);
    expect(out.keptGroup).toBe('vllm');
  });

  it('drops the non-sticky group when prev had one', () => {
    const proposed = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp', 'h100_vllm']);
    const prev = new Set(['h100_vllm_mtp']);
    const out = pickStickyGroup(proposed, prev, ex);
    expect(out.keptGroup).toBe('vllm');
    expect([...out.result].toSorted()).toEqual(['h100_vllm', 'h100_vllm_mtp']);
    expect(out.droppedGroups).toEqual(['sglang']);
  });

  it('falls back to alphabetical when neither group was in prev', () => {
    const proposed = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp']);
    const out = pickStickyGroup(proposed, new Set(), ex);
    expect(out.keptGroup).toBe('sglang');
    expect([...out.result]).toEqual(['gb300_sglang_mtp']);
    expect(out.droppedGroups).toEqual(['vllm']);
  });

  it('treats dynamo/mori variants as the same group', () => {
    const proposed = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'gb300_dynamo-sglang_mtp']);
    const out = pickStickyGroup(proposed, new Set(['h100_vllm_mtp']), ex);
    expect(out.keptGroup).toBe('vllm');
    expect([...out.result].toSorted()).toEqual(['h100_dynamo-vllm_mtp', 'h100_vllm_mtp']);
    expect(out.droppedGroups).toEqual(['sglang']);
  });
});

describe('clearAllExclusionGroups', () => {
  it('passes through when no participating keys present', () => {
    const set = new Set(['h100_vllm', 'gb300_sglang']);
    const out = clearAllExclusionGroups(set, ex);
    expect(out.result).toBe(set);
    expect(out.droppedGroups).toEqual([]);
  });

  it('passes through when only one group present', () => {
    const set = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'h100_vllm']);
    const out = clearAllExclusionGroups(set, ex);
    expect(out.result).toBe(set);
    expect(out.droppedGroups).toEqual([]);
  });

  it('drops every group when multiple are present', () => {
    const proposed = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp', 'h100_vllm', 'gb300_sglang']);
    const out = clearAllExclusionGroups(proposed, ex);
    expect([...out.result].toSorted()).toEqual(['gb300_sglang', 'h100_vllm']);
    expect(out.droppedGroups.toSorted()).toEqual(['sglang', 'vllm']);
  });
});

describe('effectiveLegendItems', () => {
  it('returns the input set unchanged when no participating keys present', () => {
    const all = new Set(['h100_vllm', 'gb300_sglang']);
    const active = new Set(['h100_vllm']);
    const out = effectiveLegendItems(all, active, ex);
    expect([...out].toSorted()).toEqual(['gb300_sglang', 'h100_vllm']);
  });

  it('drops participating keys whose group is not active (default DSv4 state)', () => {
    const all = new Set(['h100_vllm', 'gb300_sglang', 'h100_vllm_mtp', 'gb300_sglang_mtp']);
    const active = new Set(['h100_vllm', 'gb300_sglang']); // no MTP active
    const out = effectiveLegendItems(all, active, ex);
    expect([...out].toSorted()).toEqual(['gb300_sglang', 'h100_vllm']);
  });

  it('keeps participating keys for active groups and drops the rest', () => {
    const all = new Set([
      'h100_vllm',
      'gb300_sglang',
      'h100_vllm_mtp',
      'h200_vllm_mtp',
      'gb300_sglang_mtp',
    ]);
    const active = new Set(['h100_vllm', 'gb300_sglang', 'h100_vllm_mtp']);
    const out = effectiveLegendItems(all, active, ex);
    expect([...out].toSorted()).toEqual([
      'gb300_sglang',
      'h100_vllm',
      'h100_vllm_mtp',
      'h200_vllm_mtp',
    ]);
  });

  it('treats dynamo-/mori- variants as the same group', () => {
    const all = new Set(['h100_vllm', 'h100_dynamo-vllm_mtp', 'h100_vllm_mtp', 'h100_sglang_mtp']);
    const active = new Set(['h100_vllm', 'h100_vllm_mtp']);
    const out = effectiveLegendItems(all, active, ex);
    expect([...out].toSorted()).toEqual(['h100_dynamo-vllm_mtp', 'h100_vllm', 'h100_vllm_mtp']);
  });

  it('makes computeToggle solo on click in the default-deselected state', () => {
    // Default DSv4 state: all non-MTP active, MTP keys exist in data but
    // are deselected. The effective universe matches active → computeToggle
    // soloes the clicked item.
    const all = new Set(['h100_vllm', 'gb300_sglang', 'h100_vllm_mtp', 'gb300_sglang_mtp']);
    const active = new Set(['h100_vllm', 'gb300_sglang']);
    const effective = effectiveLegendItems(all, active, ex);
    const out = computeToggle(active, 'h100_vllm', effective);
    expect(out).toEqual(new Set(['h100_vllm']));
  });
});

describe('resolveExclusionToggle', () => {
  it('falls through for non-participating toggles', () => {
    const prev = new Set(['h100_vllm']);
    const all = new Set(['h100_vllm', 'gb300_sglang']);
    expect(resolveExclusionToggle(prev, 'gb300_sglang', all, ex)).toEqual({ kind: 'fallthrough' });
  });

  it('falls through when adding the only group already active', () => {
    const prev = new Set(['h100_vllm_mtp']);
    const all = new Set(['h100_vllm_mtp', 'h100_dynamo-vllm_mtp', 'h100_vllm']);
    expect(resolveExclusionToggle(prev, 'h100_dynamo-vllm_mtp', all, ex)).toEqual({
      kind: 'fallthrough',
    });
  });

  it('blocks adding a key whose group conflicts with the existing one', () => {
    const prev = new Set(['h100_vllm_mtp']);
    const all = new Set(['h100_vllm_mtp', 'gb300_sglang_mtp']);
    expect(resolveExclusionToggle(prev, 'gb300_sglang_mtp', all, ex)).toEqual({
      kind: 'block',
      attempted: 'sglang',
      existing: 'vllm',
    });
  });

  it('silent-disable-all when solo→restore would surface multiple groups', () => {
    // prev is a single non-MTP item; toggling it triggers "restore all", which
    // would surface all items including two groups.
    const prev = new Set(['h100_vllm']);
    const all = new Set(['h100_vllm', 'h100_vllm_mtp', 'gb300_sglang_mtp']);
    const decision = resolveExclusionToggle(prev, 'h100_vllm', all, ex);
    expect(decision.kind).toBe('silent-disable-all');
    if (decision.kind !== 'silent-disable-all') return;
    expect([...decision.result].toSorted()).toEqual(['h100_vllm']);
  });

  it('falls through when removing a participating key (no add, no surfaced groups)', () => {
    const prev = new Set(['h100_vllm_mtp', 'h100_vllm']);
    const all = new Set(['h100_vllm_mtp', 'h100_vllm']);
    expect(resolveExclusionToggle(prev, 'h100_vllm_mtp', all, ex)).toEqual({ kind: 'fallthrough' });
  });
});
