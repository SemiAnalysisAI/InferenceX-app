import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_DASHBOARD_STATE,
  readVideoDashboardState,
  writeVideoDashboardState,
} from './video-url-state';

describe('video dashboard URL state', () => {
  it('falls back to defaults for missing or invalid params', () => {
    expect(readVideoDashboardState('')).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
    expect(
      readVideoDashboardState('?v_x=bogus&v_y=nope&v_tier=z&v_basis=q&v_view=pie&v_queue=yes'),
    ).toEqual(DEFAULT_VIDEO_DASHBOARD_STATE);
  });
  it('reads every supported param', () => {
    expect(
      readVideoDashboardState(
        '?v_x=genSpeed&v_y=kjPerVideo&v_tier=r&v_basis=allocated&v_queue=1&v_opt=1&v_frontier=1&v_view=table',
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
    });
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
    expect(url.searchParams.has('v_tier')).toBe(false);
    const reset = writeVideoDashboardState(out, DEFAULT_VIDEO_DASHBOARD_STATE);
    expect([...reset.searchParams.keys()].filter((k) => k.startsWith('v_'))).toEqual([]);
    expect(reset.searchParams.get('run')).toBe('1');
  });
});
