import { describe, expect, it } from 'vitest';

import {
  resolveE2eXAxisMetric,
  resolveEffectiveXAxisMode,
} from '@/components/inference/InferenceContext';
import { Sequence } from '@/lib/data-mappings';

describe('inference requested and effective axis selectors', () => {
  it('preserves URL mode while sequence availability is unresolved', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Sequence.EightK_OneK, false),
    ).toBe('e2e-normalized-interactivity');
  });

  it('falls back from an agentic-only mode for a resolved fixed sequence', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Sequence.EightK_OneK, true),
    ).toBe('interactivity');
  });

  it('restores the requested mode when the effective sequence supports it', () => {
    expect(
      resolveEffectiveXAxisMode('e2e-normalized-interactivity', Sequence.AgenticTraces, true),
    ).toBe('e2e-normalized-interactivity');
  });

  it('derives TTFT metric from sequence kind and percentile', () => {
    expect(resolveE2eXAxisMetric('p90_ttft', 'ttft', Sequence.AgenticTraces, 'p75')).toBe(
      'p75_ttft',
    );
    expect(resolveE2eXAxisMetric('p90_ttft', 'ttft', Sequence.EightK_OneK, 'p75')).toBe(
      'median_ttft',
    );
  });

  it('uses natural E2E x-axis and preserves inactive requested metric', () => {
    expect(resolveE2eXAxisMetric('p90_ttft', 'e2e', Sequence.AgenticTraces, 'p75')).toBeNull();
    expect(resolveE2eXAxisMetric('p90_ttft', 'interactivity', Sequence.AgenticTraces, 'p75')).toBe(
      'p90_ttft',
    );
  });
});
