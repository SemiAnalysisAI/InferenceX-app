import type { CanvasPointLayer, ScatterDatum } from './canvas-points';

export const CANVAS_POINT_LAYER_CLASS = 'canvas-point-layer';
export const CANVAS_POINT_LAYER_SELECTOR = `.${CANVAS_POINT_LAYER_CLASS}`;
export const POINT_HIT_AREA_CLASS = 'dot-hit-area';
export const POINT_LABEL_ANCHOR_CLASS = 'point-label-anchor';
export const POINTS_JOINED_ATTRIBUTE = 'data-points-joined';

export const canvasPointLayers = new WeakMap<Element, unknown>();

export function canvasPointLayerOf<T extends ScatterDatum = ScatterDatum>(
  root: Element | null | undefined,
): CanvasPointLayer<T> | null {
  if (!root) return null;
  const element = root.matches(CANVAS_POINT_LAYER_SELECTOR)
    ? root
    : root.querySelector(CANVAS_POINT_LAYER_SELECTOR);
  const layer = element ? canvasPointLayers.get(element) : undefined;
  return layer ? (layer as CanvasPointLayer<T>) : null;
}
