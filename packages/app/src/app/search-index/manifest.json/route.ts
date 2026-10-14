import { getSiteSearchIndex } from '@/lib/site-search/build-index.server';

// Prerendered once per build; the CDN copy is replaced on every deploy.
export const dynamic = 'force-static';

/**
 * Names the current site search index version. Browsers revalidate it on each
 * dialog open (`no-cache`), so a tab that outlives a deploy picks up the new
 * version. See docs/site-search.md.
 */
export async function GET() {
  const { manifest } = await getSiteSearchIndex();
  return Response.json(manifest, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex',
    },
  });
}
