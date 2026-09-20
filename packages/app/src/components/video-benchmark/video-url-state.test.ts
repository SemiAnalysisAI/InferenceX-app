import { describe, expect, it } from 'vitest';
import { H3_API_REFERENCE } from './api-reference';
import {
  DEFAULT_VIDEO_DASHBOARD_STATE,
  metricOptions,
  parseApiPrice,
  readVideoDashboardState,
  writeVideoDashboardState,
} from './video-url-state';

describe('video dashboard URL state', () => {
  it('falls back to defaults for missing or invalid params', () => {
    expect(readVideoDashboardState('')).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
    expect(
      readVideoDashboardState(
        '?v_x=bogus&v_y=nope&v_tier=z&v_basis=q&v_view=pie&v_queue=yes&v_api=free',
      ),
    ).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
  });
  it('reads every supported param', () => {
    expect(
      readVideoDashboardState(
        '?v_x=genSpeed&v_y=kjPerVideo&v_tier=r&v_basis=allocated&v_queue=1&v_opt=1&v_frontier=1&v_view=table&v_api=0.047',
      ),
    ).toEqual({
      x: 'genSpeed',
      y: 'kjPerVideo',
      tier: 'r',
      basis: 'allocated',
      queue: true,
      optimal: true,
      frontier: true,
      view: 'table',
      apiPrice: 0.047,
    });
    expect(readVideoDashboardState('?v_y=profitPerGpuHour').y).toBe('profitPerGpuHour');
  });
  it('defaults the API price to the dated reference and rejects non-positive or malformed prices', () => {
    expect(DEFAULT_VIDEO_DASHBOARD_STATE.apiPrice).toBe(H3_API_REFERENCE.pricePerVideoSecondUsd);
    for (const bad of ['0', '-0.034', 'NaN', 'Infinity', '', ' ', 'abc', '0.00004']) {
      expect(readVideoDashboardState(`?v_api=${bad}`).apiPrice).toBe(0.034);
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
  it('writes only non-default params and keeps unrelated params', () => {
    const url = new URL('https://x.test/video?run=1&view=results');
    const out = writeVideoDashboardState(url, {
      ...DEFAULT_VIDEO_DASHBOARD_STATE,
      tier: 'r',
      queue: true,
    });
    expect(out.searchParams.get('run')).toBe('1');
    expect(out.searchParams.get('view')).toBe('results');
    expect(out.searchParams.get('v_tier')).toBe('r');
    expect(out.searchParams.get('v_queue')).toBe('1');
    expect(out.searchParams.has('v_x')).toBe(false);
    expect(out.searchParams.has('v_api')).toBe(false);
    expect(url.searchParams.has('v_tier')).toBe(false);
    const reset = writeVideoDashboardState(out, DEFAULT_VIDEO_DASHBOARD_STATE);
    expect([...reset.searchParams.keys()].filter((k) => k.startsWith('v_'))).toEqual([]);
    expect(reset.searchParams.get('run')).toBe('1');
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
  it('maps state to metric options, including the API price', () => {
    expect(metricOptions(DEFAULT_VIDEO_DASHBOARD_STATE)).toEqual({
      tier: 'h',
      basis: 'participating',
      apiPricePerVideoSecond: 0.034,
    });
    expect(
      metricOptions({
        ...DEFAULT_VIDEO_DASHBOARD_STATE,
        tier: 'r',
        basis: 'allocated',
        apiPrice: 0.05,
      }),
    ).toEqual({ tier: 'r', basis: 'allocated', apiPricePerVideoSecond: 0.05 });
    expect(
      metricOptions({ ...DEFAULT_VIDEO_DASHBOARD_STATE, apiPrice: -1 }).apiPricePerVideoSecond,
    ).toBeNull();
  });
});
