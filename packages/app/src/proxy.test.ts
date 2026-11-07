import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/dist/experimental/testing/server/middleware-testing-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPARE_MODEL_ALIASES } from '@/lib/compare/compare-slug';
import { LEGACY_DASHBOARD_PATHS } from '@/lib/routing/legacy-dashboard-redirect';
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
      'https://inferencex.semianalysis.com/infx/inference?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower',
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
  for (const path of [`${locale}/infx/inference`, `${locale}/infx/inference/kimi-k3`]) {
    const response = proxy(new NextRequest(`https://inferencex.semianalysis.com${path}${query}`), {
      waitUntil: vi.fn(),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://inferencex.semianalysis.com${locale}/infx/inference/glm-5-3-flash${query}`,
    );
  }
});

it.each([
  '/infx/inference/glm-5-3-flash?g_model=GLM-5.3-Flash',
  '/zh/infx/inference/glm-5-3-flash?g_model=GLM-5.3-Flash',
  '/infx/inference?g_model=Kimi-K3',
  '/infx/inference?g_model=not-a-model',
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
      '/infx/inference?g_model=GLM-5.3-Flash&i_metric=y_measuredAvgPower',
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

it('canonicalizes a model-route alias with its query', () => {
  const response = proxy(
    new NextRequest(
      'https://inferencex.semianalysis.com/zh/infx/profit-estimator/DeepSeek-V4/target/24?i_pctl=p75&utm_source=x',
    ),
    { waitUntil: vi.fn() },
  );
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe(
    'https://inferencex.semianalysis.com/zh/infx/profit-estimator/deepseek-v4/target/24?utm_source=x',
  );
});

it('moves a legacy OperatorX op link to its category path with the rest of its query', () => {
  const response = proxy(
    new NextRequest('https://inferencex.semianalysis.com/zh/opx?op=model&model=DeepSeek-V4-Pro'),
    { waitUntil: vi.fn() },
  );
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe(
    'https://inferencex.semianalysis.com/zh/opx/model?model=DeepSeek-V4-Pro',
  );
});

const redirect = (path: string, headers?: HeadersInit) =>
  proxy(new NextRequest(`https://inferencex.semianalysis.com${path}`, { headers }), {
    waitUntil: vi.fn(),
  });

describe('legacy dashboard paths', () => {
  it.each([
    ['/inference/deepseek-r1?i_seq=8k%2F1k', '/infx/inference/deepseek-r1?i_seq=8k%2F1k'],
    ['/zh/historical', '/zh/infx/historical'],
    ['/inference', '/infx/inference'],
    [
      '/zh/profit-estimator-per-gigawatt/kimi-k3/target/30',
      '/zh/infx/profit-estimator-per-gigawatt/kimi-k3/target/30',
    ],
    [
      '/inference/agentic/206860?i_seq=agentic-traces',
      '/infx/inference/agentic/206860?i_seq=agentic-traces',
    ],
    ['/agentx/methodology', '/infx/agentx/methodology'],
    ['/zh/agentx/cc-traces-weka-full?tab=x', '/zh/infx/agentx/cc-traces-weka-full?tab=x'],
    ['/agentic-workload-explorer/methodology', '/infx/agentic-workload-explorer/methodology'],
    ['/gpu-specs', '/infx/gpu-specs'],
    ['/operatorx', '/opx'],
    ['/zh/operatorx/attention', '/zh/opx/attention'],
    ['/operatorx?op=model', '/opx/model'],
    ['/zh/operatorx?op=gemm&workload=gemm', '/zh/opx/gemm?workload=gemm'],
    ['/operatorx?op=bogus&model=x', '/opx?model=x'],
    ['/infx', '/infx/inference'],
    ['/zh/infx?utm_source=x', '/zh/infx/inference?utm_source=x'],
  ])('sends %s to %s in one 308', (from, to) => {
    const response = redirect(from);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`https://inferencex.semianalysis.com${to}`);
  });

  it('applies the new-path redirects in the same hop', () => {
    for (const [from, to, status] of [
      [
        '/inference?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower',
        '/powerx?g_model=DeepSeek-R1-0528&i_metric=y_measuredAvgPower',
        307,
      ],
      [
        '/zh/profit-estimator/DeepSeek-V4/target/24?i_pctl=p75&utm_source=x',
        '/zh/infx/profit-estimator/deepseek-v4/target/24?utm_source=x',
        308,
      ],
      [
        '/inference/kimi-k3?g_model=GLM-5.3-Flash',
        '/infx/inference/glm-5-3-flash?g_model=GLM-5.3-Flash',
        307,
      ],
    ] as const) {
      const response = redirect(from);
      expect(response.status).toBe(status);
      expect(response.headers.get('location')).toBe(`https://inferencex.semianalysis.com${to}`);
    }
  });

  it('never redirects API routes', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    for (const path of ['/api/v1/views/inference', '/api/v1/operatorx/compare']) {
      const response = redirect(path, { 'user-agent': 'inferencex-cli/1.0.0' });
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.has('location')).toBe(false);
    }
  });
});

