import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/dist/experimental/testing/server/middleware-testing-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config, proxy } from './proxy';

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

it('sends an old Inference Performance power link to PowerX with its filters', () => {
  vi.stubGlobal('fetch', vi.fn());
  const response = proxy(
    new NextRequest(
      'https://inferencex.semianalysis.com/inference?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower',
    ),
    { waitUntil: vi.fn() },
  );
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(
    'https://inferencex.semianalysis.com/powerx?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower',
  );
});

it('canonicalizes a compare slug with any query intact, including i_metric and utm tags', () => {
  vi.stubGlobal('fetch', vi.fn());
  const response = proxy(
    new NextRequest(
      'https://inferencex.semianalysis.com/zh/compare/deepseek-r1-h100-vs-gb200?i_metric=y_tpPerGpu&utm_source=newsletter&utm_campaign=launch',
    ),
    { waitUntil: vi.fn() },
  );
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe(
    'https://inferencex.semianalysis.com/zh/compare/deepseek-r1-gb200-vs-h100?i_metric=y_tpPerGpu&utm_source=newsletter&utm_campaign=launch',
  );
});

it('passes a compare URL without a query through to the page', () => {
  vi.stubGlobal('fetch', vi.fn());
  const response = proxy(
    new NextRequest('https://inferencex.semianalysis.com/compare/deepseek-r1-h100-vs-gb200'),
    { waitUntil: vi.fn() },
  );
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
});

it.each(['', '/zh'])('canonicalizes only a gated saved selection before rendering %s', (locale) => {
  const query =
    '?g_model=GLM-5.3-Flash&unofficialrun=41352867682&i_seq=agentic-traces&utm_source=test';
  for (const path of [`${locale}/inference`, `${locale}/inference/kimi-k3`]) {
    const response = proxy(new NextRequest(`https://inferencex.semianalysis.com${path}${query}`), {
      waitUntil: vi.fn(),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://inferencex.semianalysis.com${locale}/inference/glm-5-3-flash${query}`,
    );
  }
});

it.each([
  '/inference/glm-5-3-flash?g_model=GLM-5.3-Flash',
  '/zh/inference/glm-5-3-flash?g_model=GLM-5.3-Flash',
  '/inference?g_model=Kimi-K3',
  '/inference?g_model=not-a-model',
  '/api/v1/benchmarks?g_model=GLM-5.3-Flash',
])('leaves canonical, public, invalid and API selections unchanged: %s', (path) => {
  const response = proxy(new NextRequest(`https://inferencex.semianalysis.com${path}`), {
    waitUntil: vi.fn(),
  });
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.has('location')).toBe(false);
});

it('retains PowerX and compare redirect precedence with a gated saved model', () => {
  for (const [path, expected, status] of [
    [
      '/inference?g_model=GLM-5.3-Flash&i_metric=y_measuredAvgPower',
      '/powerx?g_model=GLM-5.3-Flash&i_metric=y_measuredAvgPower',
      307,
    ],
    [
      '/compare/deepseek-r1-h100-vs-gb200?g_model=GLM-5.3-Flash',
      '/compare/deepseek-r1-gb200-vs-h100?g_model=GLM-5.3-Flash',
      308,
    ],
  ] as const) {
    const response = proxy(new NextRequest(`https://inferencex.semianalysis.com${path}`), {
      waitUntil: vi.fn(),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('location')).toBe(`https://inferencex.semianalysis.com${expected}`);
  }
});

describe('proxy matcher', () => {
  it.each([
    '/api/v1/availability',
    '/api/openapi.json',
    '/embed/model/test',
    '/zh/embed/model/test',
    '/inference?i_metric=y_measuredAvgPower',
    '/inference/deepseek-r1?i_power=certified',
    '/zh/inference?i_power=legacy',
    '/zh/inference/deepseek-r1?i_metric=y_measuredAvgPower',
    '/inference?g_model=GLM-5.3-Flash',
    '/zh/inference/kimi-k3?g_model=GLM-5.3-Flash',
    '/inference?g_model=GLM%2D5.3%2DFlash',
    '/compare/deepseek-r1-b200-vs-mi355x?g_model=DeepSeek-R1-0528',
    '/zh/compare-per-dollar/deepseek-r1-b200-vs-mi355x?i_seq=8k%2F1k',
    '/compare-precision/deepseek-r1-b200-fp4-vs-fp8/agentic?i_prec=fp4',
    '/compare/deepseek-r1-mi355x-vs-b200?i_metric=y_tpPerGpu',
    '/zh/compare-spec-decode/deepseek-r1-b200-fp8-mtp?utm_source=x',
    '/compare/deepseek-r1-b200-vs-mi355x',
  ])('runs on %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it('skips client RSC navigations to compare pages', () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: '/compare/deepseek-r1-mi355x-vs-b200?i_metric=y_tpPerGpu',
        headers: { rsc: '1' },
      }),
    ).toBe(false);
  });

  it.each([
    '/',
    '/zh',
    '/inference',
    '/inference/deepseek-r1?g_model=DeepSeek-R1-0528',
    '/inference?g_model=GLM-5.3-Flash-extra',
    '/inference?g_model=GLM-5x3-Flash',
    '/inference?g_model=not-a-model',
    '/compare-per-dollar/deepseek-r1-b200-vs-mi355x/performance-per-dollar.png?lang=zh',
    '/compare/deepseek-r1-b200-vs-mi355x/8k-1k/extra?utm_source=x',
    '/compare?g_model=DeepSeek-R1-0528',
    '/comparisons/x?g_model=DeepSeek-R1-0528',
    '/blog/some-post',
    '/_next/static/chunks/main.js',
    '/_next/image?url=%2Fimages%2Fa.png&w=1200&q=75',
    '/favicon.ico',
    '/images/post/figure.png',
    '/brand/left-pattern-full.svg',
    '/ingest/e/',
  ])('skips %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
