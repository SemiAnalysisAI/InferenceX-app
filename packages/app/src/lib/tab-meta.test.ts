import { describe, expect, it } from 'vitest';

import { getTabTitle, isValidTab, LANDING_META, TAB_META, VALID_TABS } from './tab-meta';

describe('AgentX positioning', () => {
  it('describes AgentX without hiding the fixed-sequence benchmark', () => {
    expect(LANDING_META.title).toContain('AgentX');
    expect(LANDING_META.description).toMatch(/AgentX.*agentic coding/u);
    expect(LANDING_META.description).toContain('fixed-sequence');
    expect(TAB_META.inference.title).toContain('AgentX');
    expect(TAB_META.inference.description).toContain('fixed-sequence');
  });
});

describe('isValidTab', () => {
  it.each(VALID_TABS)('returns true for valid tab "%s"', (tab) => {
    expect(isValidTab(tab)).toBe(true);
  });

  it.each(['', 'nonexistent', 'Inference', 'INFERENCE', 'gpu_specs', 'tabs'])(
    'returns false for invalid tab "%s"',
    (tab) => {
      expect(isValidTab(tab)).toBe(false);
    },
  );
});

describe('getTabTitle', () => {
  it.each(VALID_TABS)('returns formatted title for "%s"', (tab) => {
    const title = getTabTitle(tab);
    expect(title).toContain(TAB_META[tab].title);
    expect(title).toContain('|');
  });

  it('returns fallback title for invalid tab', () => {
    const title = getTabTitle('nonexistent');
    expect(title).not.toContain('|');
    expect(title.length).toBeGreaterThan(0);
  });
});
