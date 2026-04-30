import { NextResponse, type NextRequest } from 'next/server';

const EMBED_PATH_PREFIX = '/embed/';
const EMBED_CSP = 'frame-ancestors *';
const DEFAULT_CSP = "frame-ancestors 'none'";

export function middleware(request: NextRequest) {
  const isEmbedRoute = request.nextUrl.pathname.startsWith(EMBED_PATH_PREFIX);
  const requestHeaders = new Headers(request.headers);
  if (isEmbedRoute) {
    requestHeaders.set('x-inferencex-embed', '1');
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('Content-Security-Policy', isEmbedRoute ? EMBED_CSP : DEFAULT_CSP);
  return response;
}

export const config = {
  matcher: [String.raw`/((?!_next|favicon.ico|robots.txt|sitemap.xml|feed.xml|.*\..*).*)`],
};
