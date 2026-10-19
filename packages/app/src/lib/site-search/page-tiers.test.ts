import { describe, expect, it } from 'vitest';

import { PAGE_TIER, pageTier } from './page-tiers';
import { SiteSearchIndex } from './search-index';

describe('pageTier', () => {
  it('classifies main, reference, overview and article pages in both locales', () => {
    expect(pageTier('/')).toBe(PAGE_TIER.main);
    expect(pageTier('/zh')).toBe(PAGE_TIER.main);
    expect(pageTier('/agentx#methodology')).toBe(PAGE_TIER.main);
    expect(pageTier('/inference')).toBe(PAGE_TIER.main);
    expect(pageTier('/zh/inference/agentic')).toBe(PAGE_TIER.main);
    expect(pageTier('/historical')).toBe(PAGE_TIER.main);
    expect(pageTier('/ubenchx/mem-bw')).toBe(PAGE_TIER.main);
    expect(pageTier('/chips/b200')).toBe(PAGE_TIER.reference);
    expect(pageTier('/rankings/cheapest-gpu-for-deepseek-r1')).toBe(PAGE_TIER.reference);
    expect(pageTier('/overview')).toBe(PAGE_TIER.overview);
    expect(pageTier('/zh/overview')).toBe(PAGE_TIER.overview);
    expect(pageTier('/blog')).toBe(PAGE_TIER.article);
    expect(pageTier('/blog/powerx#joules')).toBe(PAGE_TIER.article);
    expect(pageTier('/whitepaper/agentx')).toBe(PAGE_TIER.article);
    expect(pageTier('/blogroll')).toBe(PAGE_TIER.reference);
  });
});

describe('tier ordering in search', () => {
  const docs = [
    { url: '/blog/power-deep-dive', pageTitle: 'Power deep dive', text: 'GPU power per token' },
    { url: '/overview', pageTitle: 'Power overview', text: 'GPU power summary' },
    { url: '/chips/b200', pageTitle: 'B200 power', text: 'GPU power draw' },
    { url: '/inference', pageTitle: 'Inference power', text: 'GPU power charts' },
  ];

  function build(): SiteSearchIndex {
    const index = new SiteSearchIndex(pageTier);
    index.replacePages(docs.map((doc) => ({ ...doc, source: 'page' as const })));
    return index;
  }

  it('lists main pages first, then reference, then overview, then articles', () => {
    expect(
      build()
        .search('power')
        .map((r) => r.url),
    ).toEqual(['/inference', '/chips/b200', '/overview', '/blog/power-deep-dive']);
  });

  it('keeps a barely relevant main page below strong matches', () => {
    const index = new SiteSearchIndex(pageTier);
    index.replacePages([
      {
        url: '/blog/tpu-v8',
        pageTitle: 'TPU v8 Ironwood successor',
        section: 'TPU v8 Ironwood successor',
        text: 'Ironwood successor TPU v8 specifications and Ironwood successor benchmarks.',
        source: 'page',
      },
      {
        url: '/calculator',
        pageTitle: 'Throughput calculator',
        text: `${'throughput latency cost interactivity '.repeat(60)} ironwood`,
        source: 'page',
      },
    ]);
    expect(index.search('ironwood successor')[0].url).toBe('/blog/tpu-v8');
  });

  it('falls back to score order without a tier function', () => {
    const index = new SiteSearchIndex();
    index.replacePages(docs.map((doc) => ({ ...doc, source: 'page' as const })));
    const scores = index.search('power').map((r) => r.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
  });
});
