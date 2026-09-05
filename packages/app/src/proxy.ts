import { NextResponse, type NextRequest } from 'next/server';

import { EMBED_SKIN_HEADER, EMBED_THEME_HEADER, isEmbedPathname } from '@/lib/embed-route';

// `/embed/*` and `/zh/embed/*` render single charts meant to be framed by
// third-party pages (the vLLM recipes site), so they opt out of the default
// same-origin framing policy.
const EMBED_CSP = 'frame-ancestors *';

export function proxy(request: NextRequest) {
  const isEmbedRoute = isEmbedPathname(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  if (isEmbedRoute) {
    requestHeaders.set('x-inferencex-embed', '1');
    // Layouts cannot read search params, so hand the theme/skin over as
    // headers; the embed layout turns them into a pre-paint boot script.
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
