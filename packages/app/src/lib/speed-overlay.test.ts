import { describe, expect, it } from 'vitest';

import { getSpeedOverlayCorners } from './speed-overlay';

describe('getSpeedOverlayCorners', () => {
  it('places the bus top-left for upper_left rooflines (e.g. tput vs interactivity)', () => {
    expect(getSpeedOverlayCorners('upper_left')).toEqual({
      busTop: true,
      busLeft: true,
    });
  });

  it('places the bus top-right for upper_right rooflines (e.g. tput vs e2e or vs TTFT)', () => {
    expect(getSpeedOverlayCorners('upper_right')).toEqual({
      busTop: true,
      busLeft: false,
    });
  });

  it('places the bus bottom-right for lower_left rooflines (e.g. cost vs e2e)', () => {
    // The optimal corner the roofline points to is unreachable for cost charts;
    // the batchy endpoint sits at the X-flipped corner — high latency, low cost.
    expect(getSpeedOverlayCorners('lower_left')).toEqual({
      busTop: false,
      busLeft: false,
    });
  });

  it('places the bus bottom-left for lower_right rooflines (e.g. cost vs interactivity)', () => {
    // Batchy endpoint = low interactivity (left), low cost (bottom).
    expect(getSpeedOverlayCorners('lower_right')).toEqual({
      busTop: false,
      busLeft: true,
    });
  });

  it('falls back to top-left for an undefined roofline direction', () => {
    expect(getSpeedOverlayCorners(undefined)).toEqual({
      busTop: true,
      busLeft: true,
    });
  });
});
