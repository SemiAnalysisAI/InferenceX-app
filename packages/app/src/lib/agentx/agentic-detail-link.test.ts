import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupWindow(search = '', pathname = '/infx/inference') {
  vi.stubGlobal('window', {
    location: { search, pathname, hash: '', origin: 'https://example.com' },
    history: { replaceState: vi.fn(), state: null },
  });
}

describe('agenticDetailHref', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps a Chinese reader on /zh', async () => {
    setupWindow('', '/zh/infx/inference');
    const { agenticDetailHref } = await import('@/lib/agentx/agentic-detail-link');

    expect(agenticDetailHref(440106, 'zh')).toBe('/zh/infx/inference/agentic/440106');
    expect(agenticDetailHref(440106, 'en')).toBe('/infx/inference/agentic/440106');
  });

  it('defaults to the English path when no locale is given', async () => {
    setupWindow('', '/infx/inference');
    const { agenticDetailHref } = await import('@/lib/agentx/agentic-detail-link');
    expect(agenticDetailHref(440106)).toBe('/infx/inference/agentic/440106');
  });

  it('carries the chart state so the detail page can link back to it', async () => {
    setupWindow('', '/infx/inference');
    const { agenticDetailHref } = await import('@/lib/agentx/agentic-detail-link');
    const { writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', i_active: 'gb200_dynamo-vllm' });
    const href = agenticDetailHref(440106, 'en');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));

    expect(href.startsWith('/infx/inference/agentic/440106?')).toBe(true);
    expect(params.get('g_model')).toBe('Kimi-K3');
    expect(params.get('i_active')).toBe('gb200_dynamo-vllm');
  });

  it('carries an unofficial-run overlay so the round trip keeps the overlay', async () => {
    setupWindow('?unofficialruns=987654321', '/infx/inference');
    const { agenticDetailHref } = await import('@/lib/agentx/agentic-detail-link');
    const { writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    const href = agenticDetailHref(440106, 'zh');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));

    expect(href.startsWith('/zh/infx/inference/agentic/440106?')).toBe(true);
    expect(params.get('unofficialruns')).toBe('987654321');
  });

  it('stays a bare path when the chart is on defaults', async () => {
    setupWindow('', '/infx/inference');
    const { agenticDetailHref } = await import('@/lib/agentx/agentic-detail-link');
    const { writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'DeepSeek-V4-Pro' });
    await vi.advanceTimersByTimeAsync(200);

    expect(agenticDetailHref(440106, 'en')).toBe('/infx/inference/agentic/440106');
  });
});
