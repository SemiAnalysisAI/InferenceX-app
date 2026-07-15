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

  it('allows Agentic Traces engines to differ across hardware SKUs', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false)!;
    const decision = resolveExclusionToggle(
      new Set(['b200_sglang']),
      'mi355x_vllm',
      new Set(['b200_sglang', 'mi355x_vllm']),
      exclusion,
      'keep-sticky',
    );

    expect(decision).toEqual({ kind: 'fallthrough' });
  });

  it('disables the engine-family guard for unofficial previews', () => {
    expect(comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, true)).toBeNull();
  });
});
