import { CancelledError } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { mocked, stubGlobal, unstubAllGlobals } from '@/test/helpers';

import { ApiRequestError, requestEndpoint } from '../api/api-request-error';
import { createAppQueryClient } from '@/providers/query-provider';

import { trackOncePerPageview } from './analytics';
import {
  describeDataQueryFailure,
  ExpectedQueryFailureError,
  reportDataQueryFailure,
} from './query-error-analytics';

mock.module('./analytics', () => ({ trackOncePerPageview: vi.fn(() => true) }));

const request = {
  key: ['benchmarks', 'dsr1'],
  hash: '["benchmarks","dsr1"]',
  throwsToErrorBoundary: false,
};

describe('requestEndpoint', () => {
  it('keeps the path without query or hash, and the host for other origins', () => {
    expect(requestEndpoint('/api/v1/benchmarks?model=dsr1#x')).toBe('/api/v1/benchmarks');
    expect(requestEndpoint('https://openrouter.ai/api/v1/models?x=1')).toBe(
      'openrouter.ai/api/v1/models',
    );
    expect(requestEndpoint('relative/path?x=1')).toBe('relative/path');
  });
});

describe('describeDataQueryFailure', () => {
  it('reads endpoint and status from ApiRequestError', () => {
    const error = new ApiRequestError('API error: 503', 503, '/api/v1/benchmarks?model=dsr1');
    expect(describeDataQueryFailure(error, request, 'query', '/zh/infx/inference/dsr1')).toEqual({
      kind: 'query',
      query_key: 'benchmarks',
      endpoint: '/api/v1/benchmarks',
      status: 503,
      route_template: '/infx/inference/[model]',
    });
  });

  it('reports the error name and a truncated message for non-HTTP failures', () => {
    expect(
      describeDataQueryFailure(
        new TypeError('Failed to fetch'),
        { ...request, key: [7] },
        'query',
        '/',
      ),
    ).toEqual({
      kind: 'query',
      query_key: 'unknown',
      error_name: 'TypeError',
      error_message: 'Failed to fetch',
      route_template: '/',
    });
    expect(
      describeDataQueryFailure(new SyntaxError('x'.repeat(500)), request, 'query', '/')
        ?.error_message,
    ).toHaveLength(200);
  });

  it('skips cancellations, aborts, and errors that reach an error boundary', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(describeDataQueryFailure(new CancelledError(), request, 'query', '/')).toBeNull();
    expect(describeDataQueryFailure(abort, request, 'query', '/')).toBeNull();
    expect(
      describeDataQueryFailure(
        new Error('x'),
        { ...request, throwsToErrorBoundary: true },
        'query',
        '/',
      ),
    ).toBeNull();
    expect(
      describeDataQueryFailure(new ExpectedQueryFailureError('expired'), request, 'query', '/'),
    ).toBeNull();
  });
});

describe('reportDataQueryFailure', () => {
  beforeEach(() => {
    stubGlobal('window', {
      location: new URL('https://inferencex.semianalysis.com/infx/evaluation'),
    });
  });

  afterEach(() => {
    unstubAllGlobals();
    mocked(trackOncePerPageview).mockClear();
  });

  it('dedupes per query hash and kind within a page view', () => {
    reportDataQueryFailure(new ApiRequestError('x', 500, '/api/v1/evaluations'), request);
    expect(trackOncePerPageview).toHaveBeenCalledWith(
      'data_query_failed',
      expect.objectContaining({ status: 500, route_template: '/infx/evaluation' }),
      'query:["benchmarks","dsr1"]',
    );
  });

  it('is wired into the app QueryClient after retries are exhausted', async () => {
    const client = createAppQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    await client
      .fetchQuery({
        queryKey: ['evaluations'],
        queryFn: () => Promise.reject(new ApiRequestError('x', 502, '/api/v1/evaluations')),
      })
      .catch(() => {});
    expect(trackOncePerPageview).toHaveBeenCalledWith(
      'data_query_failed',
      {
        kind: 'query',
        query_key: 'evaluations',
        endpoint: '/api/v1/evaluations',
        status: 502,
        route_template: '/infx/evaluation',
      },
      'query:["evaluations"]',
    );
  });
});
