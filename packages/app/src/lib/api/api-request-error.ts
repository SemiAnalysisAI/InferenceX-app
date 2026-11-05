/**
 * A non-2xx response from a client data request. `status` and `endpoint` let failure analytics
 * (`data_query_failed`) group errors without parsing messages. The message stays caller-defined
 * because some views show it.
 */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';
  readonly status: number;
  /** Request path without the query string, or `host/path` for another origin. */
  readonly endpoint: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.status = status;
    this.endpoint = requestEndpoint(url);
  }
}

/** The path of `url` without query or hash. Absolute URLs keep their host so third parties stay apart. */
export function requestEndpoint(url: string): string {
  if (url.startsWith('/')) return url.split(/[?#]/u, 1)[0];
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/u, 1)[0];
  }
}
