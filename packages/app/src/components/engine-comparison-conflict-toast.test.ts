import { describe, expect, it } from 'vitest';

import { describeEngineComparisonConflict } from './engine-comparison-conflict-toast';

describe('describeEngineComparisonConflict', () => {
  it('describes partial removal without assuming hardware scope', () => {
    const message = describeEngineComparisonConflict(
      {
        kind: 'resolved',
        kept: ['vllm'],
        dropped: [],
        partial: ['sglang'],
      },
      'en',
    );

    expect(message).toContain(
      'Disabled conflicting SGLang configs while compatible SGLang configs remain shown',
    );
    expect(message).not.toContain('SKU');
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
