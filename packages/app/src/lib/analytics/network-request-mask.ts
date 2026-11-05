const SEARCH_PARAMS = ['search', 'q', 'query'] as const;

/** Removes free-text search params from a URL so typed queries never reach network timing or replay. */
export function stripSearchParams(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl, 'http://placeholder.invalid');
  } catch {
    return rawUrl;
  }
  if (!SEARCH_PARAMS.some((param) => url.searchParams.has(param))) return rawUrl;
  for (const param of SEARCH_PARAMS) url.searchParams.delete(param);
  if (url.origin === 'http://placeholder.invalid') return `${url.pathname}${url.search}${url.hash}`;
  return url.href;
}

export function maskCapturedNetworkRequest<T extends { name: string }>(request: T): T {
  request.name = stripSearchParams(request.name);
  return request;
}
