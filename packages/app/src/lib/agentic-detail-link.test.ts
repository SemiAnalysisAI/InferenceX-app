import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupWindow(search = '', pathname = '/inference') {
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
    setupWindow('', '/zh/inference');
    const { agenticDetailHref } = await import('@/lib/agentic-detail-link');

    // Without the prefix the /zh chart handed readers to the English detail
    // page, and every link out of that page kept them in English.
    expect(agenticDetailHref(440106, 'zh')).toBe('/zh/inference/agentic/440106');
    expect(agenticDetailHref(440106, 'en')).toBe('/inference/agentic/440106');
  });

  it('defaults to the English path when no locale is given', async () => {
    setupWindow('', '/inference');
    const { agenticDetailHref } = await import('@/lib/agentic-detail-link');
    expect(agenticDetailHref(440106)).toBe('/inference/agentic/440106');
  });

  it('carries the chart state so the detail page can link back to it', async () => {
    setupWindow('', '/inference');
    const { agenticDetailHref } = await import('@/lib/agentic-detail-link');
    const { writeUrlParams } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', i_active: 'gb200_dynamo-vllm' });
    const href = agenticDetailHref(440106, 'en');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));

    expect(href.startsWith('/inference/agentic/440106?')).toBe(true);
    expect(params.get('g_model')).toBe('Kimi-K3');
    expect(params.get('i_active')).toBe('gb200_dynamo-vllm');
  });

  it('carries an unofficial-run overlay so the round trip keeps the overlay', async () => {
    setupWindow('?unofficialruns=987654321', '/inference');
    const { agenticDetailHref } = await import('@/lib/agentic-detail-link');
    const { writeUrlParams } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    const href = agenticDetailHref(440106, 'zh');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));

    expect(href.startsWith('/zh/inference/agentic/440106?')).toBe(true);
    expect(params.get('unofficialruns')).toBe('987654321');
  });

  it('stays a bare path when the chart is on defaults', async () => {
    setupWindow('', '/inference');
    const { agenticDetailHref } = await import('@/lib/agentic-detail-link');
    const { writeUrlParams } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'DeepSeek-V4-Pro' });
    await vi.advanceTimersByTimeAsync(200);

    expect(agenticDetailHref(440106, 'en')).toBe('/inference/agentic/440106');
  });
});
