import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('RSS feed route', () => {
  it('returns valid RSS XML with correct content type', async () => {
    const response = await GET();

    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');

    const body = await response.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<rss');
    expect(body).toContain('</channel>');
    expect(body).toContain('</rss>');
  });

  it('includes blog posts in the feed', async () => {
    const response = await GET();
    const body = await response.text();

    expect(body).toContain('<item>');
    expect(body).toContain('Hello World');
  });

  it('includes required RSS namespaces', async () => {
    const response = await GET();
    const body = await response.text();

    expect(body).toContain('xmlns:dc=');
    expect(body).toContain('xmlns:atom=');
  });
});
