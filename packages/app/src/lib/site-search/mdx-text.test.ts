import { describe, expect, it } from 'vitest';

import { inlineMarkdownToText, mdxToSections } from './mdx-text';

describe('mdxToSections', () => {
  it('splits at headings with renderer-compatible anchors and keeps readable text', () => {
    const raw = [
      'import X from "./x";',
      '',
      'Intro with a [link](https://example.com) and **bold** text.',
      '',
      '## Throughput results',
      '',
      '<Figure src="/a.png" alt="ignored alt" caption="B200 vs MI355X. Source: [SemiAnalysis](https://semianalysis.com)" />',
      '',
      '| GPU | tok/s |',
      '| --- | ---: |',
      '| B200 | 1200 |',
      '',
      '```bash',
      '## not a heading',
      'agentx run --model kimi',
      '```',
      '',
      '## Throughput results',
      '',
      '- Second section with the same title.',
      '',
      '<DashboardCTA href="/inference">Click to see the dashboard</DashboardCTA>',
      '<JsonLd>{`{"@context": "https://schema.org"}`}</JsonLd>',
      '<Blur>Teaser text</Blur>',
    ].join('\n');

    expect(mdxToSections(raw)).toEqual([
      { text: 'Intro with a link and bold text.' },
      {
        anchor: 'throughput-results',
        heading: 'Throughput results',
        text: 'B200 vs MI355X. Source: SemiAnalysis GPU tok/s B200 1200 ## not a heading agentx run --model kimi',
      },
      {
        anchor: 'throughput-results-2',
        heading: 'Throughput results',
        text: 'Second section with the same title.',
      },
    ]);
  });

  it('strips inline markup without eating identifiers', () => {
    expect(inlineMarkdownToText('*Kimi K2.5* uses `fp8_e4m3` ![img](x.png) on __B300__')).toBe(
      'Kimi K2.5 uses fp8_e4m3 on B300',
    );
  });
});
