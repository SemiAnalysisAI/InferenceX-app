import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { proxy } from './proxy';

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key');
  vi.stubEnv('INFERENCEX_REQUEST_ANALYTICS', '1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('attaches one pending capture to the request lifetime and immediately continues', async () => {
  const pending = Promise.withResolvers<Response>();
  const send = vi.fn().mockReturnValue(pending.promise);
  vi.stubGlobal('fetch', send);
  const waitUntil = vi.fn();
  const event = { waitUntil };
  const response = proxy(
    new NextRequest('https://inferencex.semianalysis.com/api/v1/availability', {
      headers: { 'user-agent': 'inferencex-cli/1.0.0' },
    }),
    event,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('vary')).toBe(false);
  expect(response.headers.has('cache-control')).toBe(false);
  expect(waitUntil).toHaveBeenCalledTimes(1);
  pending.resolve(new Response('{}'));
  await waitUntil.mock.calls[0][0];
  expect(send).toHaveBeenCalledTimes(1);
});

it('preserves embed headers and CSP and sends no event for pages', () => {
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  const event = { waitUntil: vi.fn() };
  for (const path of ['/embed/model/test', '/zh/embed/model/test']) {
    const response = proxy(
      new NextRequest(`https://inferencex.semianalysis.com${path}?theme=light&skin=vllm`),
      event,
    );
    expect(response.headers.get('content-security-policy')).toBe('frame-ancestors *');
    expect(response.headers.get('x-middleware-request-x-inferencex-embed')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-inferencex-embed-theme')).toBe('light');
    expect(response.headers.get('x-middleware-request-x-inferencex-embed-skin')).toBe('vllm');
  }
  expect(send).not.toHaveBeenCalled();
});
