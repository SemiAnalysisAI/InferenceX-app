import { describe, it, expect } from 'vitest';

import { computeToggle } from '@/hooks/useTogglableSet';

import {
  buildExclusion,
  clearAllExclusionGroups,
  effectiveLegendItems,
  exclusionResolutionFamilies,
  pickStickyGroup,
  resolveExclusionGroups,
  resolveExclusionToggle,
  type ExclusionSpec,
} from './exclusion';

// The dsv4 MTP rule: `*_mtp` keys participate, dynamo-/mori- prefixes are
// stripped, and ATOM shares SGLang's comparability group.
const MTP_SPEC: ExclusionSpec[] = [
  {
    suffix: '_mtp',
    stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
    groupAliases: { atom: 'sglang' },
  },
];
const ex = buildExclusion(MTP_SPEC);
const STP_SPEC: ExclusionSpec[] = [
  {
    suffix: null,
    stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
    groupAliases: { atom: 'sglang' },
    scope: 'hardware',
  },
];
const agenticEx = buildExclusion([...MTP_SPEC, ...STP_SPEC]);
const namespacedAgenticEx = {
  familyOf: (key: string) =>
    agenticEx.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
  groupOf: (key: string) =>
    agenticEx.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
  scopesOf: (key: string) =>
    agenticEx.scopesOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
};

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
    expect(ex.familyOf('b300_llmd-vllm_mtp')).toBe('vllm');
    expect(ex.familyOf('mi355x_mooncake-atom_mtp')).toBe('atom');
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

describe('exclusionResolutionFamilies', () => {
  it('reports literal aliased families rather than comparability group ids', () => {
    const proposed = new Set(['mi355x_atom_mtp', 'gb300_sglang_mtp', 'h100_vllm_mtp', 'h100_vllm']);
    const result = new Set(['mi355x_atom_mtp', 'gb300_sglang_mtp', 'h100_vllm']);

    expect(exclusionResolutionFamilies(proposed, result, ex)).toEqual({
      kept: ['atom', 'sglang'],
      dropped: ['vllm'],
      partial: [],
    });
  });

  it('reports families retained only on other hardware scopes as partial', () => {
    const proposed = new Set(['b200_vllm', 'b200_sglang', 'mi355x_sglang']);
    const result = new Set(['b200_vllm', 'mi355x_sglang']);

    expect(exclusionResolutionFamilies(proposed, result, agenticEx)).toEqual({
      kept: ['vllm'],
      dropped: [],
      partial: ['sglang'],
    });
  });
});

