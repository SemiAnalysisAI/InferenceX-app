import * as d3 from 'd3';
import { invalidateTooltipGeometry } from '@/lib/d3-chart/layers/scatter-points';

export interface OverlayTooltipHandle<T> {
  isPinned: () => boolean;
  pinTooltip: (data: T, isOverlay: boolean) => void;
}

export interface OverlayRulerLifecycle<T> {
  show: (data: T) => void;
  hide: () => void;
}

export interface OverlayXMarkerOptions<T> {
  markerSelector: string;
  normalPath: string;
  hoverPath: string;
  normalStrokeWidth?: number;
  hoverStrokeWidth?: number;
  tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  handle: OverlayTooltipHandle<T> | null;
  content: (data: T, pinned: boolean) => string;
  position: (event: PointerEvent | MouseEvent) => { left: number; top: number };
  rulers?: OverlayRulerLifecycle<T>;
  onClick?: (data: T) => void;
}

export function xMarkerPath(size: number, armScale = 1): string {
  const arm = size * armScale;
  return `M ${-arm} ${-arm} L ${arm} ${arm} M ${-arm} ${arm} L ${arm} ${-arm}`;
}

export function attachOverlayXMarkerHandlers<T>(
  points: d3.Selection<SVGGElement, T, SVGGElement, unknown>,
  options: OverlayXMarkerOptions<T>,
): void {
  const normalStrokeWidth = options.normalStrokeWidth ?? 2.5;
  const hoverStrokeWidth = options.hoverStrokeWidth ?? 3.5;
  const positionTooltip = (event: PointerEvent | MouseEvent) => {
    const position = options.position(event);
    options.tooltip.style('left', `${position.left}px`).style('top', `${position.top}px`);
  };

  points
    .on('mouseenter', function (_event, data) {
      if (options.handle?.isPinned()) return;
      d3.select(this)
        .select(options.markerSelector)
        .attr('d', options.hoverPath)
        .attr('stroke-width', hoverStrokeWidth);
      options.tooltip
        .style('opacity', 1)
        .style('display', 'block')
        .style('pointer-events', 'none')
        .html(options.content(data, false));
      invalidateTooltipGeometry(options.tooltip.node());
      options.rulers?.show(data);
    })
    .on('mousemove', (event) => {
      if (options.handle?.isPinned()) return;
      positionTooltip(event);
    })
    .on('mouseleave', function () {
      if (options.handle?.isPinned()) return;
      d3.select(this)
        .select(options.markerSelector)
        .attr('d', options.normalPath)
        .attr('stroke-width', normalStrokeWidth);
      options.tooltip.style('opacity', 0).style('display', 'none');
      options.rulers?.hide();
    })
    .on('click', (event, data) => {
      event.stopPropagation();
      options.tooltip
        .html(options.content(data, true))
        .style('opacity', 1)
        .style('display', 'block')
        .style('pointer-events', 'auto');
      invalidateTooltipGeometry(options.tooltip.node());
      positionTooltip(event);
      options.rulers?.show(data);
      options.handle?.pinTooltip(data, true);
      options.onClick?.(data);
    });
}
