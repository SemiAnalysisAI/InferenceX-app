import { describe, expect, it } from 'vitest';

import { resolveExclusionGroups, resolveExclusionToggle } from '@/lib/exclusion';
import { Model, Sequence } from '@/lib/data-mappings';

import {
  comparisonDefaultGroup,
  comparisonExclusion,
  comparisonExclusionPolicy,
} from './comparison-exclusion';

describe('comparisonExclusion', () => {
  it('defaults official DeepSeek V4 Pro Agentic charts to vLLM', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false)!;
    const fallbackGroup = comparisonDefaultGroup(Sequence.AgenticTraces, false);
    const resolved = resolveExclusionGroups(
      new Set(['b200_sglang', 'b200_vllm']),
      new Set(),
      exclusion,
      'keep-sticky',
      fallbackGroup,
    );

    expect(fallbackGroup).toBe('vllm');
    expect(resolved.result).toEqual(new Set(['b200_vllm']));
    expect(resolved.droppedGroups).toEqual(['sglang']);
  });

  it('keeps the vLLM default when arriving from an unrestricted chart', () => {
    // 1K/1K leaves per-hardware STP keys unrestricted, so both engines are active
    // before the user picks Agentic Traces. That prior selection names both groups
    // and must not out-vote the chart's vLLM default.
    const fixedSeqSelection = new Set([
      'b200_sglang',
      'b200_vllm',
      'b300_sglang',
      'b300_vllm',
      'gb300_dynamo-sglang',
      'gb300_dynamo-vllm',
    ]);
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false)!;
    const resolved = resolveExclusionGroups(
      new Set([
        'b200_sglang',
        'b200_vllm',
        'b200_vllm_mtp',
        'b300_sglang',
        'b300_vllm',
        'b300_vllm_mtp',
        'gb300_dynamo-sglang_mtp',
        'gb300_dynamo-vllm_mtp',
      ]),
      fixedSeqSelection,
      exclusion,
      'keep-sticky',
      comparisonDefaultGroup(Sequence.AgenticTraces, false),
    );

    expect([...resolved.result].toSorted()).toEqual([
      'b200_vllm',
      'b200_vllm_mtp',
      'b300_vllm',
      'b300_vllm_mtp',
      'gb300_dynamo-vllm_mtp',
    ]);
    expect(resolved.droppedGroups).toEqual(['sglang']);
  });

  it('still honors an SGLang-only selection carried into the Agentic chart', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false)!;
    const resolved = resolveExclusionGroups(
      new Set(['b200_sglang', 'b200_vllm', 'b200_vllm_mtp']),
      new Set(['b200_sglang']),
      exclusion,
      'keep-sticky',
      comparisonDefaultGroup(Sequence.AgenticTraces, false),
    );

    expect([...resolved.result]).toEqual(['b200_sglang']);
    expect(resolved.droppedGroups).toEqual(['vllm']);
  });

  it.each([
    { name: 'the 8K/1K chart', sequence: Sequence.EightK_OneK, isUnofficialRun: false },
    { name: 'the Agentic chart', sequence: Sequence.AgenticTraces, isUnofficialRun: false },
  ])('defaults $name to vLLM', ({ sequence, isUnofficialRun }) => {
    expect(comparisonDefaultGroup(sequence, isUnofficialRun)).toBe('vllm');
    expect(comparisonExclusionPolicy(sequence)).toBe('keep-sticky');
  });

  it.each([
    {
      name: 'a deprecated fixed sequence',
      sequence: Sequence.OneK_OneK,
      isUnofficialRun: false,
    },
    {
      name: 'an unofficial 8K/1K preview',
      sequence: Sequence.EightK_OneK,
      isUnofficialRun: true,
    },
    {
      name: 'an unofficial Agentic preview',
      sequence: Sequence.AgenticTraces,
      isUnofficialRun: true,
    },
  ])('does not impose the vLLM default on $name', ({ sequence, isUnofficialRun }) => {
    expect(comparisonDefaultGroup(sequence, isUnofficialRun)).toBeNull();
  });

  it('leaves deprecated fixed sequences on the clear-all policy', () => {
    expect(comparisonExclusionPolicy(Sequence.OneK_OneK)).toBe('clear-all');
    expect(comparisonExclusionPolicy(Sequence.OneK_EightK)).toBe('clear-all');
  });

  it('defaults an official 8K/1K chart to vLLM per hardware SKU', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, false)!;
    const resolved = resolveExclusionGroups(
      new Set([
        'b200_sglang',
        'b200_vllm',
        'b200_trt',
        'b200_trt_mtp',
        'mi355x_atom',
        'mi355x_atom_mtp',
        'mi355x_sglang',
        'mi355x_vllm',
        'mi355x_vllm_mtp',
      ]),
      new Set(),
      exclusion,
      comparisonExclusionPolicy(Sequence.EightK_OneK),
      comparisonDefaultGroup(Sequence.EightK_OneK, false),
    );

    // TRTLLM and ATOM sit outside the 8K/1K rules entirely — standard-token and
    // MTP alike — so they survive next to the kept vLLM configs. Only SGLang,
    // the one other guarded family, is dropped.
    expect([...resolved.result].toSorted()).toEqual([
      'b200_trt',
      'b200_trt_mtp',
      'b200_vllm',
      'mi355x_atom',
      'mi355x_atom_mtp',
      'mi355x_vllm',
      'mi355x_vllm_mtp',
    ]);
    expect(resolved.droppedGroups).toEqual(['sglang']);
  });

  it('keeps a per-SKU SGLang choice on the 8K/1K chart', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, false)!;
    const resolved = resolveExclusionGroups(
      new Set(['b200_sglang', 'b200_vllm', 'mi355x_sglang', 'mi355x_vllm']),
      new Set(['b200_sglang', 'mi355x_vllm']),
      exclusion,
      comparisonExclusionPolicy(Sequence.EightK_OneK),
      comparisonDefaultGroup(Sequence.EightK_OneK, false),
    );

    expect([...resolved.result].toSorted()).toEqual(['b200_sglang', 'mi355x_vllm']);
  });

  it.each([
    'b200_trt',
    'b200_trt_mtp',
    'gb300_dynamo-trt',
    'gb300_dynamo-trt_mtp',
    'mi355x_atom',
    'mi355x_atom_mtp',
    'mi355x_mooncake-atom',
    'mi355x_mooncake-atom_mtp',
  ])('leaves %s unguarded on the 8K/1K chart', (key) => {
    // Only vLLM and SGLang are guarded here, on standard-token and MTP alike.
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, false)!;

    expect(exclusion.familyOf(key)).toBeNull();
    expect(exclusion.groupOf(key)).toBeNull();
    expect(exclusion.scopesOf(key)).toEqual([]);
  });

  // ATOM and TRTLLM sit outside the guarded families on both scenarios, so they
  // do not participate at all and stay comparable with every other engine.
  it.each([Sequence.AgenticTraces, Sequence.EightK_OneK])(
    'leaves ATOM and TRTLLM unguarded on %s',
    (sequence) => {
      const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, sequence, false)!;

      expect(exclusion.groupOf('mi355x_atom')).toBeNull();
      expect(exclusion.groupOf('mi355x_atom_mtp')).toBeNull();
      expect(exclusion.groupOf('b200_trt')).toBeNull();
      expect(exclusion.groupOf('b200_trt_mtp')).toBeNull();
    },
  );

  it.each([Sequence.AgenticTraces, Sequence.EightK_OneK])(
    'guards only the literal vLLM and SGLang families on %s',
    (sequence) => {
      const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, sequence, false)!;

      expect(exclusion.groupOf('b200_vllm')).toBe('vllm');
      expect(exclusion.groupOf('gb300_dynamo-vllm')).toBe('vllm');
      expect(exclusion.groupOf('gb200_llmd-vllm')).toBe('vllm');
      expect(exclusion.groupOf('b200_sglang')).toBe('sglang');
      expect(exclusion.groupOf('gb300_dynamo-sglang')).toBe('sglang');
      expect(exclusion.groupOf('mi355x_mori-sglang')).toBe('sglang');
    },
  );

  // The guard exists to stop two engines being read off one SKU's curve, so
  // every participating key is scoped to its own hardware and never globally.
  it.each([Sequence.AgenticTraces, Sequence.EightK_OneK, Sequence.OneK_OneK])(
    'scopes both standard-token and MTP guards to a single SKU on %s',
    (sequence) => {
      const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, sequence, false)!;

      for (const key of ['b200_vllm', 'b200_vllm_mtp', 'b200_sglang', 'b200_sglang_mtp']) {
        const scopes = exclusion.scopesOf(key);
        if (scopes.length === 0) continue; // key not guarded on this scenario
        expect(scopes).toEqual(['b200']);
      }
    },
  );

  it('keeps the engine-family guard for official Agentic Traces charts', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false);

    expect(exclusion?.familyOf('b200_vllm')).toBe('vllm');
    expect(exclusion?.familyOf('b200_sglang')).toBe('sglang');
  });

  it('allows the exact Overview history pair without changing normal dashboard guards', () => {
    expect(
      comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, false, true),
    ).toBeNull();
    expect(
      comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, false, false),
    ).not.toBeNull();
  });

  it.each([
    {
      name: 'blocks Agentic STP engines on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'b200_vllm',
      expected: 'block',
    },
    {
      name: 'allows Agentic STP engines on different SKUs',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'mi355x_vllm',
      expected: 'fallthrough',
    },
    {
      name: 'blocks Agentic MTP added to cross-engine STP on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'b200_vllm_mtp',
      expected: 'block',
    },
    {
      name: 'blocks Agentic STP added to cross-engine MTP on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_vllm_mtp',
      candidate: 'b200_sglang',
      expected: 'block',
    },
    {
      name: 'allows Agentic STP and MTP engines on different SKUs',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'mi355x_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows Agentic STP and MTP from the same engine',
      sequence: Sequence.AgenticTraces,
      active: 'b200_vllm',
      candidate: 'b200_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'blocks Agentic cross-engine MTP on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang_mtp',
      candidate: 'b200_vllm_mtp',
      expected: 'block',
    },
    {
      name: 'blocks 8K/1K STP engines on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang',
      candidate: 'b200_vllm',
      expected: 'block',
    },
    {
      name: 'blocks 8K/1K STP engines behind a deployment prefix on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'gb300_dynamo-sglang',
      candidate: 'gb300_dynamo-vllm',
      expected: 'block',
    },
    {
      name: 'allows 8K/1K ATOM next to vLLM on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_atom',
      candidate: 'mi355x_vllm',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K vLLM next to ATOM on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_vllm',
      candidate: 'mi355x_atom',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K ATOM next to SGLang on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_sglang',
      candidate: 'mi355x_atom',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K Mooncake ATOMesh next to vLLM on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_vllm',
      candidate: 'mi355x_mooncake-atom',
      expected: 'fallthrough',
    },
    {
      name: 'blocks 8K/1K MoRI SGLang against vLLM on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_mori-sglang',
      candidate: 'mi355x_vllm',
      expected: 'block',
    },
    {
      name: 'allows 8K/1K ATOM MTP next to vLLM MTP',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_atom_mtp',
      candidate: 'mi355x_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K vLLM MTP next to ATOM MTP',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_vllm_mtp',
      candidate: 'mi355x_atom_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K ATOM MTP next to SGLang MTP',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_sglang_mtp',
      candidate: 'mi355x_atom_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K ATOM MTP next to vLLM STP on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_vllm',
      candidate: 'mi355x_atom_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K cross-engine MTP on different SKUs',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang_mtp',
      candidate: 'mi355x_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'still blocks 8K/1K cross-engine MTP on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang_mtp',
      candidate: 'b200_vllm_mtp',
      expected: 'block',
    },
    {
      name: 'allows 8K/1K TRTLLM MTP next to vLLM MTP',
      sequence: Sequence.EightK_OneK,
      active: 'b200_trt_mtp',
      candidate: 'b200_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K TRTLLM MTP next to SGLang MTP',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang_mtp',
      candidate: 'b200_trt_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K TRTLLM MTP next to ATOM MTP',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_atom_mtp',
      candidate: 'gb300_dynamo-trt_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K TRTLLM next to ATOM',
      sequence: Sequence.EightK_OneK,
      active: 'mi355x_atom',
      candidate: 'b200_trt',
      expected: 'fallthrough',
    },
    // Agentic now guards the same two families as 8K/1K, so ATOM and TRTLLM are
    // comparable with everything there too.
    {
      name: 'allows Agentic ATOM MTP next to vLLM MTP on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'mi355x_atom_mtp',
      candidate: 'mi355x_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows Agentic TRTLLM next to vLLM on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_trt',
      candidate: 'b200_vllm',
      expected: 'fallthrough',
    },
    {
      name: 'allows Agentic TRTLLM next to SGLang on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'b200_trt',
      expected: 'fallthrough',
    },
    {
      name: 'allows Agentic TRTLLM MTP next to ATOM MTP on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'mi355x_atom_mtp',
      candidate: 'mi355x_trt_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'still blocks Agentic vLLM against SGLang on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'b200_vllm',
      expected: 'block',
    },
    {
      name: 'still blocks Agentic cross-engine MTP on the same SKU',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang_mtp',
      candidate: 'b200_vllm_mtp',
      expected: 'block',
    },
    {
      name: 'allows Agentic cross-engine MTP on different SKUs',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang_mtp',
      candidate: 'mi355x_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'allows Agentic vLLM and SGLang on different SKUs',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang',
      candidate: 'mi355x_vllm',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K STP engines on different SKUs',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang',
      candidate: 'mi355x_vllm',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K TRTLLM next to vLLM on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'b200_vllm',
      candidate: 'b200_trt',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K TRTLLM next to SGLang on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang',
      candidate: 'b200_trt',
      expected: 'fallthrough',
    },
    {
      name: 'allows 8K/1K STP and MTP from the same engine',
      sequence: Sequence.EightK_OneK,
      active: 'b200_vllm',
      candidate: 'b200_vllm_mtp',
      expected: 'fallthrough',
    },
    {
      name: 'blocks 8K/1K MTP added to cross-engine STP on the same SKU',
      sequence: Sequence.EightK_OneK,
      active: 'b200_sglang',
      candidate: 'b200_vllm_mtp',
      expected: 'block',
    },
    {
      name: 'allows fixed-sequence STP engines on the same SKU',
      sequence: Sequence.OneK_OneK,
      active: 'b200_sglang',
      candidate: 'b200_vllm',
      expected: 'fallthrough',
    },
    {
      name: 'blocks fixed-sequence cross-engine MTP on the same SKU',
      sequence: Sequence.OneK_OneK,
      active: 'b200_sglang_mtp',
      candidate: 'b200_vllm_mtp',
      expected: 'block',
    },
    {
      name: 'allows fixed-sequence cross-engine MTP on different SKUs',
      sequence: Sequence.OneK_OneK,
      active: 'b200_sglang_mtp',
      candidate: 'mi355x_vllm_mtp',
      expected: 'fallthrough',
    },
  ] as const)('$name', ({ sequence, active, candidate, expected }) => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, sequence, false)!;
    const decision = resolveExclusionToggle(
      new Set([active]),
      candidate,
      new Set([active, candidate]),
      exclusion,
      'keep-sticky',
    );

    expect(decision.kind).toBe(expected);
  });

  it('does not create a guard outside configured models and scenarios', () => {
    expect(comparisonExclusion(Model.Llama3_3_70B, Sequence.OneK_OneK, false)).toBeNull();
  });

  it('disables the engine-family guard for unofficial previews', () => {
    expect(comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, true)).toBeNull();
  });
});
