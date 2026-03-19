import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// helper to set up window mocks before module import
function setupWindow(search = '', pathname = '/inference') {
  const location = {
    search,
    pathname,
    origin: 'https://example.com',
  };
  const history = { replaceState: vi.fn() };

  vi.stubGlobal('window', { location, history });
  return { location, history };
}

describe('PARAM_DEFAULTS', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    setupWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has expected default for g_model', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/url-state');
    expect(PARAM_DEFAULTS.g_model).toBe('DeepSeek-R1-0528');
  });

  it('has expected default for i_seq', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/url-state');
    expect(PARAM_DEFAULTS.i_seq).toBe('8k/1k');
  });

  it('has expected default for r_range', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/url-state');
    expect(PARAM_DEFAULTS.r_range).toBe('last-3-months');
  });

  it('has empty string defaults for optional params', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/url-state');
    expect(PARAM_DEFAULTS.g_rundate).toBe('');
    expect(PARAM_DEFAULTS.i_gpus).toBe('');
    expect(PARAM_DEFAULTS.e_bench).toBe('');
  });

  it('has empty string default for i_gradlabel', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/url-state');
    expect(PARAM_DEFAULTS.i_gradlabel).toBe('');
  });

  it('has empty string default for i_advlabel', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/url-state');
    expect(PARAM_DEFAULTS.i_advlabel).toBe('');
  });
});

describe('readUrlParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns params that were in the URL at load time', async () => {
    setupWindow('?g_model=llama-3&i_seq=2k/4k');
    const { readUrlParams } = await import('@/lib/url-state');
    const params = readUrlParams();
    expect(params.g_model).toBe('llama-3');
    expect(params.i_seq).toBe('2k/4k');
  });

  it('reads i_gradlabel and i_advlabel from URL', async () => {
    setupWindow('?i_gradlabel=0&i_advlabel=1');
    const { readUrlParams } = await import('@/lib/url-state');
    const params = readUrlParams();
    expect(params.i_gradlabel).toBe('0');
    expect(params.i_advlabel).toBe('1');
  });

  it('returns empty object when no URL params exist', async () => {
    setupWindow('');
    const { readUrlParams } = await import('@/lib/url-state');
    expect(readUrlParams()).toEqual({});
  });

  it('ignores unknown URL params', async () => {
    setupWindow('?g_model=test&unknown_key=value');
    const { readUrlParams } = await import('@/lib/url-state');
    const params = readUrlParams();
    expect(params.g_model).toBe('test');
    expect(params).not.toHaveProperty('unknown_key');
  });
});

describe('hasAnyUrlParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns true when search has known params', async () => {
    setupWindow('?g_model=test');
    const { hasAnyUrlParams } = await import('@/lib/url-state');
    expect(hasAnyUrlParams()).toBe(true);
  });

  it('returns false when search has only unknown params', async () => {
    setupWindow('?foo=bar');
    const { hasAnyUrlParams } = await import('@/lib/url-state');
    expect(hasAnyUrlParams()).toBe(false);
  });

  it('returns false when search is empty', async () => {
    setupWindow('');
    const { hasAnyUrlParams } = await import('@/lib/url-state');
    expect(hasAnyUrlParams()).toBe(false);
  });
});

describe('writeUrlParams + buildShareUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stores params and includes them in share URL after flush', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'test-model' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=test-model');
  });

  it('removes params that match their default value', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    // write default value, should be omitted
    writeUrlParams({ g_model: 'DeepSeek-R1-0528' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).not.toContain('g_model');
  });

  it('removes params with undefined value', async () => {
    setupWindow('?g_model=custom', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: undefined as any });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).not.toContain('g_model');
  });

  it('batches multiple params in a single debounce window', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'a' });
    writeUrlParams({ i_seq: 'b' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=a');
    expect(url).toContain('i_seq=b');
  });

  it('flushes pending writes synchronously when buildShareUrl is called', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'immediate' });
    // don't advance timers, buildShareUrl should flush synchronously
    const url = buildShareUrl();
    expect(url).toContain('g_model=immediate');
  });
});

describe('SSR safety', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('readUrlParams returns empty object when window is undefined', async () => {
    vi.stubGlobal('window', undefined);
    const { readUrlParams } = await import('@/lib/url-state');
    expect(readUrlParams()).toEqual({});
  });

  it('hasAnyUrlParams returns false when window is undefined', async () => {
    vi.stubGlobal('window', undefined);
    const { hasAnyUrlParams } = await import('@/lib/url-state');
    expect(hasAnyUrlParams()).toBe(false);
  });
});

describe('buildShareUrl tab filtering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('includes only inference-tab params when on /inference', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'x', i_seq: 'y', r_range: 'last-7-days' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).toContain('i_seq=y');
    expect(url).not.toContain('r_range');
  });

  it('includes only evaluation-tab params when on /evaluation', async () => {
    setupWindow('', '/evaluation');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'x', e_bench: 'mmlu', i_seq: 'y' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).toContain('e_bench=mmlu');
    expect(url).not.toContain('i_seq');
  });

  it('includes only reliability-tab params when on /reliability', async () => {
    setupWindow('', '/reliability');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ r_range: 'last-7-days', g_model: 'x' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('r_range=last-7-days');
    expect(url).not.toContain('g_model');
  });

  it('defaults to inference tab prefixes when on root path', async () => {
    setupWindow('', '/');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/url-state');

    writeUrlParams({ g_model: 'x', r_range: 'last-7-days' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).not.toContain('r_range');
  });

  it('omits query string when no non-default params exist', async () => {
    setupWindow('', '/inference');
    const { buildShareUrl } = await import('@/lib/url-state');

    const url = buildShareUrl();
    expect(url).not.toContain('?');
  });
});
