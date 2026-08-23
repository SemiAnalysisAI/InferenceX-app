import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import { cachedJson, cachedQuery } from './api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from './public-api-errors';

interface CachedReadRouteOptions<T> {
  readonly cacheKey: string;
  readonly fetch: () => Promise<T>;
  readonly logLabel: string;
  readonly blobOnly?: boolean;
  readonly fixture?: () => T;
}

/** Build the standard parameterless, public, cached database-read handler. */
export function cachedReadRoute<T>(options: CachedReadRouteOptions<T>): () => Promise<Response> {
  const getCached = cachedQuery(options.fetch, options.cacheKey, {
    blobOnly: options.blobOnly,
  });

  return async () => {
    if (FIXTURES_MODE && options.fixture) return cachedJson(options.fixture());

    try {
      return cachedJson(await getCached());
    } catch (error) {
      console.error(`Error fetching ${options.logLabel}:`, error);
      return publicApiError(PUBLIC_API_ERRORS.internal, 500);
    }
  };
}
