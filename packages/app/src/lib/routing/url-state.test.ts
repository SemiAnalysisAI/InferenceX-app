import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupWindow(search = '', pathname = '/inference', hash = '') {
  const location = {
    search,
    pathname,
    hash,
    origin: 'https://example.com',
  };
  const history = { replaceState: vi.fn(), state: { __NA: 1 } };

  vi.stubGlobal('window', { location, history, dispatchEvent: vi.fn() });
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
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.g_model).toBe('DeepSeek-V4-Pro');
  });

  it('defaults TCO to External so only Internal is share-link state', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.g_tco).toBe('internal');
  });

  it('has an EMPTY default for i_seq so the selected scenario is always written', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.i_seq).toBe('');
  });

  it('opens on tokens per dollar, or on measured power under any power tier filter', async () => {
    const { defaultYAxisMetric } = await import('@/lib/routing/url-state');
    const { DEFAULT_METRIC_CONFIG_KEY } = await import('@/components/inference/metric-registry');
    expect(defaultYAxisMetric([])).toBe('y_tokensPerDollarH');
    expect(defaultYAxisMetric([])).toBe(DEFAULT_METRIC_CONFIG_KEY);
    expect(defaultYAxisMetric(['certified'])).toBe('y_measuredAvgPower');
    expect(defaultYAxisMetric(['legacy'])).toBe('y_measuredAvgPower');
  });

  it('has expected default for r_range', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.r_range).toBe('last-3-months');
  });

  it('has empty string defaults for optional params', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.g_rundate).toBe('');
    expect(PARAM_DEFAULTS.i_gpus).toBe('');
    expect(PARAM_DEFAULTS.e_bench).toBe('');
  });

  it('has an empty default for the measured-power quick filter (filter off)', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.i_power).toBe('');
  });

  it('has empty string default for i_gradlabel', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.i_gradlabel).toBe('');
  });

  it.each(['1', '2'])(
    'preserves frontier mode %s and ignores retired hinterland state in share links',
    async (mode) => {
      setupWindow(`?i_frontier=${mode}&i_hinterland=${mode}`);
      const { PARAM_DEFAULTS, readUrlParams, buildShareUrl } =
        await import('@/lib/routing/url-state');
      expect(PARAM_DEFAULTS.i_frontier).toBe('');
      expect(PARAM_DEFAULTS).not.toHaveProperty('i_hinterland');
      expect(readUrlParams()).toMatchObject({ i_frontier: mode });
      expect(readUrlParams()).not.toHaveProperty('i_hinterland');
      const url = new URL(buildShareUrl());
      expect(url.searchParams.get('i_frontier')).toBe(mode);
      expect(url.searchParams.has('i_hinterland')).toBe(false);
    },
  );

  it('has empty string default for i_advlabel', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.i_advlabel).toBe('');
  });

  it('drops retired comparison controls from old share links while preserving analysis toggles', async () => {
    setupWindow(
      '?i_servicecompare=1&i_servicebase=baseline&i_servicepeer=comparator&i_servicetarget=8&i_roleshare=1&i_powerfit=1',
    );
    const { readUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');
    const params = readUrlParams();
    const shared = new URL(buildShareUrl()).searchParams;
    expect(params).toMatchObject({ i_roleshare: '1', i_powerfit: '1' });
    expect(shared.get('i_roleshare')).toBe('1');
    expect(shared.get('i_powerfit')).toBe('1');
    for (const key of ['i_servicecompare', 'i_servicebase', 'i_servicepeer', 'i_servicetarget']) {
      expect(params).not.toHaveProperty(key);
      expect(shared.has(key)).toBe(false);
    }
  });

  it('strips the normalized revenue source but preserves OpenRouter as explicit state', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.i_revenue).toBe('normalized');
  });

  it('has empty string defaults for legend-active params', async () => {
    const { PARAM_DEFAULTS } = await import('@/lib/routing/url-state');
    expect(PARAM_DEFAULTS.i_active).toBe('');
    expect(PARAM_DEFAULTS.i_best).toBe('');
    expect(PARAM_DEFAULTS.e_active).toBe('');
    expect(PARAM_DEFAULTS.r_active).toBe('');
  });

  it('keeps the fleet defaults aligned with URL-state stripping', async () => {
    const { DEFAULT_FLEET_MW, DEFAULT_LIFECYCLE_RAMP_MONTHS, PARAM_DEFAULTS } =
      await import('@/lib/routing/url-state');
    expect(DEFAULT_FLEET_MW).toBe('10');
    expect(DEFAULT_LIFECYCLE_RAMP_MONTHS).toBe('0.5');
    expect(PARAM_DEFAULTS.c_mw).toBe(DEFAULT_FLEET_MW);
    expect(PARAM_DEFAULTS.c_ramp).toBe(DEFAULT_LIFECYCLE_RAMP_MONTHS);
    expect(PARAM_DEFAULTS.c_costcap).toBe('');
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
    const { readUrlParams } = await import('@/lib/routing/url-state');
    const params = readUrlParams();
    expect(params.g_model).toBe('llama-3');
    expect(params.i_seq).toBe('2k/4k');
  });

  it('reads the Internal TCO basis from the URL', async () => {
    setupWindow('?g_tco=internal');
    const { readUrlParams } = await import('@/lib/routing/url-state');
    expect(readUrlParams().g_tco).toBe('internal');
  });

  it('reads i_gradlabel and i_advlabel from URL', async () => {
    setupWindow('?i_gradlabel=0&i_advlabel=1');
    const { readUrlParams } = await import('@/lib/routing/url-state');
    const params = readUrlParams();
    expect(params.i_gradlabel).toBe('0');
    expect(params.i_advlabel).toBe('1');
  });

  it('reads the token-revenue price source from the URL', async () => {
    setupWindow('?i_revenue=openrouter');
    const { readUrlParams } = await import('@/lib/routing/url-state');
    expect(readUrlParams().i_revenue).toBe('openrouter');
  });

  it('returns empty object when no URL params exist', async () => {
    setupWindow('');
    const { readUrlParams } = await import('@/lib/routing/url-state');
    expect(readUrlParams()).toEqual({});
  });

  it('ignores unknown URL params', async () => {
    setupWindow('?g_model=test&unknown_key=value');
    const { readUrlParams } = await import('@/lib/routing/url-state');
    const params = readUrlParams();
    expect(params.g_model).toBe('test');
    expect(params).not.toHaveProperty('unknown_key');
  });

  it('preserves the locale path, unrelated params, and hash when cleaning initial state', async () => {
    const { history } = setupWindow('?g_model=test&eval=42', '/zh/evaluation', '#sample-detail');
    await import('@/lib/routing/url-state');
    await vi.runAllTimersAsync();

    expect(history.replaceState).toHaveBeenCalledWith(
      history.state,
      '',
      '/zh/evaluation?eval=42#sample-detail',
    );
  });

  it('skips the deferred cleanup entirely when the URL has no share-link params', async () => {
    const { history } = setupWindow('?unrelated=1', '/');
    await import('@/lib/routing/url-state');
    await vi.runAllTimersAsync();

    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('cleans share-link params via the pristine History prototype, not the patched method', async () => {
    const { history } = setupWindow('?g_model=test&eval=42', '/inference');
    const pristine = vi.fn();
    vi.stubGlobal('History', { prototype: { replaceState: pristine } });
    await import('@/lib/routing/url-state');
    await vi.runAllTimersAsync();

    expect(history.replaceState).not.toHaveBeenCalled();
    expect(pristine).toHaveBeenCalledTimes(1);
    expect(pristine.mock.calls[0]).toEqual([history.state, '', '/inference?eval=42']);
    expect(pristine.mock.contexts[0]).toBe(history);
  });
});

