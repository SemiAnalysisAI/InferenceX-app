import { afterEach, describe, expect, it, mock, vi } from 'bun:test';
import type * as AgenticDetailLink from '@/lib/agentx/agentic-detail-link';
import type * as UrlState from '@/lib/routing/url-state';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

// url-state reads the URL at import time, so each render loads fresh copies under a new specifier.
let generation = 0;
async function loadLink(): Promise<typeof AgenticDetailLink> {
  generation += 1;
  const urlState: typeof UrlState = await import(`@/lib/routing/url-state?ssr=${generation}`);
  mock.module('@/lib/routing/url-state', () => urlState);
  return import(`@/lib/agentx/agentic-detail-link?ssr=${generation}`);
}

/** The href as the server renders it: no `window` at all. */
async function serverHref(model: string, locale: 'en' | 'zh'): Promise<string> {
  const { agenticDetailHref } = await loadLink();
  return agenticDetailHref(440106, model, locale);
}

/** The href as the client renders it during hydration, on the given page. */
async function clientHref(pathname: string, model: string, locale: 'en' | 'zh'): Promise<string> {
  stubGlobal('window', {
    location: { search: '', pathname, hash: '', origin: 'https://example.com' },
    history: { replaceState: vi.fn(), state: null },
  });
  const { agenticDetailHref } = await loadLink();
  return agenticDetailHref(440106, model, locale);
}

afterEach(() => unstubAllGlobals());

describe('agenticDetailHref renders the same on server and client', () => {
  for (const { page, model, locale, expected } of [
    {
      page: '/infx/inference/deepseek-v4',
      model: 'DeepSeek-V4-Pro',
      locale: 'en',
      expected: '/infx/inference/agentic/440106?g_model=DeepSeek-V4-Pro',
    },
    {
      page: '/infx/inference',
      model: 'DeepSeek-V4-Pro',
      locale: 'en',
      expected: '/infx/inference/agentic/440106?g_model=DeepSeek-V4-Pro',
    },
    {
      page: '/zh/infx/inference/kimi-k3',
      model: 'Kimi-K3',
      locale: 'zh',
      expected: '/zh/infx/inference/agentic/440106?g_model=Kimi-K3',
    },
    {
      page: '/zh/infx/inference',
      model: 'Kimi-K3',
      locale: 'zh',
      expected: '/zh/infx/inference/agentic/440106?g_model=Kimi-K3',
    },
  ] as const) {
    it(`names the point's model on ${page}`, async () => {
      expect(typeof window).toBe('undefined');
      const server = await serverHref(model, locale);
      const client = await clientHref(page, model, locale);
      expect(server).toBe(expected);
      expect(client).toBe(server);
    });
  }
});
