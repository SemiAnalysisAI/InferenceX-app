import { describe, expect, it } from 'vitest';

import { resolveExclusionToggle } from '@/lib/exclusion';
import { Model, Sequence } from '@/lib/data-mappings';

import { comparisonExclusion } from './comparison-exclusion';

describe('comparisonExclusion', () => {
  it('keeps the engine-family guard for official Agentic Traces charts', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false);

    expect(exclusion?.familyOf('b200_vllm')).toBe('vllm');
    expect(exclusion?.familyOf('b200_sglang')).toBe('sglang');
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
      name: 'blocks Agentic cross-engine MTP globally',
      sequence: Sequence.AgenticTraces,
      active: 'b200_sglang_mtp',
      candidate: 'mi355x_vllm_mtp',
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
      name: 'blocks fixed-sequence cross-engine MTP globally',
      sequence: Sequence.OneK_OneK,
      active: 'b200_sglang_mtp',
      candidate: 'mi355x_vllm_mtp',
      expected: 'block',
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