describe('refreshUrlParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('picks up params that arrived via a client-side navigation', async () => {
    const { location } = setupWindow('', '/');
    const { readUrlParams, refreshUrlParams } = await import('@/lib/routing/url-state');
    expect(readUrlParams().g_model).toBeUndefined();

    location.search = '?g_model=Qwen-3.5-397B-A17B&i_seq=agentic-traces';
    location.pathname = '/inference';
    const refreshed = refreshUrlParams();

    expect(refreshed.g_model).toBe('Qwen-3.5-397B-A17B');
    expect(refreshed.i_seq).toBe('agentic-traces');
    expect(readUrlParams().g_model).toBe('Qwen-3.5-397B-A17B');
  });

  it('keeps existing params when the new URL omits them', async () => {
    const { location } = setupWindow('?g_model=Kimi-K3&i_seq=agentic-traces', '/inference');
    const { refreshUrlParams } = await import('@/lib/routing/url-state');

    location.search = '?i_seq=8k/1k';
    const refreshed = refreshUrlParams();

    expect(refreshed.i_seq).toBe('8k/1k');
    expect(refreshed.g_model).toBe('Kimi-K3');
  });

  it('flushes a pending filter before a retained provider refreshes on navigation', async () => {
    const { location } = setupWindow('?g_model=Kimi-K3', '/inference');
    const { readUrlParams, refreshUrlParams, writeUrlParams } =
      await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Qwen-3.5-397B-A17B' });
    location.search = '';
    location.pathname = '/evaluation';
    refreshUrlParams();

    expect(readUrlParams().g_model).toBe('Qwen-3.5-397B-A17B');
  });

  it('tracks explicit navigation intent separately from serialized state', async () => {
    const { location } = setupWindow('', '/inference');
    const { hasExplicitUrlParam, refreshUrlParams, writeUrlParams } =
      await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    expect(hasExplicitUrlParam('g_model')).toBe(false);

    location.search = '?g_model=GLM-5.2';
    refreshUrlParams();
    expect(hasExplicitUrlParam('g_model')).toBe(true);

    location.search = '';
    refreshUrlParams();
    expect(hasExplicitUrlParam('g_model')).toBe(false);
  });

  it('ignores unknown params', async () => {
    const { location } = setupWindow('', '/');
    const { refreshUrlParams } = await import('@/lib/routing/url-state');
    location.search = '?g_model=GLM-5.2&not_a_real_key=x';
    const refreshed = refreshUrlParams();
    expect(refreshed.g_model).toBe('GLM-5.2');
    expect(refreshed).not.toHaveProperty('not_a_real_key');
  });

  it('is a no-op without a window (SSR)', async () => {
    vi.stubGlobal('window', undefined);
    const { refreshUrlParams } = await import('@/lib/routing/url-state');
    expect(() => refreshUrlParams()).not.toThrow();
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
    const { hasAnyUrlParams } = await import('@/lib/routing/url-state');
    expect(hasAnyUrlParams()).toBe(true);
  });

  it('returns false when search has only unknown params', async () => {
    setupWindow('?foo=bar');
    const { hasAnyUrlParams } = await import('@/lib/routing/url-state');
    expect(hasAnyUrlParams()).toBe(false);
  });

  it('returns false when search is empty', async () => {
    setupWindow('');
    const { hasAnyUrlParams } = await import('@/lib/routing/url-state');
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
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'test-model' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=test-model');
  });

  it('keeps an explicit tokens-per-dollar metric, whose default status depends on i_power', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl, DEFAULT_Y_AXIS_METRIC } =
      await import('@/lib/routing/url-state');

    writeUrlParams({ i_metric: DEFAULT_Y_AXIS_METRIC, i_power: 'certified' });
    await vi.advanceTimersByTimeAsync(200);

    const params = new URL(buildShareUrl()).searchParams;
    expect(params.get('i_metric')).toBe('y_tokensPerDollarH');
    expect(params.get('i_power')).toBe('certified');
  });

  it('removes params that match their default value', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'DeepSeek-V4-Pro' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).not.toContain('g_model');
  });

  it('removes the revenue source instead of emitting an empty query param off-metric', async () => {
    setupWindow('?i_revenue=openrouter', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ i_revenue: 'normalized' });
    await vi.advanceTimersByTimeAsync(200);

    expect(buildShareUrl()).not.toContain('i_revenue');
  });

  it('removes params with undefined value', async () => {
    setupWindow('?g_model=custom', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: undefined as any });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).not.toContain('g_model');
  });

  it('keeps an explicit i_seq=8k/1k in the share URL (no longer stripped as a default)', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ i_seq: '8k/1k' });
    await vi.advanceTimersByTimeAsync(200);

    expect(buildShareUrl()).toContain('i_seq=8k%2F1k');
  });

  it('still strips i_seq when it is empty (the no-selection case)', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ i_seq: '' });
    await vi.advanceTimersByTimeAsync(200);

    expect(buildShareUrl()).not.toContain('i_seq');
  });

  it('batches multiple params in a single debounce window', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'a' });
    writeUrlParams({ i_seq: 'b' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=a');
    expect(url).toContain('i_seq=b');
  });

  it('flushes pending writes synchronously when buildShareUrl is called', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'immediate' });
    const url = buildShareUrl();
    expect(url).toContain('g_model=immediate');
  });

  it('flushes pending writes synchronously for a remounted provider', async () => {
    setupWindow('', '/inference');
    const { readUrlParams, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', i_seq: 'agentic-traces' });

    expect(readUrlParams()).toMatchObject({
      g_model: 'Kimi-K3',
      i_seq: 'agentic-traces',
    });
  });

  it('does not restore an initial param after the user resets it to default', async () => {
    setupWindow('?g_model=Kimi-K3', '/inference');
    const { readUrlParams, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'DeepSeek-V4-Pro' });

    expect(readUrlParams().g_model).toBeUndefined();
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
    const { readUrlParams } = await import('@/lib/routing/url-state');
    expect(readUrlParams()).toEqual({});
  });

  it('hasAnyUrlParams returns false when window is undefined', async () => {
    vi.stubGlobal('window', undefined);
    const { hasAnyUrlParams } = await import('@/lib/routing/url-state');
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
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'x', i_seq: 'y', r_range: 'last-7-days' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).toContain('i_seq=y');
    expect(url).not.toContain('r_range');
  });

  it('includes only evaluation-tab params when on /evaluation', async () => {
    setupWindow('', '/evaluation');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'x', e_bench: 'mmlu', i_seq: 'y' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).toContain('e_bench=mmlu');
    expect(url).not.toContain('i_seq');
  });

  it('includes only reliability-tab params when on /reliability', async () => {
    setupWindow('', '/reliability');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ r_range: 'last-7-days', g_model: 'x' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('r_range=last-7-days');
    expect(url).not.toContain('g_model');
  });

  it('includes global, inference and c_ params when on /calculator', async () => {
    setupWindow('', '/calculator');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({
      g_model: 'x',
      i_seq: 'y',
      i_pctl: 'p75',
      c_mw: '20',
      c_costcap: '0.5',
      r_range: 'last-7-days',
    });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).toContain('i_seq=y');
    expect(url).toContain('i_pctl=p75');
    expect(url).toContain('c_mw=20');
    expect(url).toContain('c_costcap=0.5');
    expect(url).not.toContain('r_range');
  });

  for (const pathname of ['/profit-estimator', '/zh/profit-estimator-per-gigawatt/kimi-k3']) {
    it(`shares the profit target but never a percentile on ${pathname}`, async () => {
      setupWindow('', pathname);
      const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

      writeUrlParams({ i_pctl: 'p75', c_ivtarget: '24' });
      await vi.advanceTimersByTimeAsync(200);

      const shared = new URL(buildShareUrl());
      const base = pathname.endsWith('/kimi-k3') ? pathname : `${pathname}/kimi-k3`;
      expect(shared.pathname).toBe(`${base}/target/24`);
      expect(shared.search).toBe('');
    });
  }

  it('drops c_ivtarget from the share link once the target returns to the model default', async () => {
    setupWindow('?c_ivtarget=24', '/profit-estimator');
    const { readUrlParams, writeUrlParams, buildShareUrl } =
      await import('@/lib/routing/url-state');
    expect(readUrlParams().c_ivtarget).toBe('24');

    writeUrlParams({ c_ivtarget: '' });
    await vi.advanceTimersByTimeAsync(200);

    expect(buildShareUrl()).toBe('https://example.com/profit-estimator');
  });

  it('refreshes route state and clears stale values on a fresh estimator navigation', async () => {
    const { location } = setupWindow('', '/profit-estimator/deepseek-v4/target/24/percentile/p75');
    const { readUrlParams, refreshUrlParamsOnNavigation, buildShareUrl } =
      await import('@/lib/routing/url-state');
    expect(readUrlParams()).toMatchObject({ c_ivtarget: '24' });
    expect(readUrlParams().i_pctl).toBeUndefined();
    location.pathname = '/profit-estimator/kimi-k3';
    refreshUrlParamsOnNavigation(location.pathname);
    expect(readUrlParams().c_ivtarget).toBeUndefined();
    expect(readUrlParams().i_pctl).toBeUndefined();
    expect(buildShareUrl()).toBe('https://example.com/profit-estimator/kimi-k3');
  });

  it('updates the visible path with pending filters and preserves hash and unrelated queries', async () => {
    const { history } = setupWindow(
      '?utm_campaign=test',
      '/profit-estimator/deepseek-v4',
      '#chart',
    );
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');
    writeUrlParams({ c_ivtarget: '24', i_pctl: 'p75' });
    await vi.advanceTimersByTimeAsync(200);
    expect(history.replaceState).toHaveBeenLastCalledWith(
      history.state,
      '',
      '/profit-estimator/deepseek-v4/target/24?utm_campaign=test#chart',
    );
    expect(buildShareUrl()).toBe(
      'https://example.com/profit-estimator/deepseek-v4/target/24#chart',
    );
  });

  it('defaults to inference tab prefixes when on root path', async () => {
    setupWindow('', '/');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'x', r_range: 'last-7-days' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=x');
    expect(url).not.toContain('r_range');
  });

  it('does not rehydrate over an edit queued during a client-owned profit route write', async () => {
    const { location, history } = setupWindow('', '/profit-estimator/deepseek-v4');
    const state = await import('@/lib/routing/url-state');
    let firstWrite = true;
    const nativeReplace = vi.fn((_state, _title, href: string) => {
      const url = new URL(href, location.origin);
      location.pathname = url.pathname;
      location.search = url.search;
      if (firstWrite) {
        firstWrite = false;
        state.writeUrlParams({ g_tco: 'external', g_runid: '123', i_prec: 'fp8' });
      }
    });
    vi.stubGlobal('History', { prototype: { replaceState: nativeReplace } });
    history.replaceState.mockImplementation((value, title, href) => {
      nativeReplace(value, title, String(href));
      state.refreshUrlParams();
    });

    state.writeUrlParams({ c_ivtarget: '24' });
    await vi.advanceTimersByTimeAsync(150);
    expect(state.readUrlParams()).toMatchObject({
      c_ivtarget: '24',
      g_tco: 'external',
      g_runid: '123',
      i_prec: 'fp8',
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(location.pathname).toBe(
      '/profit-estimator/deepseek-v4/target/24/tco-basis/external/run/123/precision/fp8',
    );
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(nativeReplace).toHaveBeenCalledTimes(2);
  });

  it('preserves the exact locale, slug, scenario, and hash for non-dashboard chart routes', async () => {
    setupWindow('', '/zh/compare/h100-vs-h200/8k-1k', '#interactive-results');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'x', i_seq: '8k/1k', r_range: 'last-7-days' });
    await vi.advanceTimersByTimeAsync(200);

    expect(buildShareUrl()).toBe(
      'https://example.com/zh/compare/h100-vs-h200/8k-1k?g_model=x&i_seq=8k%2F1k#interactive-results',
    );
  });

  it('uses the localized dashboard route to select its share scope', async () => {
    setupWindow('', '/zh/evaluation', '#samples');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'x', e_bench: 'mmlu', i_seq: '8k/1k' });
    await vi.advanceTimersByTimeAsync(200);

    expect(buildShareUrl()).toBe(
      'https://example.com/zh/evaluation?g_model=x&e_bench=mmlu#samples',
    );
  });

  it('omits query string when no non-default params exist', async () => {
    setupWindow('', '/inference');
    const { buildShareUrl } = await import('@/lib/routing/url-state');

    const url = buildShareUrl();
    expect(url).not.toContain('?');
  });

  it('includes i_active on /inference but not e_active or r_active', async () => {
    setupWindow('', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ i_active: 'h100,b200', e_active: 'h100', r_active: 'dsr1' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toMatch(/i_active=h100(?:,|%2C)b200/u);
    expect(url).not.toContain('e_active');
    expect(url).not.toContain('r_active');
  });

  it('includes e_active on /evaluation but not i_active or r_active', async () => {
    setupWindow('', '/evaluation');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ i_active: 'x', e_active: 'h100,b200', r_active: 'y' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toMatch(/e_active=h100(?:,|%2C)b200/u);
    expect(url).not.toContain('i_active');
    expect(url).not.toContain('r_active');
  });

  it('includes r_active on /reliability but not i_active or e_active', async () => {
    setupWindow('', '/reliability');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ i_active: 'x', e_active: 'y', r_active: 'dsr1,llama70b' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toMatch(/r_active=dsr1(?:,|%2C)llama70b/u);
    expect(url).not.toContain('i_active');
    expect(url).not.toContain('e_active');
  });
});

