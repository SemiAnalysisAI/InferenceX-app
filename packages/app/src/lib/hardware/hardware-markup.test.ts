import { describe, expect, it } from 'vitest';

import { isExternalHref, isSupportedHref, ledeSegments, noteParts } from './hardware-markup';

describe('ledeSegments', () => {
  it('marks text between ** markers as strong and keeps source offsets as stable keys', () => {
    expect(
      ledeSegments('Vera Rubin serves **1.8x to 2.0x** the tokens per dollar of **GB300 NVL72**.'),
    ).toEqual([
      { text: 'Vera Rubin serves ', strong: false, start: 0 },
      { text: '1.8x to 2.0x', strong: true, start: 20 },
      { text: ' the tokens per dollar of ', strong: false, start: 34 },
      { text: 'GB300 NVL72', strong: true, start: 62 },
      { text: '.', strong: false, start: 75 },
    ]);
  });

  it('handles a lede that opens with bold text or has none', () => {
    expect(ledeSegments('**~8.3x** on DeepSeek-V4-Pro')).toEqual([
      { text: '~8.3x', strong: true, start: 2 },
      { text: ' on DeepSeek-V4-Pro', strong: false, start: 9 },
    ]);
    expect(ledeSegments('Plain lede.')).toEqual([{ text: 'Plain lede.', strong: false, start: 0 }]);
  });
});

describe('noteParts', () => {
  it('splits the note around its single markdown link', () => {
    expect(
      noteParts('Charts load live data; see the [AgentX methodology](/agentx/methodology).'),
    ).toEqual({
      before: 'Charts load live data; see the ',
      link: { label: 'AgentX methodology', href: '/agentx/methodology' },
      after: '.',
    });
  });

  it('returns the whole note as text when it has no link', () => {
    expect(noteParts('Charts load live dashboard data.')).toEqual({
      before: 'Charts load live dashboard data.',
      link: null,
      after: '',
    });
  });
});

describe('link destinations', () => {
  it('opens absolute URLs as external links', () => {
    expect(isExternalHref('https://inferencex.semianalysis.com/inference')).toBe(true);
    expect(isExternalHref('/agentx/methodology')).toBe(false);
  });

  it('accepts root-relative paths and https URLs only', () => {
    expect(isSupportedHref('/zh/agentx/methodology')).toBe(true);
    expect(isSupportedHref('https://semianalysis.com/ai-cloud-tco-model/')).toBe(true);
    expect(isSupportedHref('//example.com')).toBe(false);
    expect(isSupportedHref('http://example.com')).toBe(false);
    expect(isSupportedHref('mailto:team@semianalysis.com')).toBe(false);
    expect(isSupportedHref('agentx/methodology')).toBe(false);
    expect(isSupportedHref('https://')).toBe(false);
  });
});
