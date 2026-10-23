import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

import { EMBED_SKIN_HEADER, EMBED_THEME_HEADER, isEmbedPathname } from '@/lib/embed/embed-route';
import { captureClientRequest } from '@/lib/analytics/cli-request-analytics';

const EMBED_CSP = 'frame-ancestors *';

export function proxy(request: NextRequest, event: Pick<NextFetchEvent, 'waitUntil'>) {
  const capture = captureClientRequest(request);
  if (capture) event.waitUntil(capture);
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