describe('buildShareUrl unofficialrun handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('includes a single unofficial-run id from the live URL under the plural key', async () => {
    setupWindow('?unofficialruns=111', '/inference');
    const { buildShareUrl } = await import('@/lib/routing/url-state');

    const url = buildShareUrl();
    expect(url).toContain('unofficialruns=111');
  });

  it('includes a comma-separated list of run ids verbatim', async () => {
    setupWindow('?unofficialruns=111,222,333', '/inference');
    const { buildShareUrl } = await import('@/lib/routing/url-state');

    const url = buildShareUrl();
    expect(url).toMatch(/unofficialruns=111(?:,|%2C)222(?:,|%2C)333/u);
  });

  it('canonicalizes the singular alias "unofficialrun" to plural "unofficialruns"', async () => {
    setupWindow('?unofficialrun=111,222', '/inference');
    const { buildShareUrl } = await import('@/lib/routing/url-state');

    const url = buildShareUrl();
    expect(url).toMatch(/[?&]unofficialruns=/u);
    expect(url).not.toMatch(/[?&]unofficialrun=/u);
  });

  it('preserves unofficialruns alongside other in-memory share params', async () => {
    setupWindow('?unofficialruns=111&g_model=DeepSeek-V4-Pro', '/inference');
    const { writeUrlParams, buildShareUrl } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'DeepSeek-R1-0528' });
    await vi.advanceTimersByTimeAsync(200);

    const url = buildShareUrl();
    expect(url).toContain('g_model=DeepSeek-R1-0528');
    expect(url).toContain('unofficialruns=111');
  });

  it('is absent from the share URL when no unofficial run is in the address bar', async () => {
    setupWindow('', '/inference');
    const { buildShareUrl } = await import('@/lib/routing/url-state');

    const url = buildShareUrl();
    expect(url).not.toContain('unofficialrun');
  });

  it('skips empty unofficialruns values', async () => {
    setupWindow('?unofficialruns=', '/inference');
    const { buildShareUrl } = await import('@/lib/routing/url-state');

    const url = buildShareUrl();
    expect(url).not.toContain('unofficialrun');
  });
});

