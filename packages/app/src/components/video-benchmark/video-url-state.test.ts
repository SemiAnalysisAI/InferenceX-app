import { describe, expect, it } from 'vitest';
import { H3_API_REFERENCE } from './api-reference';
import { X_METRICS, Y_METRICS } from './metrics';
import {
  metricOptions,
  parseApiPrice,
  readVideoDashboardState,
  type VideoDashboardState,
} from './video-url-state';

const DEFAULTS: VideoDashboardState = {
  x: 'p90Latency',
  y: 'videosPerDollar',
  tier: 'h',
  view: 'chart',
  optimal: true,
  apiPrice: H3_API_REFERENCE.pricePerVideoSecondUsd,
  hidden: [],
};

describe('video dashboard URL state', () => {
  it('falls back to defaults for missing or invalid params', () => {
    expect(readVideoDashboardState('')).toEqual(DEFAULTS);
    expect(readVideoDashboardState('?v_x=bogus&v_y=nope&v_tier=z&v_view=pie&v_api=free')).toEqual(
      DEFAULTS,
    );
  });
  it('ignores retired params and metric ids, so old share links open on the defaults', () => {
    // The GPU-basis switch, the queue/optimal/frontier toggles and the profit axes are gone.
    expect(
      readVideoDashboardState(
        '?v_basis=allocated&v_queue=1&v_opt=1&v_frontier=1&v_x=genSpeed&v_y=profitPerGpuHour',
      ),
    ).toEqual(DEFAULTS);
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
      x: 'p50Latency',
      y: 'kjPerVideo',
      tier: 'r',
      view: 'table',
      optimal: false,
      apiPrice: 0.047,
      hidden: [],
    });
    expect([...X_METRICS]).toEqual(['p90Latency', 'p50Latency']);
    expect([...Y_METRICS]).toEqual([
      'videosPerDollar',
      'dollarsPerVideo',
      'videosPerGpuHour',
      'kjPerVideo',
    ]);
    for (const x of X_METRICS) expect(readVideoDashboardState(`?v_x=${x}`).x).toBe(x);
    for (const y of Y_METRICS) expect(readVideoDashboardState(`?v_y=${y}`).y).toBe(y);
  });
  it('defaults the API price to the dated reference and rejects non-positive or malformed prices', () => {
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
    expect(readVideoDashboardState('?v_optimal=0').optimal).toBe(false);
    for (const on of ['1', 'true', 'off', '']) {
      expect(readVideoDashboardState(`?v_optimal=${on}`).optimal).toBe(true);
    }
  });
  it('maps state to metric options: the cost tier and the API price, nothing else', () => {
    expect(metricOptions(DEFAULTS)).toEqual({
      tier: 'h',
      apiPricePerVideoSecond: 0.08,
    });
    expect(metricOptions({ ...DEFAULTS, tier: 'r', apiPrice: 0.05 })).toEqual({
      tier: 'r',
      apiPricePerVideoSecond: 0.05,
    });
    expect(metricOptions({ ...DEFAULTS, apiPrice: -1 }).apiPricePerVideoSecond).toBeNull();
  });
});
