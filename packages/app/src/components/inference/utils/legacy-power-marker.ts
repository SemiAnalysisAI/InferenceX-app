import type * as d3 from 'd3';

import type { InferenceData } from '@/components/inference/types';
import {
  LEGACY_POWER_RING_DASHARRAY,
  LEGACY_POWER_RING_RADIUS,
  LEGACY_POWER_RING_STROKE_WIDTH,
} from '@/components/inference/ui/LegacyPowerLegendKey';

/**
 * Dotted ring flagging measured-power telemetry without a producer validation
 * verdict (`power_tier === 'legacy'`). Drawn only while a Measured Energy
 * y-axis is selected; the join-on-empty-data pattern removes the ring when the
 * axis changes or the point's tier is not legacy.
 */
export function renderLegacyPowerRing(
  group: d3.Selection<SVGGElement, InferenceData, null, undefined>,
  point: InferenceData,
  isMeasuredAxis: boolean,
  stroke: string,
): void {
  group
    .selectAll<SVGCircleElement, boolean>('.legacy-power-ring')
    .data(isMeasuredAxis && point.power_tier === 'legacy' ? [true] : [])
    .join('circle')
    .attr('class', 'legacy-power-ring')
    .attr('r', LEGACY_POWER_RING_RADIUS)
    .attr('fill', 'none')
    .attr('stroke', stroke)
    .attr('stroke-width', LEGACY_POWER_RING_STROKE_WIDTH)
    .attr('stroke-dasharray', LEGACY_POWER_RING_DASHARRAY)
    .attr('opacity', 0.9)
    .attr('pointer-events', 'none');
}
