import * as d3 from 'd3';
import { invalidateTooltipGeometry } from '@/lib/d3-chart/layers/scatter-points';
import { installTouchInputTracking, isTouchCompatMouseEvent } from '@/lib/d3-chart/touch-input';
import { pinMark, showPinRing } from '@/lib/d3-chart/pin-ring';

export interface OverlayTooltipHandle<T> {
  isPinned: () => boolean;
  pinTooltip: (data: T, isOverlay: boolean) => void;
  getPinnedPoint?: () => unknown;
  dismissTooltip?: () => void;
}

export interface OverlayRulerLifecycle<T> {
  show: (data: T, marker: SVGGElement) => void;
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
  panel?: boolean;
}

export function xMarkerPath(size: number, armScale = 1): string {
  const arm = size * armScale;
  return `M ${-arm} ${-arm} L ${arm} ${arm} M ${-arm} ${arm} L ${arm} ${-arm}`;
}

export function overlayMarkerPosition(marker: Element): { x: number; y: number } | null {
  const transform = marker.getAttribute('transform') ?? '';
  const match = transform.match(/translate\((?<x>[^, ]+)[, ]+(?<y>[^) ]+)\)/u);
  const x = Number(match?.groups?.x);
  const y = Number(match?.groups?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function attachOverlayXMarkerHandlers<T>(
  points: d3.Selection<SVGGElement, T, SVGGElement, unknown>,
  options: OverlayXMarkerOptions<T>,
): void {
  const normalStrokeWidth = options.normalStrokeWidth ?? 2.5;
  const hoverStrokeWidth = options.hoverStrokeWidth ?? 3.5;
  const setMarkerPath = (point: SVGGElement, hovered: boolean) =>
    d3
      .select(point)
      .select(options.markerSelector)
      .attr('d', hovered ? options.hoverPath : options.normalPath)
      .attr('stroke-width', hovered ? hoverStrokeWidth : normalStrokeWidth);
  const positionTooltip = (event: PointerEvent | MouseEvent) => {
    const position = options.position(event);
    options.tooltip.style('left', `${position.left}px`).style('top', `${position.top}px`);
  };

  installTouchInputTracking();

  points
    .on('mouseenter', function (event, data) {
      if (options.handle?.isPinned() && !options.panel) return;
      if (isTouchCompatMouseEvent(event)) return;
      setMarkerPath(this, true);
      options.tooltip
        .style('opacity', 1)
        .style('display', 'block')
        .style('pointer-events', 'none')
        .html(options.content(data, false));
      invalidateTooltipGeometry(options.tooltip.node());
      if (!options.handle?.isPinned()) options.rulers?.show(data, this);
    })
    .on('mousemove', (event) => {
      if (options.handle?.isPinned() && !options.panel) return;
      if (isTouchCompatMouseEvent(event)) return;
      positionTooltip(event);
    })
    .on('mouseleave', function (_event, data) {
      if (options.handle?.isPinned() && !options.panel) return;
      setMarkerPath(this, options.handle?.getPinnedPoint?.() === data);
      options.tooltip.style('opacity', 0).style('display', 'none');
      if (!options.handle?.isPinned()) options.rulers?.hide();
    })
    .on('click', function (event, data) {
      event.stopPropagation();
      if (options.panel) {
        options.tooltip.style('opacity', 0).style('display', 'none');
        options.rulers?.hide();
        if (options.handle?.getPinnedPoint?.() === data) {
          options.handle.dismissTooltip?.();
          return;
        }
        const position = overlayMarkerPosition(this);
        const host = this.ownerSVGElement?.querySelector('.ruler-group')?.parentElement;
        if (host) {
          showPinRing(host, position?.x, position?.y);
          pinMark(
            host,
            () => setMarkerPath(this, true),
            () => setMarkerPath(this, false),
          );
        }
        options.handle?.pinTooltip(data, true);
        options.onClick?.(data);
        return;
      }
      options.tooltip
        .html(options.content(data, true))
        .style('opacity', 1)
        .style('display', 'block')
        .style('pointer-events', 'auto');
      invalidateTooltipGeometry(options.tooltip.node());
      positionTooltip(event);
      options.rulers?.show(data, this);
      options.handle?.pinTooltip(data, true);
      options.onClick?.(data);
    });
}
