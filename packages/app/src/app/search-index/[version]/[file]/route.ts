import { SEARCH_INDEX_LOCALES } from '@/lib/site-search/index-format';
import { getSiteSearchIndex } from '@/lib/site-search/build-index.server';

// Only the current build's version is generated; any other path is a 404, so a
// stale tab asking for an old version learns to refetch the manifest.
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const { manifest } = await getSiteSearchIndex();
  return SEARCH_INDEX_LOCALES.map((locale) => ({
    version: manifest.version,
    file: `${locale}.json`,
  }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await params;
  const { manifest, files } = await getSiteSearchIndex();
  const locale = SEARCH_INDEX_LOCALES.find((candidate) => file === `${candidate}.json`);
  if (version !== manifest.version || !locale) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json(files[locale], {
    headers: {
      // The URL is content-addressed: new content means a new version segment.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Robots-Tag': 'noindex',
    },
  });
}
