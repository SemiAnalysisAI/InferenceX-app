import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { convertRedirects } from '@vercel/routing-utils/dist/superstatic';
import { describe, expect, it } from 'bun:test';

import nextConfig from '../../../next.config';

// Next's config tester throws at module load unless the AsyncLocalStorage global its runtime
// installs exists, so it is imported only after this assignment.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { getRedirectUrl, getRewrittenUrl, unstable_getResponseFromNextConfig } =
  await import('next/experimental/testing/server');

const respond = (path: string) =>
  unstable_getResponseFromNextConfig({
    url: `https://inferencex.semianalysis.com${path}`,
    nextConfig,
  });

describe('next.config custom routes', () => {
  it.each(['/infx/inference', '/zh/infx/inference'])(
    'temporarily redirects %s to Kimi K3.1 Pro and preserves query filters',
    async (path) => {
      for (const query of [
        '',
        '?i_seq=agentic-traces&i_prec=fp4&unofficialrun=123&utm_source=test',
      ]) {
        const response = await respond(`${path}${query}`);
        expect(response.status).toBe(307);
        expect(getRedirectUrl(response)).toBe(
          `https://inferencex.semianalysis.com${path}/kimi-k31-pro${query}`,
        );
      }
    },
  );

  it.each([
    '/infx/inference?i_metric=y_measuredAvgPower',
    '/zh/infx/inference?i_power=none,certified',
  ])('leaves the PowerX redirect on %s to the proxy', async (path) => {
    const response = await respond(path);
    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
  });

  it.each(['/infx/inference', '/zh/infx/inference'])(
    'preserves explicit model selections on %s',
    async (path) => {
      for (const suffix of [
        '?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces',
        '/deepseek-v4',
        '/deepseek-v41-flash',
        '/kimi-k31-pro',
        '/kimi-k3',
      ]) {
        const response = await respond(`${path}${suffix}`);
        expect(response.status).toBe(200);
        expect(getRedirectUrl(response)).toBeNull();
      }
    },
  );

  it.each([
    ['/about/', '/about'],
    ['/zh/blog/some-post/', '/zh/blog/some-post'],
    ['/datasets', '/infx/agentx'],
    ['/zh/datasets', '/zh/infx/agentx'],
    ['/xvideo', '/vgx'],
    ['/zh/xxvideo', '/zh/vgx'],
    ['/ubx', '/ubx/mem-bw'],
    ['/zh/ubx', '/zh/ubx/mem-bw'],
    ['/run/glm-5-2-on-b200', '/run/glm-5-3-on-b200'],
    ['/zh/run/glm-5-2-on-mi355x', '/zh/run/glm-5-3-on-mi355x'],
    ['/zh/rankings/cheapest-gpu-for-glm-5-2', '/zh/rankings/cheapest-gpu-for-glm-5-3'],
    ['/rankings/fastest-gpu-for-minimax-m3-1', '/rankings/fastest-gpu-for-minimax-m31-flash'],
    ['/zh/rankings/fastest-gpu-for-minimax-m3-1', '/zh/rankings/fastest-gpu-for-minimax-m31-flash'],
    ['/rankings/fastest-gpu-for-qwen-3-5-0', '/rankings/fastest-gpu-for-qwen-3-5'],
    ['/zh/rankings/fastest-gpu-for-qwen-3-5-0', '/zh/rankings/fastest-gpu-for-qwen-3-5'],
    ['/zh/rankings/fastest-gpu-for-minimax-m27-0', '/zh/rankings/fastest-gpu-for-minimax-m27'],
    [
      '/zh/blog/minimax-m3-agentx-b200-b300-vs-rack-scale-0',
      '/zh/blog/minimax-m3-agentx-b200-b300-vs-rack-scale',
    ],
    ['/media', '/quotes'],
    ['/zh/media', '/zh/quotes'],
    [
      '/compare-per-dollar/deepseek-r1-b200-vs-h100/performance-per-dollar.png?lang=zh',
      '/zh/compare-per-dollar/deepseek-r1-b200-vs-h100/performance-per-dollar.png?lang=zh',
    ],
    [
      '/compare-precision/deepseek-r1-b200-fp4-vs-fp8/precision-comparison.png?lang=zh',
      '/zh/compare-precision/deepseek-r1-b200-fp4-vs-fp8/precision-comparison.png?lang=zh',
    ],
    [
      '/compare-spec-decode/glm-5-1-h200-fp8-mtp-vs-none/spec-decode-comparison.png?lang=zh',
      '/zh/compare-spec-decode/glm-5-1-h200-fp8-mtp-vs-none/spec-decode-comparison.png?lang=zh',
    ],
  ])('permanently redirects %s to %s in one hop', async (from, to) => {
    const response = await respond(from);
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`https://inferencex.semianalysis.com${to}`);
  });

  it.each([
    ['/ingest/e/', 'https://us.i.posthog.com/e'],
    ['/ingest/decide', 'https://us.i.posthog.com/decide'],
    ['/ingest/static/array.js', 'https://us-assets.i.posthog.com/static/array.js'],
    ['/ingest/array/phc_key/config', 'https://us-assets.i.posthog.com/array/phc_key/config'],
  ])('proxies %s to PostHog without a trailing-slash redirect', async (from, to) => {
    const response = await respond(from);
    expect(response.status).toBe(200);
    expect(getRewrittenUrl(response)).toBe(to);
  });

  it.each([
    ['/about/', '/about'],
    ['/zh/', '/zh'],
    ['/zh/blog/some-post/', '/zh/blog/some-post'],
    ['/ingest/e/', null],
    ['/ingest/i/v0/e/', null],
  ])('strips the trailing slash from %s as compiled by Vercel', async (from, to) => {
    const routes = convertRedirects(await nextConfig.redirects!()).flatMap((r) => {
      const { src, headers } = r as { src?: string; headers?: Record<string, string> };
      return src && headers?.Location ? [{ src, location: headers.Location }] : [];
    });
    const route = routes.find((r) => new RegExp(r.src).test(from));
    if (to === null) {
      expect(route).toBeUndefined();
      return;
    }
    const match = from.match(new RegExp(route!.src))!;
    const location = match
      .slice(1)
      .reduce((loc, value, i) => loc.replaceAll(`$${i + 1}`, value ?? ''), route!.location);
    expect(location).toBe(to);
  });

  it.each([
    '/images/post/figure.png',
    '/brand/logo-color.webp',
    '/logos/nvidia.svg',
    '/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3/cover.webp',
    '/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3/pdf/summary.pdf',
    '/favicon.ico',
    '/og-image.png',
  ])('lets browsers reuse %s for a day and revalidate in the background', async (path) => {
    const response = await respond(path);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800',
    );
  });

  it('leaves pages and API responses on their own cache headers', async () => {
    for (const path of [
      '/',
      '/infx/inference',
      '/api/v1/availability',
      '/whitepaper',
      '/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3',
      '/zh/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3',
    ]) {
      const response = await respond(path);
      expect(response.headers.get('cache-control')).toBeNull();
    }
  });

  it.each([
    ['/', 'en'],
    ['/about', 'en'],
    ['/zhou-chart', 'en'],
    ['/zh', 'zh-CN'],
    ['/zh/blog/some-post', 'zh-CN'],
  ])('labels %s with Content-Language %s', async (path, language) => {
    const response = await respond(path);
    expect(response.headers.get('content-language')).toBe(language);
  });
});

it('loads the production config through Next’s transpiler without Vitest alias resolution', () => {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `
    const { transpileConfig } = require('next/dist/build/next-config-ts/transpile-config');
    transpileConfig({ nextConfigPath: require('node:path').resolve('next.config.ts'), dir: process.cwd() })
      .then(async loaded => {
        const config = loaded.default ?? loaded;
        const redirects = await config.redirects();
        if (!redirects.some(route => route.source === '/datasets' && route.destination === '/infx/agentx')) throw new Error('Dashboard redirects missing');
        process.stdout.write('config-loaded');
      })
      .catch(error => { console.error(error); process.exitCode = 1; });
  `,
    ],
    {
      cwd: resolve(import.meta.dirname, '../../..'),
      encoding: 'utf8',
      env: { ...process.env, __NEXT_NODE_NATIVE_TS_LOADER_ENABLED: 'false' },
    },
  );
  expect(output).toContain('config-loaded');
});
