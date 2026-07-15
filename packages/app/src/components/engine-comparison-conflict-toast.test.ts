import { describe, expect, it } from 'vitest';

import { describeEngineComparisonConflict } from './engine-comparison-conflict-toast';

describe('describeEngineComparisonConflict', () => {
  it('describes hardware-scoped partial removal without contradicting itself', () => {
    const message = describeEngineComparisonConflict(
      {
        kind: 'resolved',
        kept: ['vllm'],
        dropped: [],
        partial: ['sglang'],
      },
      'en',
    );

    expect(message).toContain('Disabled conflicting SGLang configs only on affected SKUs');
    expect(message).toContain('compatible configs on other SKUs remain shown');
    expect(message).not.toContain('Kept SGLang');
    expect(message).not.toContain('removed SGLang');
  });

  it('preserves the whole-family resolution message', () => {
    expect(
      describeEngineComparisonConflict(
        {
          kind: 'resolved',
          kept: ['sglang'],
          dropped: ['vllm'],
          partial: [],
        },
        'en',
      ),
    ).toContain('Kept SGLang and removed vLLM configs');
  });
});
