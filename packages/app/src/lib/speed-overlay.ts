/**
 * Bus = batch-friendly endpoint of the Pareto frontier.
 * Car = interactivity-friendly opposite endpoint.
 *
 * The roofline direction in `chartDefinition` is post-flipped by `useChartData`
 * when the X axis is swapped (e.g. interactivity chart input metrics showing
 * TTFT), so it always reflects the effective axis directions:
 *   upper_left  → bus top-left      (e.g. tput vs interactivity)
 *   upper_right → bus top-right     (e.g. tput vs e2e or vs TTFT)
 *   lower_left  → bus bottom-right  (e.g. cost vs e2e — batchy = high latency)
 *   lower_right → bus bottom-left   (e.g. cost vs interactivity — batchy = low int)
 *
 * Y matches the upper/lower part directly. X matches the left/right part for
 * throughput-style metrics ("upper" rooflines) and is flipped for cost / energy
 * metrics ("lower" rooflines), because the batchy endpoint sits opposite the
 * unreachable "optimal" corner the roofline name points to.
 */
export type RooflineDirection = 'upper_left' | 'upper_right' | 'lower_left' | 'lower_right';

export interface SpeedOverlayCorners {
  busTop: boolean;
  busLeft: boolean;
}

export function getSpeedOverlayCorners(
  rooflineDirection: RooflineDirection | undefined,
): SpeedOverlayCorners {
  const isUpperY = rooflineDirection?.startsWith('upper') ?? true;
  const rooflineLeft = rooflineDirection?.endsWith('left') ?? true;
  return {
    busTop: isUpperY,
    busLeft: isUpperY ? rooflineLeft : !rooflineLeft,
  };
}
