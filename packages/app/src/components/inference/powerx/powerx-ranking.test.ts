import { describe, expect, it } from 'bun:test';

import { powerXDirectLabelTexts } from './powerx-ranking';

describe('direct labels', () => {
  it('shows the short GPU name and adds the framework only when two series share a GPU', () => {
    const texts = powerXDirectLabelTexts([
      { key: 'a', hwKey: 'gb300_dynamo-vllm', frameworkTag: 'vLLM', poolTag: '' },
      { key: 'b', hwKey: 'gb300_dynamo-sglang', frameworkTag: 'SGLang', poolTag: '' },
      { key: 'c', hwKey: 'mi355x_sglang', frameworkTag: 'SGLang', poolTag: '' },
    ]);
    expect([...texts.values()]).toEqual(['GB300 vLLM', 'GB300 SGLang', 'MI355X']);
  });
});
