/** Hover cursor stroke shared by custom SVG charts; matches the D3Chart vertical ruler. */
export const CURSOR_STROKE = 'var(--foreground)';
export const CURSOR_DASH = '4 4';
export const CURSOR_OPACITY = 0.8;
export const CURSOR_WIDTH = 1;

export const CURSOR_LINE_PROPS = {
  stroke: CURSOR_STROKE,
  strokeWidth: CURSOR_WIDTH,
  strokeDasharray: CURSOR_DASH,
  strokeOpacity: CURSOR_OPACITY,
} as const;
