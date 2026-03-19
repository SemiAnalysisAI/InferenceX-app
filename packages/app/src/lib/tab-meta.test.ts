import { describe, expect, it } from 'vitest';

import { getTabTitle, isValidTab, TAB_META, VALID_TABS } from './tab-meta';

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
