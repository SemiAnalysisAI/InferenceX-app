import { describe, expect, it } from 'vitest';

import { relatedTerms } from './concepts';
import { boundedEditDistance, buildSnippet, SiteSearchIndex } from './search-index';
import { stem, tokenize } from './tokenize';

describe('tokenize', () => {
  it('stems English words but keeps hardware and model identifiers intact', () => {
    expect(tokenize('Benchmarking the MI355X and GB200 NVL72 with FP8')).toEqual([
      'benchmark',
      'mi355x',
      'gb200',
      'nvl72',
      'fp8',
    ]);
  });

  it('joins dotted versions the way slugs spell them', () => {
    expect(tokenize('DeepSeek V4.1 Flash vs Kimi K2.6')).toEqual([
      'deepseek',
      'v41',
      'flash',
      'vs',
      'kimi',
      'k26',
    ]);
  });

  it('indexes Chinese runs as character bigrams', () => {
    expect(tokenize('能耗对比')).toEqual(['能耗', '耗对', '对比']);
    expect(tokenize('新')).toEqual(['新']);
  });

  it('collapses plural and verb forms to one stem', () => {
    expect(stem('benchmarks')).toBe(stem('benchmarked'));
    expect(stem('latencies')).toBe('latency');
    expect(stem('h100s')).toBe('h100s');
  });
});

describe('concept expansion', () => {
  it('links energy queries to power vocabulary in both languages', () => {
    const related = relatedTerms('energy');
    expect(related).toContain('power');
    expect(related).toContain('joule');
    expect(related).toContain('功耗');
  });

  it('drops single-letter fragments from phrase members', () => {
    expect(relatedTerms('throughput')).not.toContain('s');
  });
});

describe('boundedEditDistance', () => {
  it('measures one-edit typos and exits early past the bound', () => {
    expect(boundedEditDistance('throughput', 'thruoghput', 2)).toBe(2);
    expect(boundedEditDistance('latency', 'latncy', 1)).toBe(1);
    expect(boundedEditDistance('latency', 'agentic', 1)).toBe(2);
  });
});

function buildIndex(): SiteSearchIndex {
  const index = new SiteSearchIndex();
  index.replacePages([
    {
      url: '/chips/mi355x',
      pageTitle: 'AMD Instinct MI355X',
      section: 'Specifications',
      text: 'HBM3E capacity of 288 GB and 8 TB/s of memory bandwidth per GPU.',
      source: 'page',
    },
    {
      url: '/chips/mi355x#pricing',
      pageTitle: 'AMD Instinct MI355X',
      section: 'Pricing',
      text: 'Hourly rental price and total cost of ownership per GPU hour.',
      source: 'page',
    },
    {
      url: '/blog/powerx#joules',
      pageTitle: 'PowerX: measuring inference efficiency',
      section: 'Joules per token',
      text: 'We sample GPU power draw during each benchmark and report J/token.',
      source: 'page',
    },
    {
      url: '/agentx/methodology',
      pageTitle: 'AgentX Methodology',
      text: 'Multi-turn coding traces replayed against each serving stack.',
      source: 'page',
    },
  ]);
  return index;
}

describe('SiteSearchIndex', () => {
  it('ranks heading matches above body-only matches', () => {
    const results = buildIndex().search('pricing');
    expect(results[0].url).toBe('/chips/mi355x#pricing');
  });

  it('finds conceptually related pages that share no literal word', () => {
    // "energy" never appears; the power/joule concept group bridges it.
    const results = buildIndex().search('energy');
    expect(results.map((r) => r.url)).toContain('/blog/powerx#joules');
  });

  it('completes the word still being typed', () => {
    expect(buildIndex().search('methodol')[0].url).toBe('/agentx/methodology');
    // A finished word with a trailing space is not treated as a prefix.
    expect(buildIndex().search('methodol ')).toEqual([]);
  });

  it('tolerates a single typo in longer words', () => {
    expect(buildIndex().search('bandwith')[0].url).toBe('/chips/mi355x');
  });

  it('prefers sections that satisfy every query term', () => {
    const results = buildIndex().search('mi355x cost');
    expect(results[0].url).toBe('/chips/mi355x#pricing');
  });

  it('limits results per page and replaces seed docs when the page is indexed', () => {
    const index = new SiteSearchIndex();
    index.add({
      url: '/chips/b200',
      pageTitle: 'NVIDIA B200',
      text: 'specs, pricing and benchmarks',
      source: 'seed',
    });
    expect(index.search('b200')[0].source).toBe('seed');
    index.replacePages([
      { url: '/chips/b200', pageTitle: 'NVIDIA B200', text: 'Blackwell GPU', source: 'page' },
      {
        url: '/chips/b200#a',
        pageTitle: 'NVIDIA B200',
        section: 'B200 memory',
        text: 'HBM3E',
        source: 'page',
      },
      {
        url: '/chips/b200#b',
        pageTitle: 'NVIDIA B200',
        section: 'B200 cost',
        text: 'TCO',
        source: 'page',
      },
    ]);
    const results = index.search('b200');
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.source === 'page')).toBe(true);
    expect(index.pageCount).toBe(1);
  });

  it('returns nothing for stop-word-only or empty queries', () => {
    expect(buildIndex().search('the of')).toEqual([]);
    expect(new SiteSearchIndex().search('mi355x')).toEqual([]);
  });
});

describe('buildSnippet', () => {
  it('centres the window on matches and returns highlight parts, not HTML', () => {
    const text = `${'filler '.repeat(40)}the <b>power</b> draw per token ${'tail '.repeat(40)}`;
    const parts = buildSnippet(text, new Set(['power']));
    expect(parts[0].text).toBe('… ');
    expect(parts.at(-1)!.text).toBe(' …');
    const hit = parts.find((part) => part.hit);
    expect(hit?.text).toBe('<b>power</b>');
  });

  it('highlights only the matched Chinese bigram, not the whole unspaced run', () => {
    const parts = buildSnippet('每 token 能耗在仪表板上持续测量', new Set(['能耗']));
    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['能耗']);
  });
});
