import type * as d3 from 'd3';

import { formatNumber } from '@/lib/utils';

// Point shape constants
export const POINT_SIZE = 3.5; // Base size (radius for circle, half-width/height for rectangle)
export const HOVER_POINT_SIZE = 6; // Hover size
export const STROKE_WIDTH = 0; // Normal stroke width
export const HOVER_STROKE_WIDTH = 0; // Hover stroke width
export const HIT_AREA_RADIUS = 12; // Invisible hit area for easier interaction

// Triangle path for BF16 precision
const TRIANGLE_SIZE = 5;
const TRIANGLE_HOVER_SIZE = 7;
const getTrianglePath = (size: number) => {
  const h = (size * Math.sqrt(3)) / 2;
  return `M 0 ${(-h * 2) / 3} L ${size} ${Number(h) / 3} L ${-size} ${Number(h) / 3} Z`;
};

// Diamond path for INT4 precision
const DIAMOND_SIZE = 5;
const DIAMOND_HOVER_SIZE = 7;
const getDiamondPath = (size: number) => `M 0 ${-size} L ${size} 0 L 0 ${size} L ${-size} 0 Z`;

export type ShapeKey = 'circle' | 'square' | 'triangle' | 'diamond';

// Shape assignment order: first selected precision gets circle, second square, etc.
export const SHAPE_ORDER: readonly ShapeKey[] = ['circle', 'square', 'triangle', 'diamond'];

// Shape configuration keyed by shape name (not precision).
export const SHAPE_CONFIG = {
  circle: {
    type: 'circle' as const,
    normal: {
      r: POINT_SIZE,
      strokeWidth: STROKE_WIDTH,
    },
    hover: {
      r: HOVER_POINT_SIZE,
      strokeWidth: HOVER_STROKE_WIDTH,
    },
  },
  square: {
    type: 'rect' as const,
    normal: {
      x: -POINT_SIZE,
      y: -POINT_SIZE,
      width: POINT_SIZE * 2,
      height: POINT_SIZE * 2,
      strokeWidth: STROKE_WIDTH,
    },
    hover: {
      x: -HOVER_POINT_SIZE,
      y: -HOVER_POINT_SIZE,
      width: HOVER_POINT_SIZE * 2,
      height: HOVER_POINT_SIZE * 2,
      strokeWidth: HOVER_STROKE_WIDTH,
    },
  },
  triangle: {
    type: 'path' as const,
    normal: {
      d: getTrianglePath(TRIANGLE_SIZE),
      strokeWidth: STROKE_WIDTH,
    },
    hover: {
      d: getTrianglePath(TRIANGLE_HOVER_SIZE),
      strokeWidth: HOVER_STROKE_WIDTH,
    },
  },
  diamond: {
    type: 'path' as const,
    normal: {
      d: getDiamondPath(DIAMOND_SIZE),
      strokeWidth: STROKE_WIDTH,
    },
    hover: {
      d: getDiamondPath(DIAMOND_HOVER_SIZE),
      strokeWidth: HOVER_STROKE_WIDTH,
    },
  },
};

/**
 * Resolve a precision's shape based on its position in the selectedPrecisions list.
 * First selected → circle, second → square, third → triangle, fourth → diamond.
 * Precisions not in the list (or beyond the 4th slot) fall back to circle.
 */
export const getShapeKeyForPrecision = (
  precision: string,
  selectedPrecisions: readonly string[],
): ShapeKey => {
  const idx = selectedPrecisions.indexOf(precision);
  if (idx === -1 || idx >= SHAPE_ORDER.length) return 'circle';
  return SHAPE_ORDER[idx];
};

export const getShapeConfig = (shapeKey: ShapeKey) => SHAPE_CONFIG[shapeKey];

// Helper function to apply normal state attributes to a shape
export const applyNormalState = (
  shape: d3.Selection<SVGCircleElement | SVGRectElement | SVGPathElement, unknown, null, undefined>,
  shapeKey: ShapeKey,
) => {
  const config = getShapeConfig(shapeKey);
  if (config.type === 'path') {
    (shape as d3.Selection<SVGPathElement, unknown, null, undefined>)
      .attr('d', config.normal.d)
      .attr('stroke-width', config.normal.strokeWidth);
  } else if (config.type === 'rect') {
    (shape as d3.Selection<SVGRectElement, unknown, null, undefined>)
      .attr('x', config.normal.x)
      .attr('y', config.normal.y)
      .attr('width', config.normal.width)
      .attr('height', config.normal.height)
      .attr('stroke-width', config.normal.strokeWidth);
  } else {
    (shape as d3.Selection<SVGCircleElement, unknown, null, undefined>)
      .attr('r', config.normal.r)
      .attr('stroke-width', config.normal.strokeWidth);
  }
};

// Helper function to apply hover state attributes to a shape
export const applyHoverState = (
  shape: d3.Selection<SVGCircleElement | SVGRectElement | SVGPathElement, unknown, null, undefined>,
  shapeKey: ShapeKey,
) => {
  const config = getShapeConfig(shapeKey);
  if (config.type === 'path') {
    (shape as d3.Selection<SVGPathElement, unknown, null, undefined>)
      .attr('d', config.hover.d)
      .attr('stroke-width', config.hover.strokeWidth);
  } else if (config.type === 'rect') {
    (shape as d3.Selection<SVGRectElement, unknown, null, undefined>)
      .attr('x', config.hover.x)
      .attr('y', config.hover.y)
      .attr('width', config.hover.width)
      .attr('height', config.hover.height)
      .attr('stroke-width', config.hover.strokeWidth);
  } else {
    (shape as d3.Selection<SVGCircleElement, unknown, null, undefined>)
      .attr('r', config.hover.r)
      .attr('stroke-width', config.hover.strokeWidth);
  }
};

export const formatLargeNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  }
  return formatNumber(value);
};

/**
 * Log scale label formatter for D3 axes.
 * Shows all labels when zoomed in (logRange < 2), only powers of 10 when zoomed out.
 */
export const logTickFormat = (scale: d3.ScaleLogarithmic<number, number>) => {
  const [min, max] = scale.domain();
  const logRange = Math.log10(max) - Math.log10(min);
  return (d: d3.AxisDomain) => {
    if (logRange < 2) return formatLargeNumber(d as number);
    const log = Math.log10(d as number);
    return Math.abs(log - Math.round(log)) < 0.01 ? formatLargeNumber(d as number) : '';
  };
};

/**
 * Gets theme colors from CSS variables for chart styling.
 * Also returns rootStyles for additional dynamic color lookups.
 */
export const getChartThemeColors = () => {
  if (typeof document === 'undefined') {
    return {
      rootStyles: null as unknown as CSSStyleDeclaration,
    };
  }
  return {
    rootStyles: getComputedStyle(document.documentElement),
  };
};
