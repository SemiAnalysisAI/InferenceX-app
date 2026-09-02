import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TocHeading } from '@/lib/blog';
import { BlogToc } from './blog-toc';

const headings = [{ id: 'results', text: 'Results', level: 2 }] satisfies TocHeading[];

describe('shared Blog localization chrome', () => {
  it('preserves the existing English table-of-contents copy', () => {
    const toc = renderToStaticMarkup(<BlogToc headings={headings} />);

    expect(toc).toContain('aria-label="Table of contents"');
    expect(toc).toContain('On this page');
    expect(toc).toContain('(click to expand)');
  });

  it('renders the equivalent Chinese table of contents without English fallback copy', () => {
    const toc = renderToStaticMarkup(<BlogToc headings={headings} locale="zh" />);

    expect(toc).toContain('aria-label="本页目录"');
    expect(toc).toContain('（点击展开）');
    expect(toc).not.toContain('Table of contents');
    expect(toc).not.toContain('click to expand');
  });
});