describe('currentChartSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the inference params a share link would carry', async () => {
    setupWindow('', '/inference');
    const { currentChartSearch, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', i_active: 'gb200_dynamo-vllm', i_seq: 'agentic-traces' });
    const search = currentChartSearch();

    expect(new URLSearchParams(search).get('g_model')).toBe('Kimi-K3');
    expect(new URLSearchParams(search).get('i_active')).toBe('gb200_dynamo-vllm');
    expect(new URLSearchParams(search).get('i_seq')).toBe('agentic-traces');
  });

  it('resolves the tab through the /zh prefix and any trailing segments', async () => {
    setupWindow('', '/zh/inference/agentic/440106');
    const { currentChartSearch, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', r_range: 'all-time' });
    const params = new URLSearchParams(currentChartSearch());

    expect(params.get('g_model')).toBe('Kimi-K3');
    expect(params.has('r_range')).toBe(false);
  });

  it('is empty when every value is at its default', async () => {
    setupWindow('', '/inference');
    const { currentChartSearch, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'DeepSeek-V4-Pro', r_range: 'last-3-months' });
    await vi.advanceTimersByTimeAsync(200);

    expect(currentChartSearch()).toBe('');
  });

  it('is a no-op without a window (SSR)', async () => {
    vi.stubGlobal('window', undefined);
    const { currentChartSearch } = await import('@/lib/routing/url-state');
    expect(currentChartSearch()).toBe('');
  });
});

