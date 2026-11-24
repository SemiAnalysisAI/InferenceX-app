/**
 * Requests an inline document script started before the page's JavaScript loaded, keyed by the
 * exact URL `fetchJson` asks for. `inferenceEarlyFetchScript` writes them.
 */
export const EARLY_FETCH_GLOBAL = '__infxEarlyFetch';

/**
 * An older entry is dropped rather than answering a much later request, such as a client
 * navigation to a page the document load did not show.
 */
export const EARLY_FETCH_MAX_AGE_MS = 60_000;

export interface EarlyFetch {
  /** `performance.now()` when the request started. */
  startedAt: number;
  response: Promise<Response>;
}

export type EarlyFetchRegistry = Partial<Record<string, EarlyFetch>>;

declare global {
  // Named by EARLY_FETCH_GLOBAL.
  var __infxEarlyFetch: EarlyFetchRegistry | undefined;
}

function untilAborted(response: Promise<Response>, signal: AbortSignal): Promise<Response> {
  // The executor form, because Promise.withResolvers is missing from browsers the site supports.
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    response.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function settledEarlyResponse(
  response: Promise<Response>,
  signal: AbortSignal | undefined,
): Promise<Response | undefined> {
  signal?.throwIfAborted();
  let settled: Response;
  try {
    settled = await (signal ? untilAborted(response, signal) : response);
  } catch {
    if (signal?.aborted) throw signal.reason;
    return undefined;
  }
  if (settled.ok) return settled;
  void settled.body?.cancel().catch(() => {});
  return undefined;
}

/**
 * The early response for `url`, at most once. Returns undefined synchronously when there is none
 * or it is too old, so the caller's own `fetch` starts in the same tick as before. The promise
 * resolves to undefined when the request failed or answered with an error status, so the caller
 * fetches the URL itself. An abort of `signal` rejects as `fetch` would.
 */
export function takeEarlyResponse(
  url: string,
  signal?: AbortSignal,
): Promise<Response | undefined> | undefined {
  const entries = globalThis.__infxEarlyFetch;
  const entry = entries?.[url];
  if (!entries || !entry) return undefined;
  delete entries[url];
  if (performance.now() - entry.startedAt > EARLY_FETCH_MAX_AGE_MS) return undefined;
  return settledEarlyResponse(entry.response, signal);
}
