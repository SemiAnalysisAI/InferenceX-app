import { describe, expect, it } from 'vitest';

import { blogTagLabel } from './blog-tag-label';

describe('blogTagLabel', () => {
  it('maps product, chip and framework slugs to their display names', () => {
    expect(blogTagLabel('agentx', 'en')).toBe('AgentX');
    expect(blogTagLabel('gb300', 'en')).toBe('GB300');
    expect(blogTagLabel('trtllm', 'en')).toBe('TRT-LLM');
    expect(blogTagLabel('vllm', 'en')).toBe('vLLM');
    expect(blogTagLabel('sglang', 'zh')).toBe('SGLang');
  });

  it('sentence-cases unknown slugs and translates topic words for zh', () => {
    expect(blogTagLabel('benchmark', 'en')).toBe('Benchmark');
    expect(blogTagLabel('sparse-attention', 'en')).toBe('Sparse attention');
    expect(blogTagLabel('benchmark', 'zh')).toBe('基准测试');
    expect(blogTagLabel('sparse-attention', 'zh')).toBe('稀疏注意力');
  });
});
