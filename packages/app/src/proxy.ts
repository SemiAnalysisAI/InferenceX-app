import { NextResponse, type NextFetchEvent, type NextRequest, type ProxyConfig } from 'next/server';

import { EMBED_SKIN_HEADER, EMBED_THEME_HEADER, isEmbedPathname } from '@/lib/embed/embed-route';
import { captureClientRequest } from '@/lib/analytics/cli-request-analytics';
import { compareCanonicalRedirectUrl } from '@/lib/compare/compare-canonical-redirect';
import { powerXRedirectUrl } from '@/lib/routing/powerx-redirect';

const EMBED_CSP = 'frame-ancestors *';

// Next reads this statically, so it must stay a literal. Only requests with work to do run the
// proxy: CLI analytics on API routes, embed headers, legacy Inference power links that redirect
// to PowerX, and compare share links whose slug needs canonicalizing with their query intact.
// A `has` query condition needs a named key, and a shared compare link can carry any parameter
// (`i_metric`, `g_rundate`, `utm_*`), so compare detail document requests always match and the
// redirect helper returns at once when the URL has no query. The scenario segment excludes dots
// so the `*.png` social images under those paths skip it. Client RSC navigations follow in-app
// links that already use canonical slugs, so they skip the proxy along with other pages and
// static assets.
export const config: ProxyConfig = {
  matcher: [
    '/api/:path*',
    '/embed/:path*',
    '/zh/embed/:path*',
    { source: '/:locale(zh)?/inference/:slug?', has: [{ type: 'query', key: 'i_metric' }] },
    { source: '/:locale(zh)?/inference/:slug?', has: [{ type: 'query', key: 'i_power' }] },
    {
      source:
        '/:locale(zh)?/:family(compare|compare-per-dollar|compare-precision|compare-spec-decode)/:slug/:scenario([^/.]+)?',
      missing: [{ type: 'header', key: 'rsc' }],
    },
  ],
};

export function proxy(request: NextRequest, event: Pick<NextFetchEvent, 'waitUntil'>) {
  const capture = captureClientRequest(request);
  if (capture) event.waitUntil(capture);
  const powerX = powerXRedirectUrl(request.nextUrl);
  if (powerX) return NextResponse.redirect(powerX);
  const compare = compareCanonicalRedirectUrl(request.nextUrl);
  if (compare) return NextResponse.redirect(compare, 308);
  const isEmbedRoute = isEmbedPathname(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  if (isEmbedRoute) {
    requestHeaders.set('x-inferencex-embed', '1');
    const theme = request.nextUrl.searchParams.get('theme');
    const skin = request.nextUrl.searchParams.get('skin');
    if (theme) requestHeaders.set(EMBED_THEME_HEADER, theme);
    if (skin) requestHeaders.set(EMBED_SKIN_HEADER, skin);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (isEmbedRoute) {
    response.headers.set('Content-Security-Policy', EMBED_CSP);
  }
  return response;
}
