import { NextResponse, type NextRequest } from 'next/server';

import { isEmbedPathname } from '@/lib/embed-route';

// `/embed/*` and `/zh/embed/*` render single charts meant to be framed by
// third-party pages (the vLLM recipes site), so they opt out of the default
// same-origin framing policy.
const EMBED_CSP = 'frame-ancestors *';

export function proxy(request: NextRequest) {
  const isEmbedRoute = isEmbedPathname(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  if (isEmbedRoute) {
    requestHeaders.set('x-inferencex-embed', '1');
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (isEmbedRoute) {
    response.headers.set('Content-Security-Policy', EMBED_CSP);
  }
  return response;
}
