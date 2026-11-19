import { describe, expect, it } from 'vitest';

import {
  clampMetaDescription,
  fitMetaTitle,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
} from './meta-text';

describe('clampMetaDescription', () => {
  it('returns text that already fits unchanged', () => {
    expect(clampMetaDescription('  Short enough.  ', 'en')).toBe('Short enough.');
    const exact = 'x'.repeat(META_DESCRIPTION_MAX.en);
    expect(clampMetaDescription(exact, 'en')).toBe(exact);
  });

  it('prefers ending on a full sentence when one ends past the halfway point', () => {
    const first = `${'word '.repeat(20).trim()}.`;
    const text = `${first} ${'more '.repeat(30).trim()}.`;
    expect(clampMetaDescription(text, 'en')).toBe(first);
  });

  it('cuts English at a word boundary and marks the cut', () => {
    const text = `${'alpha '.repeat(40).trim()} tail`;
    const out = clampMetaDescription(text, 'en');
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX.en);
    expect(out.endsWith('alpha…')).toBe(true);
  });

  it('cuts Chinese at a sentence end, or at the limit with an ellipsis', () => {
    const sentence = `${'测'.repeat(70)}。`;
    expect(clampMetaDescription(`${sentence}${'试'.repeat(100)}`, 'zh')).toBe(sentence);
    const out = clampMetaDescription('试'.repeat(200), 'zh');
    expect(out.length).toBe(META_DESCRIPTION_MAX.zh);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('fitMetaTitle', () => {
  it('returns the first candidate within the title budget', () => {
    const long = 'x'.repeat(META_TITLE_MAX + 1);
    expect(fitMetaTitle([long, 'Short title', 'Shorter'])).toBe('Short title');
  });

  it('cuts the last candidate with an ellipsis when none fit', () => {
    const out = fitMetaTitle(['y'.repeat(80), 'z'.repeat(60)]);
    expect(out).toBe(`${'z'.repeat(META_TITLE_MAX - 1)}…`);
    expect(out.length).toBe(META_TITLE_MAX);
  });
});