describe('proxy matcher', () => {
  it.each(['inferencex-cli/1.2.3', 'inferencex-skill/0.4.0'])(
    'runs on API requests from %s',
    (userAgent) => {
      for (const url of ['/api/v1/availability', '/api/openapi.json']) {
        expect(
          unstable_doesMiddlewareMatch({ config, url, headers: { 'user-agent': userAgent } }),
        ).toBe(true);
      }
    },
  );

  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'xinferencex-cli/1.2.3',
    'InferenceX-CLI/1.2.3',
  ])('skips API requests from %s', (userAgent) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: '/api/v1/availability',
        headers: { 'user-agent': userAgent },
      }),
    ).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, url: '/api/v1/availability' })).toBe(false);
  });

  it('runs on every legacy dashboard path', () => {
    for (const first of LEGACY_DASHBOARD_PATHS.keys()) {
      for (const url of [`/${first}`, `/zh/${first}/a/b?x=1`]) {
        expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
      }
    }
  });

  it('runs on every model-route alias', () => {
    for (const alias of Object.keys(COMPARE_MODEL_ALIASES)) {
      for (const url of [
        `/infx/calculator/${alias}`,
        `/zh/infx/profit-estimator/${alias}/target/24`,
      ]) {
        expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
      }
    }
  });

  it.each([
    '/embed/model/test',
    '/zh/embed/model/test',
    '/infx/inference?i_metric=y_measuredAvgPower',
    '/infx/inference/deepseek-r1?i_power=certified',
    '/zh/infx/inference?i_power=legacy',
    '/zh/infx/inference/deepseek-r1?i_metric=y_measuredAvgPower',
    '/infx/inference?g_model=GLM-5.3-Flash',
    '/zh/infx/inference/kimi-k3?g_model=GLM-5.3-Flash',
    '/infx/inference?g_model=GLM%2D5.3%2DFlash',
    '/compare/deepseek-r1-b200-vs-mi355x?g_model=DeepSeek-R1-0528',
    '/zh/compare-per-dollar/deepseek-r1-b200-vs-mi355x?i_seq=8k%2F1k',
    '/compare-precision/deepseek-r1-b200-fp4-vs-fp8/agentic?i_prec=fp4',
    '/compare/deepseek-r1-mi355x-vs-b200?i_metric=y_tpPerGpu',
    '/zh/compare-spec-decode/deepseek-r1-b200-fp8-mtp?utm_source=x',
    '/compare/deepseek-r1-b200-vs-mi355x',
    '/compare/deepseek-r1-b200-vs-mi355x/AGENTIC?utm_source=x',
    '/zh/compare-precision/deepseek-r1-b200-fp4-vs-fp8/8K-1K',
    '/infx/historical/Kimi-K3?i_seq=1k%2F1k',
    '/infx/calculator/kimi',
    '/zh/infx/profit-estimator-per-gigawatt/kimi-k3/target/30/percentile/p75',
    '/infx/profit-estimator/kimi-k3?i_pctl=p75',
    '/zh/infx/profit-estimator/kimi-k3/target/30?percentile=p50',
    '/opx?op=model',
    '/zh/opx?op=gemm&workload=gemm',
    '/opx/gemm?op=moe',
    '/inference',
    '/zh/inference/deepseek-r1?i_seq=8k%2F1k',
    '/profit-estimator/kimi-k3/target/30',
    '/zh/profit-estimator-per-gigawatt',
    '/evaluation',
    '/historical/kimi-k3',
    '/calculator',
    '/fleet',
    '/first-token',
    '/cache-reuse',
    '/reliability',
    '/gpu-specs',
    '/submissions',
    '/ai-chart',
    '/current-inferencex-image',
    '/agentx',
    '/zh/agentx/methodology',
    '/agentic-workload-explorer/sessions/abc',
    '/operatorx',
    '/zh/operatorx/gemm',
    '/infx',
    '/zh/infx',
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
    '/infx/inference',
    '/infx/inference/deepseek-r1?g_model=DeepSeek-R1-0528',
    '/infx/inference?g_model=GLM-5.3-Flash-extra',
    '/infx/inference?g_model=GLM-5x3-Flash',
    '/infx/inference?g_model=not-a-model',
    '/compare-per-dollar/deepseek-r1-b200-vs-mi355x/performance-per-dollar.png?lang=zh',
    '/compare/deepseek-r1-b200-vs-mi355x/opengraph-image',
    '/zh/compare-spec-decode/deepseek-r1-b200-fp8-mtp/opengraph-image?v=2',
    '/infx/calculator',
    '/infx/evaluation',
    '/zh/infx/agentx/methodology',
    '/infx/agentic-workload-explorer',
    '/api/v1/views/inference',
    '/images/inference/figure.png',
    '/infx/calculator/kimi-k3?i_seq=1k%2F1k&g_model=Kimi-K3',
    '/infx/historical/kimi-k3',
    '/opx',
    '/opx/model?model=DeepSeek-V4-Pro',
    '/zh/opx/moe',
    '/infx/profit-estimator?i_pctl=p75',
    '/infx/profit-estimator/kimi-k3/target/30?c_power=modeled',
    '/compare/deepseek-r1-b200-vs-mi355x/8k-1k/extra?utm_source=x',
    '/compare?g_model=DeepSeek-R1-0528',
    '/comparisons/x?g_model=DeepSeek-R1-0528',
    '/blog/some-post',
    '/_next/static/chunks/main.js',
    '/_next/image?url=%2Fimages%2Fa.png&w=1200&q=75',
    '/favicon.ico',
    '/images/post/figure.png',
    '/brand/logo-color.webp',
    '/ingest/e/',
  ])('skips %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
