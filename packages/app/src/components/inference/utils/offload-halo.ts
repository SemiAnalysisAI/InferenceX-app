import type * as d3 from 'd3';

import type { InferenceData } from '@/components/inference/types';
import {
  OFFLOAD_HALO_DASHARRAY,
  OFFLOAD_HALO_RADIUS,
  OFFLOAD_HALO_STROKE_WIDTH,
} from '@/components/inference/ui/OffloadHaloLegendKey';

export function renderOffloadHalo(
  group: d3.Selection<SVGGElement, InferenceData, null, undefined>,
  point: InferenceData,
  stroke: string,
): void {
  group
    .selectAll<SVGCircleElement, boolean>('.offload-halo')
    .data(point.offload_mode === 'on' ? [true] : [])
    .join('circle')
    .attr('class', 'offload-halo')
    .attr('r', OFFLOAD_HALO_RADIUS)
    .attr('fill', 'none')
    .attr('stroke', stroke)
    .attr('stroke-width', OFFLOAD_HALO_STROKE_WIDTH)
    .attr('stroke-dasharray', OFFLOAD_HALO_DASHARRAY)
    .attr('opacity', 0.9)
    .attr('pointer-events', 'none');
}
