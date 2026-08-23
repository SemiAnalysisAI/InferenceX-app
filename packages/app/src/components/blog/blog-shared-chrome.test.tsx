import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TocHeading } from '@/lib/blog';
import { BlogToc } from './blog-toc';
import { HeadingLink } from './heading-link';

const headings = [{ id: 'results', text: 'Results', level: 2 }] satisfies TocHeading[];

describe('shared Blog localization chrome', () => {
  it('preserves the existing English table-of-contents and heading-link copy', () => {
    const toc = renderToStaticMarkup(<BlogToc headings={headings} />);
    const link = renderToStaticMarkup(<HeadingLink id="results" />);

    expect(toc).toContain('aria-label="Table of contents"');
    expect(toc).toContain('On this page');
    expect(toc).toContain('(click to expand)');
    expect(link).toContain('aria-label="Copy link to section"');
  });

  it('renders the equivalent Chinese controls without English fallback copy', () => {
    const toc = renderToStaticMarkup(<BlogToc headings={headings} locale="zh" />);
    const link = renderToStaticMarkup(<HeadingLink id="results" locale="zh" />);

    expect(toc).toContain('aria-label="本页目录"');
    expect(toc).toContain('（点击展开）');
    expect(toc).not.toContain('Table of contents');
    expect(toc).not.toContain('click to expand');
    expect(link).toContain('aria-label="复制本节链接"');
    expect(link).not.toContain('Copy link to section');
  });
});
