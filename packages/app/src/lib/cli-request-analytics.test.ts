import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRouteCatalog } from './api-route-catalog';
import { captureClientRequest } from './cli-request-analytics';

const send = vi.fn();
const request = (path = '/api/v1/benchmarks?model=private-client', headers = {}, method = 'GET') =>
  new Request(`https://inferencex.semianalysis.com${path}`, {
    method,
    headers: { 'user-agent': 'inferencex-cli/1.0.0', ...headers },
  });

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
  vi.stubEnv('INFERENCEX_REQUEST_ANALYTICS', '1');
  vi.stubGlobal(
    'fetch',
    send.mockReset().mockImplementation(() => Promise.resolve(new Response('{}'))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('client request attribution', () => {
  it('captures only bounded properties, without user data or identified profiles', async () => {
    await captureClientRequest(
      request('/api/v1/datasets/customer-secret/conversations/private-id?token=secret', {
        authorization: 'secret',
        cookie: 'secret',
        'x-forwarded-for': '1.2.3.4',
        'user-agent': 'inferencex-skill/1.0.0',
        'x-inferencex-traffic': 'validation',
        'x-environment': 'preview',
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [url, options] = send.mock.calls[0];
    expect(url).toBe('https://us.i.posthog.com/capture/');
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      api_key: 'test-key',
      event: 'cli_api_request_received',
      distinct_id: 'inferencex-client-request-volume',
      timestamp: expect.any(String),
      properties: {
        source: 'skill',
        version: '1.0.0',
        route: '/api/v1/datasets/{slug}/conversations/{convId}',
        environment: 'production',
        traffic: 'validation',
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: 'inferencex-server',
      },
    });
    expect(options.body).not.toContain('secret');
  });

  it('normalizes every public GET and OpenAPI from the catalog', async () => {
    for (const entry of apiRouteCatalog) {
      send.mockClear();
      await captureClientRequest(
        request(entry.path.replaceAll(/\{[^}]+\}/gu, 'private-value'), {}, entry.method),
      );
      const eligible =
        entry.method === 'GET' &&
        (entry.classification === 'published-read' || entry.path === '/api/openapi.json');
      expect(send.mock.calls.length, `${entry.method} ${entry.path}`).toBe(eligible ? 1 : 0);
      if (eligible)
        expect(JSON.parse(send.mock.calls[0][1].body).properties.route).toBe(entry.path);
    }
  });

  it.each([
    'node',
    '',
    'inferencex-cli/01.0.0',
    'inferencex-cli/1.0.0 extra',
    'inferencex-cli/1.0.0,inferencex-skill/1.0.0',
    'inferencex-cli/1.0.0-private',
    'inferencex-cli/10000.1.2',
    'x'.repeat(500),
  ])('ignores malformed marker %s', async (value) => {
    await captureClientRequest(request(undefined, { 'user-agent': value }));
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores unmarked, private, unknown, non-GET and invalid traffic requests', async () => {
    await captureClientRequest(
      new Request('https://inferencex.semianalysis.com/api/v1/availability'),
    );
    for (const path of [
      '/api/v1/does-not-exist',
      '/api/v1/feedback',
      '/api/v1/invalidate',
      '/api/cron',
      '/api/v1/datasets//conversations',
    ]) {
      await captureClientRequest(request(path));
    }
    for (const method of ['POST', 'HEAD', 'OPTIONS'])
      await captureClientRequest(request(undefined, {}, method));
    await captureClientRequest(request(undefined, { 'x-inferencex-traffic': 'secret' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('separates preview and CI and disables local, unconfigured and switched-off collection', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    await captureClientRequest(request(undefined, { 'x-inferencex-traffic': 'ci' }));
    expect(JSON.parse(send.mock.calls[0][1].body).properties).toMatchObject({
      environment: 'preview',
      traffic: 'ci',
    });
    send.mockClear();
    vi.stubEnv('VERCEL_ENV', 'development');
    await captureClientRequest(request());
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('INFERENCEX_REQUEST_ANALYTICS', '0');
    await captureClientRequest(request());
    vi.stubEnv('INFERENCEX_REQUEST_ANALYTICS', '1');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    await captureClientRequest(request());
    expect(send).not.toHaveBeenCalled();
  });
});
