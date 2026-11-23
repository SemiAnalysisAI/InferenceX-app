import { isCancelledError, type QueryKey } from '@tanstack/react-query';

import { ApiRequestError } from '../api/api-request-error';

import { trackOncePerPageview } from './analytics';
import { routeTemplateForPathname } from './route-template';

export const DATA_QUERY_FAILED_EVENT = 'data_query_failed';
const MAX_ERROR_MESSAGE_LENGTH = 200;

/** Thrown by a query for an expected outcome (for example an expired run) so it is not reported. */
export class ExpectedQueryFailureError extends Error {
  override name = 'ExpectedQueryFailureError';
}

/** The parts of a React Query `Query` or `Mutation` the reporter reads. */
export interface FailedRequest {
  key: QueryKey | undefined;
  /** Stable identity used for dedupe (React Query's `queryHash`). */
  hash: string;
  /** Errors from requests that throw to an error boundary are already tracked as `error_page_shown`. */
  throwsToErrorBoundary: boolean;
  /**
   * The query still holds data from an earlier fetch, so this was a background refetch (for
   * example the reconnect refetch after a laptop wakes) and readers keep seeing that data.
   */
  keepsData?: boolean;
}

export interface DataQueryFailure {
  kind: 'query' | 'mutation';
  /** The first query-key segment, which names the data source (for example `benchmarks`). */
  query_key: string;
  endpoint?: string;
  status?: number;
  /** Set for non-HTTP failures (network, parse, thrown by query code). */
  error_name?: string;
  error_message?: string;
  route_template: string;
}

function isAbort(error: unknown): boolean {
  return (
    isCancelledError(error) ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}

/**
 * Builds `data_query_failed` properties, or null for cancellations, boundary-handled errors, and
 * failed background refetches that left the previous data in place.
 */
export function describeDataQueryFailure(
  error: unknown,
  request: FailedRequest,
  kind: DataQueryFailure['kind'],
  pathname: string,
): DataQueryFailure | null {
  if (
    request.throwsToErrorBoundary ||
    request.keepsData ||
    isAbort(error) ||
    error instanceof ExpectedQueryFailureError
  )
    return null;
  const first = request.key?.[0];
  return {
    kind,
    query_key: typeof first === 'string' ? first : 'unknown',
    ...(error instanceof ApiRequestError
      ? { endpoint: error.endpoint, status: error.status }
      : error instanceof Error
        ? {
            error_name: error.name,
            error_message: error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
          }
        : { error_name: typeof error }),
    route_template: routeTemplateForPathname(pathname),
  };
}

/**
 * Sends `data_query_failed` once per failing query key per page view. Wired into the shared
 * `QueryCache`/`MutationCache` `onError`, which fire after React Query's retries are exhausted.
 */
export function reportDataQueryFailure(
  error: unknown,
  request: FailedRequest,
  kind: DataQueryFailure['kind'] = 'query',
): void {
  if (typeof window === 'undefined') return;
  const failure = describeDataQueryFailure(error, request, kind, window.location.pathname);
  if (failure)
    trackOncePerPageview(DATA_QUERY_FAILED_EVENT, { ...failure }, `${kind}:${request.hash}`);
}
