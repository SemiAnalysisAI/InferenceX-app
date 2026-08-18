import { describe, expect, it } from 'vitest';

import { DESCRIPTION, DESCRIPTION_ZH, SITE_TITLE, SITE_TITLE_ZH } from './seo';

describe('site positioning', () => {
  it('identifies AgentX in English search and social copy', () => {
    expect(SITE_TITLE).toContain('AgentX');
    expect(DESCRIPTION).toMatch(/AgentX.*long-context.*multi-turn.*agentic coding/u);
    expect(DESCRIPTION).toContain('fixed-sequence');
  });

  it('ships equivalent AgentX positioning in Simplified Chinese', () => {
    expect(SITE_TITLE_ZH).toMatch(/AgentX.*智能体/u);
    expect(DESCRIPTION_ZH).toMatch(/AgentX.*长上下文多轮智能体编码/u);
    expect(DESCRIPTION_ZH).toContain('固定序列');
  });
});