describe('rememberChartStateInUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes the chart state into the current history entry', async () => {
    const { history } = setupWindow('', '/inference');
    const { rememberChartStateInUrl, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', i_active: 'gb200_dynamo-vllm' });
    rememberChartStateInUrl();

    expect(history.replaceState).toHaveBeenCalledTimes(1);
    const [state] = history.replaceState.mock.calls[0] as [unknown, string, string];
    const url = (history.replaceState.mock.calls[0] as [unknown, string, string])[2];
    expect(state).toEqual({ __NA: 1 });
    expect(url.startsWith('/inference?')).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf('?')));
    expect(params.get('g_model')).toBe('Kimi-K3');
    expect(params.get('i_active')).toBe('gb200_dynamo-vllm');
  });

  it('keeps the pathname and hash intact', async () => {
    const { history } = setupWindow('', '/zh/inference', '#chart');
    const { rememberChartStateInUrl, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    rememberChartStateInUrl();

    const url = (history.replaceState.mock.calls[0] as [unknown, string, string])[2];
    expect(url).toBe('/zh/inference?g_model=Kimi-K3#chart');
  });

  it('leaves a default-only chart on a bare path rather than an empty query', async () => {
    const { history } = setupWindow('', '/inference');
    const { rememberChartStateInUrl } = await import('@/lib/routing/url-state');

    expect(rememberChartStateInUrl()).toBe('');
    const url = (history.replaceState.mock.calls[0] as [unknown, string, string])[2];
    expect(url).toBe('/inference');
  });

  it('carries an unofficial run overlay across the navigation', async () => {
    const { history } = setupWindow('?unofficialruns=987654321', '/inference');
    const { rememberChartStateInUrl, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    rememberChartStateInUrl();

    const url = (history.replaceState.mock.calls[0] as [unknown, string, string])[2];
    expect(new URLSearchParams(url.slice(url.indexOf('?'))).get('unofficialruns')).toBe(
      '987654321',
    );
  });

  it('is a no-op without a window (SSR)', async () => {
    vi.stubGlobal('window', undefined);
    const { rememberChartStateInUrl } = await import('@/lib/routing/url-state');
    expect(() => rememberChartStateInUrl()).not.toThrow();
    expect(rememberChartStateInUrl()).toBe('');
  });
});