describe('AgentX STP engine exclusion', () => {
  it('classifies unsuffixed STP keys without capturing speculative variants', () => {
    const stpEx = buildExclusion(STP_SPEC);
    expect(stpEx.familyOf('b300_vllm')).toBe('vllm');
    expect(stpEx.familyOf('gb300_dynamo-sglang')).toBe('sglang');
    expect(stpEx.groupOf('mi355x_atom')).toBe('sglang');
    expect(stpEx.familyOf('b300_vllm_mtp')).toBeNull();
    expect(stpEx.familyOf('b300_llmd-vllm')).toBe('vllm');
    expect(stpEx.groupOf('mi355x_mooncake-atom')).toBe('sglang');
  });

  it('blocks adding vLLM STP while SGLang STP is active', () => {
    const prev = new Set(['b300_sglang']);
    const all = new Set(['b300_sglang', 'b300_vllm']);
    expect(resolveExclusionToggle(prev, 'b300_vllm', all, agenticEx, 'keep-sticky')).toEqual({
      kind: 'block',
      attempted: 'vllm',
      existing: 'sglang',
    });
  });

  it('allows different engine families on different hardware SKUs', () => {
    const prev = new Set(['b200_sglang']);
    const all = new Set(['b200_sglang', 'mi355x_vllm']);
    expect(resolveExclusionToggle(prev, 'mi355x_vllm', all, agenticEx, 'keep-sticky')).toEqual({
      kind: 'fallthrough',
    });
  });

  it('allows STP and MTP configs from the same engine family', () => {
    const prev = new Set(['b300_vllm']);
    const all = new Set(['b300_vllm', 'b300_vllm_mtp']);
    expect(resolveExclusionToggle(prev, 'b300_vllm_mtp', all, agenticEx, 'keep-sticky')).toEqual({
      kind: 'fallthrough',
    });
  });

  it('blocks cross-engine STP and MTP configs on the same hardware SKU', () => {
    const prev = new Set(['b300_sglang']);
    const all = new Set(['b300_sglang', 'b300_vllm_mtp']);
    expect(resolveExclusionToggle(prev, 'b300_vllm_mtp', all, agenticEx, 'keep-sticky')).toEqual({
      kind: 'block',
      attempted: 'vllm',
      existing: 'sglang',
    });
  });

  it('keeps the active engine during automatic AgentX selection resolution', () => {
    const proposed = new Set(['b300_sglang', 'b300_vllm', 'b300_vllm_mtp']);
    const resolved = resolveExclusionGroups(
      proposed,
      new Set(['b300_vllm']),
      agenticEx,
      'keep-sticky',
    );
    expect([...resolved.result].toSorted()).toEqual(['b300_vllm', 'b300_vllm_mtp']);
    expect(resolved.keptGroup).toBe('vllm');
    expect(resolved.droppedGroups).toEqual(['sglang']);
  });

  it('uses hardware STP state to choose the compatible global MTP engine', () => {
    const proposed = new Set(['b200_vllm', 'b200_vllm_mtp', 'mi355x_sglang_mtp']);
    const resolved = resolveExclusionGroups(
      proposed,
      new Set(['b200_vllm']),
      agenticEx,
      'keep-sticky',
    );

    expect(resolved.result).toEqual(new Set(['b200_vllm', 'b200_vllm_mtp']));
    expect(resolved.keptGroup).toBe('vllm');
    expect(resolved.droppedGroups).toEqual(['sglang']);
  });

  it.each([
    ['SGLang MTP first', ['b200_sglang', 'mi355x_vllm', 'b200_sglang_mtp', 'mi355x_vllm_mtp']],
    ['vLLM MTP first', ['b200_sglang', 'mi355x_vllm', 'mi355x_vllm_mtp', 'b200_sglang_mtp']],
  ])('breaks multiple correlated MTP ties alphabetically with %s', (_label, keys) => {
    const resolved = resolveExclusionGroups(
      new Set(keys),
      new Set(['b200_sglang', 'mi355x_vllm']),
      agenticEx,
      'keep-sticky',
    );

    expect(resolved.result).toEqual(new Set(['b200_sglang', 'mi355x_vllm', 'b200_sglang_mtp']));
    expect(resolved.keptGroup).toBe('sglang');
    expect(resolved.droppedGroups).toEqual(['vllm']);
  });

  it('blocks cross-engine adds across official and overlay namespaces', () => {
    const prev = new Set(['overlay:b300_sglang']);
    const all = new Set(['overlay:b300_sglang', 'b300_vllm']);
    expect(
      resolveExclusionToggle(prev, 'b300_vllm', all, namespacedAgenticEx, 'keep-sticky'),
    ).toEqual({
      kind: 'block',
      attempted: 'vllm',
      existing: 'sglang',
    });
  });

  it('keeps whichever engine family the sticky set names when a load conflicts', () => {
    const proposed = new Set(['b300_sglang', 'overlay:b300_vllm']);

    // Official-sticky prev: the official engine wins, overlay dropped.
    const officialSticky = resolveExclusionGroups(
      proposed,
      new Set(['b300_sglang']),
      namespacedAgenticEx,
      'keep-sticky',
    );
    expect([...officialSticky.result]).toEqual(['b300_sglang']);
    expect(officialSticky.keptGroup).toBe('sglang');
    expect(officialSticky.droppedGroups).toEqual(['vllm']);

    // Overlay-sticky prev (what ScatterGraph passes while an unofficial run is
    // loaded): the run's engine wins and the official series is dropped.
    const overlaySticky = resolveExclusionGroups(
      proposed,
      new Set(['overlay:b300_vllm']),
      namespacedAgenticEx,
      'keep-sticky',
    );
    expect([...overlaySticky.result]).toEqual(['overlay:b300_vllm']);
    expect(overlaySticky.keptGroup).toBe('vllm');
    expect(overlaySticky.droppedGroups).toEqual(['sglang']);
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

  it('keeps idle hardware scopes in the restore-all universe', () => {
    const all = new Set(['b200_sglang', 'b200_vllm', 'mi355x_vllm']);
    const active = new Set(['b200_sglang']);
    const effective = effectiveLegendItems(all, active, agenticEx);

    expect(effective).toEqual(new Set(['b200_sglang', 'mi355x_vllm']));
    expect(computeToggle(active, 'b200_sglang', effective)).toEqual(effective);
  });

  it('restores the remembered engine for a temporarily idle hardware scope', () => {
    const all = new Set(['b200_sglang', 'mi355x_sglang', 'mi355x_vllm']);
    const preferred = new Set(['b200_sglang', 'mi355x_vllm']);
    const initialUniverse = effectiveLegendItems(all, preferred, agenticEx, preferred);
    const solo = computeToggle(preferred, 'b200_sglang', initialUniverse);
    const restoreUniverse = effectiveLegendItems(all, solo, agenticEx, preferred);

    expect(solo).toEqual(new Set(['b200_sglang']));
    expect(restoreUniverse).toEqual(preferred);
    expect(computeToggle(solo, 'b200_sglang', restoreUniverse)).toEqual(preferred);
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

  it('silently resolves when solo→restore would surface multiple groups', () => {
    // prev is a single non-MTP item; toggling it triggers "restore all", which
    // would surface all items including two groups.
    const prev = new Set(['h100_vllm']);
    const all = new Set(['h100_vllm', 'h100_vllm_mtp', 'gb300_sglang_mtp']);
    const decision = resolveExclusionToggle(prev, 'h100_vllm', all, ex);
    expect(decision.kind).toBe('silent-resolve');
    if (decision.kind !== 'silent-resolve') return;
    expect([...decision.result].toSorted()).toEqual(['h100_vllm']);
  });

  it('falls through when removing a participating key (no add, no surfaced groups)', () => {
    const prev = new Set(['h100_vllm_mtp', 'h100_vllm']);
    const all = new Set(['h100_vllm_mtp', 'h100_vllm']);
    expect(resolveExclusionToggle(prev, 'h100_vllm_mtp', all, ex)).toEqual({ kind: 'fallthrough' });
  });
});
