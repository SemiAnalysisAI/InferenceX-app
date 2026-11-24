import { describe, it, expect, vi, beforeEach, afterEach, mock } from 'bun:test';
import type * as AgenticDetailLink from '@/lib/agentx/agentic-detail-link';
import type * as UrlState from '@/lib/routing/url-state';
import {
  advanceTimersByTimeAsync,
  stubGlobal,
  unstubAllGlobals,
  useFakeTimers,
  useRealTimers,
} from '@/test/helpers';

// The link reads chart state from url-state, which keeps module-level state and reads the URL at
// import time. bun:test has no resetModules, so each test loads fresh copies of both under a new
// specifier and points the link's url-state import at the fresh copy.
let moduleGeneration = 0;
function resetModules() {
  moduleGeneration += 1;
}
async function importUrlState(): Promise<typeof UrlState> {
  const urlState: typeof UrlState = await import(
    `@/lib/routing/url-state?generation=${moduleGeneration}`
  );
  mock.module('@/lib/routing/url-state', () => urlState);
  return urlState;
}
async function importAgenticDetailLink(): Promise<typeof AgenticDetailLink> {
  await importUrlState();
  return import(`@/lib/agentx/agentic-detail-link?generation=${moduleGeneration}`);
}

function setupWindow(search = '', pathname = '/infx/inference') {
  stubGlobal('window', {
    location: { search, pathname, hash: '', origin: 'https://example.com' },
    history: { replaceState: vi.fn(), state: null },
  });
}

describe('agenticDetailHref', () => {
  beforeEach(() => {
    useFakeTimers();
    resetModules();
  });

  afterEach(() => {
    useRealTimers();
    unstubAllGlobals();
  });

  it('keeps a Chinese reader on /zh', async () => {
    setupWindow('', '/zh/infx/inference');
    const { agenticDetailHref } = await importAgenticDetailLink();

    expect(agenticDetailHref(440106, 'Kimi-K3', 'zh')).toBe(
      '/zh/infx/inference/agentic/440106?g_model=Kimi-K3',
    );
    expect(agenticDetailHref(440106, 'Kimi-K3', 'en')).toBe(
      '/infx/inference/agentic/440106?g_model=Kimi-K3',
    );
  });

  it('defaults to the English path when no locale is given', async () => {
    setupWindow('', '/infx/inference');
    const { agenticDetailHref } = await importAgenticDetailLink();
    expect(agenticDetailHref(440106, 'Kimi-K3')).toBe(
      '/infx/inference/agentic/440106?g_model=Kimi-K3',
    );
  });

  it('carries the chart state so the detail page can link back to it', async () => {
    setupWindow('', '/infx/inference');
    const { agenticDetailHref } = await importAgenticDetailLink();
    const { writeUrlParams } = await importUrlState();

    writeUrlParams({ g_model: 'Kimi-K3', i_active: 'gb200_dynamo-vllm' });
    const href = agenticDetailHref(440106, 'Kimi-K3', 'en');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));

    expect(href.startsWith('/infx/inference/agentic/440106?')).toBe(true);
    expect(params.get('g_model')).toBe('Kimi-K3');
    expect(params.get('i_active')).toBe('gb200_dynamo-vllm');
  });

  it('carries an unofficial-run overlay so the round trip keeps the overlay', async () => {
    setupWindow('?unofficialruns=987654321', '/infx/inference');
    const { agenticDetailHref } = await importAgenticDetailLink();
    const { writeUrlParams } = await importUrlState();

    writeUrlParams({ g_model: 'Kimi-K3' });
    const href = agenticDetailHref(440106, 'Kimi-K3', 'zh');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));

    expect(href.startsWith('/zh/infx/inference/agentic/440106?')).toBe(true);
    expect(params.get('unofficialruns')).toBe('987654321');
  });

  it("names only the point's model when the chart is on defaults", async () => {
    setupWindow('', '/infx/inference');
    const { agenticDetailHref } = await importAgenticDetailLink();
    const { writeUrlParams } = await importUrlState();

    writeUrlParams({ g_model: 'DeepSeek-V4-Pro' });
    await advanceTimersByTimeAsync(200);

    expect(agenticDetailHref(440106, 'DeepSeek-V4-Pro', 'en')).toBe(
      '/infx/inference/agentic/440106?g_model=DeepSeek-V4-Pro',
    );
  });
});