describe('withChartState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('appends the chart state to an in-app href', async () => {
    setupWindow('', '/inference');
    const { withChartState, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3', i_active: 'gb200_dynamo-vllm' });
    const href = withChartState('/inference/agentic/440106');

    expect(href.startsWith('/inference/agentic/440106?')).toBe(true);
    expect(new URLSearchParams(href.slice(href.indexOf('?'))).get('g_model')).toBe('Kimi-K3');
  });

  it('merges into an href that already has a query', async () => {
    setupWindow('', '/inference');
    const { withChartState, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    const href = withChartState('/inference?view=timeline');

    expect(href).toBe('/inference?view=timeline&g_model=Kimi-K3');
  });

  it('returns the href untouched when there is no state to carry', async () => {
    setupWindow('', '/inference');
    const { withChartState } = await import('@/lib/routing/url-state');

    expect(withChartState('/inference/agentic/440106')).toBe('/inference/agentic/440106');
  });

  it('returns the href untouched without a window (SSR)', async () => {
    vi.stubGlobal('window', undefined);
    const { withChartState } = await import('@/lib/routing/url-state');
    expect(withChartState('/inference')).toBe('/inference');
  });
});

describe('refreshUrlParamsOnNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pulls the new URL in once per navigation', async () => {
    const { location } = setupWindow('', '/');
    const { readUrlParams, refreshUrlParamsOnNavigation } = await import('@/lib/routing/url-state');

    expect(refreshUrlParamsOnNavigation('/')).toBe(true);

    location.search = '?g_model=Kimi-K3&i_active=gb200_dynamo-vllm';
    location.pathname = '/inference';
    expect(refreshUrlParamsOnNavigation('/inference')).toBe(true);
    expect(readUrlParams().g_model).toBe('Kimi-K3');
    expect(readUrlParams().i_active).toBe('gb200_dynamo-vllm');
  });

  it('does not re-import the URL for a component mounting later on the same path', async () => {
    const { location } = setupWindow('?g_model=Kimi-K3', '/inference');
    const { readUrlParams, refreshUrlParamsOnNavigation } = await import('@/lib/routing/url-state');

    expect(refreshUrlParamsOnNavigation('/inference')).toBe(true);
    expect(readUrlParams().g_model).toBe('Kimi-K3');

    location.search = '?g_model=Kimi-K3';
    expect(refreshUrlParamsOnNavigation('/inference')).toBe(false);
  });
});

describe('rememberChartStateInUrl — params this module does not own', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps unrelated query params on the entry it rewrites', async () => {
    const { history } = setupWindow('?utm_source=twitter', '/inference');
    const { rememberChartStateInUrl, writeUrlParams } = await import('@/lib/routing/url-state');

    writeUrlParams({ g_model: 'Kimi-K3' });
    rememberChartStateInUrl();

    const url = (history.replaceState.mock.calls[0] as [unknown, string, string])[2];
    const params = new URLSearchParams(url.slice(url.indexOf('?')));
    expect(params.get('utm_source')).toBe('twitter');
    expect(params.get('g_model')).toBe('Kimi-K3');
  });

  it('collapses the singular unofficialrun spelling onto the canonical plural', async () => {
    const { history } = setupWindow('?unofficialrun=987654321', '/inference');
    const { rememberChartStateInUrl } = await import('@/lib/routing/url-state');

    rememberChartStateInUrl();

    const url = (history.replaceState.mock.calls[0] as [unknown, string, string])[2];
    const params = new URLSearchParams(url.slice(url.indexOf('?')));
    expect(params.get('unofficialruns')).toBe('987654321');
    expect(params.has('unofficialrun')).toBe(false);
  });
});
