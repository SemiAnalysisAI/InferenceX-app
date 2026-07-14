import { describe, expect, it } from 'vitest';

import { Model, Sequence } from '@/lib/data-mappings';

import { comparisonExclusion } from './comparison-exclusion';

describe('comparisonExclusion', () => {
  it('keeps the engine-family guard for official Agentic Traces charts', () => {
    const exclusion = comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, false);

    expect(exclusion?.familyOf('b200_vllm')).toBe('vllm');
    expect(exclusion?.familyOf('b200_sglang')).toBe('sglang');
  });

  it('disables the engine-family guard for unofficial previews', () => {
    expect(comparisonExclusion(Model.DeepSeek_V4_Pro, Sequence.AgenticTraces, true)).toBeNull();
  });
});
