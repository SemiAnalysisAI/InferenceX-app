import { NextResponse, type NextRequest } from 'next/server';

const EMBED_PATH_PREFIX = '/embed/';
const EMBED_CSP = 'frame-ancestors *';

export function proxy(request: NextRequest) {
  const isEmbedRoute = request.nextUrl.pathname.startsWith(EMBED_PATH_PREFIX);
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
