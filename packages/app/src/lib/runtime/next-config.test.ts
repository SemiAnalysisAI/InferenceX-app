import { AsyncLocalStorage } from 'node:async_hooks';
import { convertRedirects } from '@vercel/routing-utils/dist/superstatic';
import { describe, expect, it } from 'vitest';

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
  it.each([
    ['/about/', '/about'],
    ['/zh/blog/some-post/', '/zh/blog/some-post'],
    ['/datasets', '/agentx'],
    ['/zh/datasets', '/zh/agentx'],
    ['/xvideo', '/video'],
    ['/zh/xxvideo', '/zh/video'],
    ['/ubenchx', '/ubenchx/mem-bw'],
    ['/zh/ubenchx', '/zh/ubenchx/mem-bw'],
    ['/run/glm-5-2-on-b200', '/run/glm-5-3-on-b200'],
    ['/zh/run/glm-5-2-on-mi355x', '/zh/run/glm-5-3-on-mi355x'],
    ['/zh/rankings/cheapest-gpu-for-glm-5-2', '/zh/rankings/cheapest-gpu-for-glm-5-3'],
    ['/rankings/fastest-gpu-for-minimax-m3-1', '/rankings/fastest-gpu-for-minimax-m31-flash'],
    ['/media', '/quotes'],
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
    '/brand/left-pattern-full.svg',
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
      '/inference',
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
