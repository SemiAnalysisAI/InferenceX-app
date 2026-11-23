import { describe, expect, it } from 'bun:test';

import { heroImageSrcSet, versionedHeroImageSrc } from './hero-image';

const PNG = '/compare-per-dollar/deepseek-r1-b200-vs-h100/performance-per-dollar.png';
const VERSIONED =
  '/compare-per-dollar/deepseek-r1-b200-vs-h100/performance-per-dollar/0123456789ab.png';

function candidateSources(srcSet: string | undefined): string[] {
  return (srcSet ?? '').split(', ').map((candidate) => {
    const url = new URL(candidate.split(' ')[0]!, 'https://inferencex.semianalysis.com');
    expect(url.pathname).toBe('/_next/image');
    return url.searchParams.get('url')!;
  });
}

describe('versionedHeroImageSrc', () => {
  it('moves the version into the path, for both locales', () => {
    expect(versionedHeroImageSrc(PNG, '0123456789ab')).toBe(VERSIONED);
    expect(versionedHeroImageSrc(`/zh${PNG}`, '0123456789ab')).toBe(`/zh${VERSIONED}`);
  });
});

describe('heroImageSrcSet', () => {
  it('points every optimized candidate at the versioned PNG path, with no query string', () => {
    const sources = candidateSources(heroImageSrcSet(PNG, '0123456789ab'));
    expect(sources.length).toBeGreaterThan(1);
    for (const source of sources) expect(source).toBe(VERSIONED);
  });

  it('changes every candidate URL when the version changes', () => {
    const before = heroImageSrcSet(PNG, '0123456789ab')!.split(', ');
    const after = heroImageSrcSet(PNG, 'ba9876543210')!.split(', ');
    expect(after).toHaveLength(before.length);
    for (const [index, candidate] of after.entries()) expect(candidate).not.toBe(before[index]);
  });
});
