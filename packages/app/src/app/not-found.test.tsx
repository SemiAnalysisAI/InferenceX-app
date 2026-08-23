import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NotFoundContent } from '@/components/not-found-content';
import { metadata as enMetadata } from './not-found';
import UnknownChineseRoute from './zh/[...notFound]/page';
import { metadata as zhMetadata } from './zh/not-found';

describe('localized not-found surfaces', () => {
  it('keeps both 404 variants out of search indexes and clears inherited canonicals', () => {
    for (const metadata of [enMetadata, zhMetadata]) {
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata.alternates).toEqual({ canonical: null });
    }
  });

  it('preserves the English copy and home target', () => {
    const html = renderToStaticMarkup(<NotFoundContent locale="en" />);
    expect(html).toContain('404 - Page Not Found');
    expect(html).toContain('The page you are looking for does not exist.');
    expect(html).toContain('href="/"');
    expect(html).toContain('Go back home');
  });

  it('renders an idiomatic Chinese state that returns to the Chinese homepage', () => {
    const html = renderToStaticMarkup(<NotFoundContent locale="zh" />);
    expect(html).toContain('404 - 页面不存在');
    expect(html).toContain('找不到该页面。');
    expect(html).toContain('href="/zh"');
    expect(html).toContain('inline-flex min-h-11 items-center justify-center');
    expect(html).toContain('返回首页');
  });

  it('turns unmatched /zh paths into a real 404 response', () => {
    expect(UnknownChineseRoute).toThrowError('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
