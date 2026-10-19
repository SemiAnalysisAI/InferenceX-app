import { describe, expect, it } from 'vitest';
import { showRunLink } from './run-link';

describe('run link presentation', () => {
  it('hides TPU links while retaining ordinary and absent URL behavior', () => {
    expect(
      showRunLink(
        'https://github.com/SemiAnalysisAI/InferenceX-Private-TPU/actions/runs/38997727079/attempts/1',
      ),
    ).toBe(false);
    expect(
      showRunLink('https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1', 'tpuv7_vllm'),
    ).toBe(false);
    expect(showRunLink('https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1', 'b200')).toBe(
      true,
    );
    expect(showRunLink(null)).toBe(false);
    expect(showRunLink(undefined)).toBe(false);
  });
});
