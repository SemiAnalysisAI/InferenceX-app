import { describe, expect, it } from 'vitest';

import { DESCRIPTION, DESCRIPTION_ZH, SITE_TITLE, SITE_TITLE_ZH } from './seo';

describe('site positioning', () => {
  it('uses agentic inference for the category and AgentX for the scenario in English', () => {
    expect(SITE_TITLE).toContain('Agentic Inference Benchmark');
    expect(SITE_TITLE).not.toContain('AgentX');
    expect(DESCRIPTION).toMatch(/agentic inference benchmark.*AgentX.*scenario/u);
    expect(DESCRIPTION).toContain('fixed-sequence');
  });

  it('mirrors the category and scenario distinction in Simplified Chinese', () => {
    expect(SITE_TITLE_ZH).toContain('智能体推理基准测试');
    expect(SITE_TITLE_ZH).not.toContain('AgentX');
    expect(DESCRIPTION_ZH).toMatch(/智能体推理基准测试.*AgentX.*场景/u);
    expect(DESCRIPTION_ZH).toContain('固定序列');
  });
});
