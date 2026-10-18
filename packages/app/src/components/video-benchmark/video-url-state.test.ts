import { describe, expect, it } from 'vitest';
import { H3_API_REFERENCE } from './api-reference';
import { X_METRICS, Y_METRICS } from './metrics';
import {
  DEFAULT_VIDEO_DASHBOARD_STATE,
  metricOptions,
  parseApiPrice,
  readVideoDashboardState,
  writeVideoDashboardState,
  type VideoDashboardState,
} from './video-url-state';

describe('video dashboard URL state', () => {
  it('round-trips one quality dimension and a reader threshold without changing other filters', () => {
    const state = readVideoDashboardState(
      '?v_y=quality&v_quality=audio_quality&v_qmin=3.5&v_hidden=h100',
    );
    expect(state).toMatchObject({
      y: 'quality',
      qualityMetric: 'audio_quality',
      qualityThreshold: 3.5,
      hidden: ['h100'],
    });
    const url = writeVideoDashboardState(
      new URL('https://example.test/video?history-query=retained'),
      state,
    );
    expect(readVideoDashboardState(url.search)).toEqual(state);
    expect(url.searchParams.get('history-query')).toBe('retained');
    for (const threshold of ['', 'NaN', '-1', '4.1', '5'])
      expect(readVideoDashboardState(`?v_qmin=${threshold}`).qualityThreshold).toBeNull();
    expect(readVideoDashboardState('?v_quality=psnr').qualityMetric).toBe('prompt_adherence');
  });
  it('round-trips a zero threshold and the canonical audio-content dimension', () => {
    const state = readVideoDashboardState('?v_quality=audio_content&v_qmin=0');
    expect(state).toMatchObject({ qualityMetric: 'audio_content', qualityThreshold: 0 });
    const url = writeVideoDashboardState(new URL('https://example.test/video'), state);
    expect(url.searchParams.get('v_qmin')).toBe('0');
    expect(readVideoDashboardState(url.search)).toEqual(state);
    expect(readVideoDashboardState('?v_quality=subject_consistency').qualityMetric).toBe(
      'prompt_adherence',
    );
  });
  it('restores hidden hardware from shared links and omits an empty selection', () => {
    const state = readVideoDashboardState('?v_hidden=h100,b200,h100,unknown&v_tier=r');
    expect(state.hidden).toEqual(['b200', 'h100']);
    const shared = writeVideoDashboardState(new URL('https://x.test/video?unrelated=1'), state);
    expect(shared.searchParams.get('v_hidden')).toBe('b200,h100');
    expect(readVideoDashboardState(shared.search).hidden).toEqual(state.hidden);
    expect(shared.searchParams.get('unrelated')).toBe('1');
    expect(
      writeVideoDashboardState(shared, { ...state, hidden: [] }).searchParams.has('v_hidden'),
    ).toBe(false);
  });
  it('falls back to defaults for missing or invalid params', () => {
    expect(readVideoDashboardState('')).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
    expect(readVideoDashboardState('?v_x=bogus&v_y=nope&v_tier=z&v_view=pie&v_api=free')).toEqual(
      DEFAULT_VIDEO_DASHBOARD_STATE,
    );
  });
  it('ignores retired params and metric ids, so old share links open on the defaults', () => {
    // The GPU-basis switch, the queue/optimal/frontier toggles and the profit axes are gone.
    expect(
      readVideoDashboardState(
        '?v_basis=allocated&v_queue=1&v_opt=1&v_frontier=1&v_x=genSpeed&v_y=profitPerGpuHour',
      ),
    ).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
    // Each axis accepts only its own metrics; the card-only metrics are not axes.
    expect(readVideoDashboardState('?v_x=videosPerDollar').x).toBe('p90Latency');
    expect(readVideoDashboardState('?v_y=p50Latency').y).toBe('videosPerDollar');
    expect(readVideoDashboardState('?v_y=apiPricePerVideo').y).toBe('videosPerDollar');
  });
  it('reads every supported param', () => {
    expect(
      readVideoDashboardState(
        '?v_x=p50Latency&v_y=kjPerVideo&v_tier=r&v_view=table&v_optimal=0&v_api=0.047',
      ),
    ).toEqual({
      model: 'h3',
      x: 'p50Latency',
      y: 'kjPerVideo',
      tier: 'r',
      view: 'table',
      optimal: false,
      apiPrice: 0.047,
      hidden: [],
      qualityMetric: 'prompt_adherence',
      qualityThreshold: null,
    });
    expect([...X_METRICS]).toEqual(['p90Latency', 'p50Latency']);
    expect([...Y_METRICS]).toEqual([
      'videosPerDollar',
      'dollarsPerVideo',
      'videosPerGpuHour',
      'kjPerVideo',
      'quality',
    ]);
    for (const x of X_METRICS) expect(readVideoDashboardState(`?v_x=${x}`).x).toBe(x);
    for (const y of Y_METRICS) expect(readVideoDashboardState(`?v_y=${y}`).y).toBe(y);
  });
  it('defaults the API price to the dated reference and rejects non-positive or malformed prices', () => {
    expect(DEFAULT_VIDEO_DASHBOARD_STATE.apiPrice).toBe(H3_API_REFERENCE.pricePerVideoSecondUsd);
    for (const bad of ['0', '-0.034', 'NaN', 'Infinity', '', ' ', 'abc', '0.00004']) {
      expect(readVideoDashboardState(`?v_api=${bad}`).apiPrice).toBe(0.08);
      expect(parseApiPrice(bad)).toBeNull();
    }
    expect(parseApiPrice(null)).toBeNull();
    expect(parseApiPrice(undefined)).toBeNull();
    expect(parseApiPrice(Number.NaN)).toBeNull();
    // Positive prices are kept to four decimals, so the URL and the input agree.
    expect(parseApiPrice('0.05')).toBe(0.05);
    expect(parseApiPrice('0.03456')).toBe(0.0346);
    expect(parseApiPrice(0.0001)).toBe(0.0001);
    expect(readVideoDashboardState('?v_api=1e-2').apiPrice).toBe(0.01);
  });
  it('mirrors the inference tab: Optimal Only is on unless v_optimal is exactly 0', () => {
    expect(DEFAULT_VIDEO_DASHBOARD_STATE.optimal).toBe(true);
    expect(readVideoDashboardState('?v_optimal=0').optimal).toBe(false);
    for (const on of ['1', 'true', 'off', '']) {
      expect(readVideoDashboardState(`?v_optimal=${on}`).optimal).toBe(true);
    }
    const url = new URL('https://x.test/video');
    const off = writeVideoDashboardState(url, { ...DEFAULT_VIDEO_DASHBOARD_STATE, optimal: false });
    expect(off.search).toBe('?v_optimal=0');
    expect(readVideoDashboardState(off.search).optimal).toBe(false);
    expect(writeVideoDashboardState(off, DEFAULT_VIDEO_DASHBOARD_STATE).search).toBe('');
  });
  it('writes only non-default params and keeps unrelated params', () => {
    const url = new URL('https://x.test/video?run=1&view=results');
    const out = writeVideoDashboardState(url, {
      ...DEFAULT_VIDEO_DASHBOARD_STATE,
      tier: 'r',
      view: 'table',
    });
    expect(out.searchParams.get('run')).toBe('1');
    // The page's own `view` param is not the chart/table switch, which lives under `v_view`.
    expect(out.searchParams.get('view')).toBe('results');
    expect(out.searchParams.get('v_tier')).toBe('r');
    expect(out.searchParams.get('v_view')).toBe('table');
    expect(out.searchParams.has('v_x')).toBe(false);
    expect(out.searchParams.has('v_y')).toBe(false);
    expect(out.searchParams.has('v_api')).toBe(false);
    expect(url.searchParams.has('v_tier')).toBe(false);
    const reset = writeVideoDashboardState(out, DEFAULT_VIDEO_DASHBOARD_STATE);
    expect([...reset.searchParams.keys()].filter((k) => k.startsWith('v_'))).toEqual([]);
    expect(reset.searchParams.get('run')).toBe('1');
  });
  it('round-trips the axis metrics', () => {
    const chosen: VideoDashboardState = {
      ...DEFAULT_VIDEO_DASHBOARD_STATE,
      x: 'p50Latency',
      y: 'dollarsPerVideo',
    };
    const out = writeVideoDashboardState(new URL('https://x.test/video'), chosen);
    expect(out.search).toBe('?v_x=p50Latency&v_y=dollarsPerVideo');
    expect(readVideoDashboardState(out.search)).toEqual(chosen);
  });
  it('round-trips an overridden API price and drops an invalid one', () => {
    const url = new URL('https://x.test/video');
    const out = writeVideoDashboardState(url, { ...DEFAULT_VIDEO_DASHBOARD_STATE, apiPrice: 0.05 });
    expect(out.searchParams.get('v_api')).toBe('0.05');
    expect(readVideoDashboardState(out.search).apiPrice).toBe(0.05);
    expect(
      writeVideoDashboardState(url, {
        ...DEFAULT_VIDEO_DASHBOARD_STATE,
        apiPrice: 0.03456,
      }).searchParams.get('v_api'),
    ).toBe('0.0346');
    expect(
      writeVideoDashboardState(out, {
        ...DEFAULT_VIDEO_DASHBOARD_STATE,
        apiPrice: 0,
      }).searchParams.has('v_api'),
    ).toBe(false);
    expect(
      writeVideoDashboardState(out, {
        ...DEFAULT_VIDEO_DASHBOARD_STATE,
        apiPrice: Number.NaN,
      }).searchParams.has('v_api'),
    ).toBe(false);
  });
  it('maps state to metric options including the selected quality dimension', () => {
    expect(metricOptions(DEFAULT_VIDEO_DASHBOARD_STATE)).toEqual({
      tier: 'h',
      apiPricePerVideoSecond: 0.08,
      qualityMetric: 'prompt_adherence',
    });
    expect(metricOptions({ ...DEFAULT_VIDEO_DASHBOARD_STATE, tier: 'r', apiPrice: 0.05 })).toEqual({
      tier: 'r',
      apiPricePerVideoSecond: 0.05,
      qualityMetric: 'prompt_adherence',
    });
    expect(
      metricOptions({ ...DEFAULT_VIDEO_DASHBOARD_STATE, apiPrice: -1 }).apiPricePerVideoSecond,
    ).toBeNull();
  });
});

it('keeps model selection and model-specific price defaults in shared URLs', () => {
  const wan = readVideoDashboardState('?v_model=wan22&v_api=invalid');
  expect(wan).toMatchObject({ model: 'wan22', apiPrice: null });
  const url = writeVideoDashboardState(new URL('https://example.test/video'), wan);
  expect(url.search).toBe('?v_model=wan22');
  expect(readVideoDashboardState(url.search)).toEqual(wan);
  const custom = writeVideoDashboardState(url, { ...wan, apiPrice: 0.08 });
  expect(custom.searchParams.get('v_api')).toBe('0.08');
  expect(readVideoDashboardState(custom.search).apiPrice).toBe(0.08);
  expect(readVideoDashboardState('?v_model=unknown')).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
});

it('keeps H3 audio quality filters out of the Wan view', () => {
  const state = readVideoDashboardState('?v_model=wan22&v_y=quality&v_qmin=3');
  expect(state.y).toBe('videosPerDollar');
  expect(state.qualityThreshold).toBeNull();
});
