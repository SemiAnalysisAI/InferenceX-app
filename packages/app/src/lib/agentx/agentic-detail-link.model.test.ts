import { afterEach, describe, expect, it, mock, vi } from 'bun:test';
import type * as AgenticDetailLink from '@/lib/agentx/agentic-detail-link';
import type * as UrlState from '@/lib/routing/url-state';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

// url-state reads the URL at import time, so each test loads fresh copies under a new specifier.
let generation = 0;
async function loadLink(pathname: string, search = ''): Promise<typeof AgenticDetailLink> {
  generation += 1;
  stubGlobal('window', {
    location: { search, pathname, hash: '', origin: 'https://example.com' },
    history: { replaceState: vi.fn(), state: null },
  });
  const urlState: typeof UrlState = await import(`@/lib/routing/url-state?model=${generation}`);
  mock.module('@/lib/routing/url-state', () => urlState);
  return import(`@/lib/agentx/agentic-detail-link?model=${generation}`);
}

afterEach(() => unstubAllGlobals());

describe('agenticDetailHref from a model route', () => {
  it('names the route model, which the chart state leaves to the path', async () => {
    const { agenticDetailHref } = await loadLink('/infx/inference/deepseek-v4');
    const href = agenticDetailHref(440106);
    expect(href.startsWith('/infx/inference/agentic/440106?')).toBe(true);
    expect(new URLSearchParams(href.split('?')[1]).get('g_model')).toBe('DeepSeek-V4-Pro');
  });

  it('names the route model on a Chinese model route too', async () => {
    const { agenticDetailHref } = await loadLink('/zh/infx/inference/kimi-k3');
    const href = agenticDetailHref(440106, 'zh');
    expect(href.startsWith('/zh/infx/inference/agentic/440106?')).toBe(true);
    expect(new URLSearchParams(href.split('?')[1]).get('g_model')).toBe('Kimi-K3');
  });

  it('adds no model off the Inference model routes', async () => {
    const { agenticDetailHref } = await loadLink('/infx/evaluation');
    expect(agenticDetailHref(440106)).not.toContain('g_model=');
  });
});
