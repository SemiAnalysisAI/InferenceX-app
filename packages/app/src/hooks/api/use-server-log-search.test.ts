import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '@/lib/api/api-request-error';

import { shouldRetryServerLogSearch } from './use-server-log-search';

const url = '/api/v1/server-log-search?id=42&q=ready';

describe('shouldRetryServerLogSearch', () => {
  it('retries a transient failure once', () => {
    const error = new ApiRequestError('server-log-search 500', 500, url);
    expect(shouldRetryServerLogSearch(0, error)).toBe(true);
    expect(shouldRetryServerLogSearch(1, error)).toBe(false);
  });

  it('never retries a search that ran out of server time', () => {
    const error = new ApiRequestError('server-log-search 504', 504, url);
    expect(shouldRetryServerLogSearch(0, error)).toBe(false);
  });

  it('retries a network error once', () => {
    expect(shouldRetryServerLogSearch(0, new TypeError('fetch failed'))).toBe(true);
  });
});
