import type * as d3 from 'd3';

import type { InferenceData } from '@/components/inference/types';
import { setAttrIfChanged } from '@/lib/d3-chart/chart-update';
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
    // Every chart render re-syncs every point; skip unchanged writes.
    .each(function () {
      setAttrIfChanged(this, 'class', 'legacy-power-ring');
      setAttrIfChanged(this, 'r', String(LEGACY_POWER_RING_RADIUS));
      setAttrIfChanged(this, 'fill', 'none');
      setAttrIfChanged(this, 'stroke', stroke);
      setAttrIfChanged(this, 'stroke-width', String(LEGACY_POWER_RING_STROKE_WIDTH));
      setAttrIfChanged(this, 'stroke-dasharray', LEGACY_POWER_RING_DASHARRAY);
      setAttrIfChanged(this, 'opacity', '0.9');
      setAttrIfChanged(this, 'pointer-events', 'none');
    });
}
