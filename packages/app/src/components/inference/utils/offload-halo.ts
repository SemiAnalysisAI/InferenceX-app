import type * as d3 from 'd3';

import type { InferenceData } from '@/components/inference/types';
import { setAttrIfChanged } from '@/lib/d3-chart/chart-update';
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
    // Every chart render re-syncs every point; skip unchanged writes.
    .each(function () {
      setAttrIfChanged(this, 'class', 'offload-halo');
      setAttrIfChanged(this, 'r', String(OFFLOAD_HALO_RADIUS));
      setAttrIfChanged(this, 'fill', 'none');
      setAttrIfChanged(this, 'stroke', stroke);
      setAttrIfChanged(this, 'stroke-width', String(OFFLOAD_HALO_STROKE_WIDTH));
      setAttrIfChanged(this, 'stroke-dasharray', OFFLOAD_HALO_DASHARRAY);
      setAttrIfChanged(this, 'opacity', '0.9');
      setAttrIfChanged(this, 'pointer-events', 'none');
    });
}
