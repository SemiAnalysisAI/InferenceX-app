import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderCaption } from '@/components/blog/mdx-components';

/** `<Figure caption>` is a plain string prop, so MDX never parses it. `renderCaption`
 *  is what turns `Source: [X](https://…)` credits into real anchors. */
const anchors = (nodes: ReturnType<typeof renderCaption>) =>
  nodes.filter(isValidElement) as React.ReactElement<{ href: string; children: string }>[];

describe('renderCaption', () => {
  it('leaves a plain caption untouched', () => {
    const nodes = renderCaption('GLM-5 at ISL 8192 / OSL 1024. Source: SemiAnalysis');
    expect(nodes).toEqual(['GLM-5 at ISL 8192 / OSL 1024. Source: SemiAnalysis']);
  });

  it('turns a trailing markdown link into an external anchor', () => {
    const nodes = renderCaption('Source: [Kimi Linear](https://arxiv.org/abs/2510.26692)');
    expect(nodes[0]).toBe('Source: ');
    const [link] = anchors(nodes);
    expect(link.props.href).toBe('https://arxiv.org/abs/2510.26692');
    expect(link.props.children).toBe('Kimi Linear');
    expect(link.props).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
  });

  it('keeps text on both sides of a link and handles several links', () => {
    const nodes = renderCaption(
      'See [one](https://a.example) and [two](https://b.example) for details',
    );
    const links = anchors(nodes);
    expect(links.map((l) => l.props.href)).toEqual(['https://a.example', 'https://b.example']);
    expect(nodes.filter((n) => typeof n === 'string')).toEqual(['See ', ' and ', ' for details']);
  });

  it('handles a label containing parentheses', () => {
    const nodes = renderCaption(
      'Source: [DeltaNet Explained (Part I)](https://sustcsonglin.github.io/blog/2024/deltanet-1/)',
    );
    const [link] = anchors(nodes);
    expect(link.props.children).toBe('DeltaNet Explained (Part I)');
    expect(link.props.href).toBe('https://sustcsonglin.github.io/blog/2024/deltanet-1/');
  });

  it('does not linkify non-http targets or bare brackets', () => {
    expect(renderCaption('Batch [1] of 4, see [docs](/internal/page)')).toEqual([
      'Batch [1] of 4, see [docs](/internal/page)',
    ]);
  });

  it('gives repeated links to the same href distinct keys', () => {
    const nodes = renderCaption('[a](https://x.example) then [b](https://x.example)');
    const [first, second] = anchors(nodes);
    expect(first.key).not.toBe(second.key);
  });
});
