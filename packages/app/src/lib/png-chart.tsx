// Shared chart primitives for variant-compare PNG routes.
// compare/compare-per-dollar/blog still carry their own copies (follow-up to migrate).
import type { SsrInterpolatedRow } from '@/lib/compare-variant-ssr';

export const R = 2;
export const SIZE = { width: 1200 * R, height: 675 * R };
export const CHART_FRAME = { left: 0, top: 18 * R, width: 746 * R, height: 382 * R };
export const CHART = { left: 96 * R, top: 42 * R, width: 630 * R, height: 260 * R };
export const COLORS = {
  background: '#0d1117',
  panel: '#121a23',
  border: '#23303d',
  muted: '#9aa7b5',
  faint: '#5f6e7d',
  text: '#f3f7fb',
  a: '#38d9a9',
  b: '#f7b041',
  grid: '#263544',
  blue: '#0b86d1',
};

export interface Point {
  x: number;
  y: number;
}

export interface TargetedPoint extends Point {
  target: number;
}

export function money(value: number): string {
  if (value >= 10) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}

export function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.max(0, Math.ceil(-Math.log10(step)));
}

export function moneyForStep(value: number, step: number): string {
  return `$${value.toFixed(decimalsForStep(step))}`;
}

export function niceStep(span: number, targetCount: number): number {
  const rawStep = span / Math.max(1, targetCount - 1);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / mag;
  if (normalized < 1.5) return mag;
  if (normalized < 3) return 2 * mag;
  if (normalized < 7) return 5 * mag;
  return 10 * mag;
}

export function niceAxis(
  min: number,
  max: number,
  targetCount = 5,
): { min: number; max: number; step: number; ticks: number[] } {
  if (max <= min) return { min, max: min + 1, step: 1, ticks: [min] };
  const step = niceStep(max - min, targetCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step * 1e-6; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

export function pointsPath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function buildSeriesPoints(
  curveRows: SsrInterpolatedRow[],
  getCost: (row: SsrInterpolatedRow) => number | null,
  scaleX: (value: number) => number,
  scaleY: (value: number) => number,
): TargetedPoint[] {
  return curveRows
    .map((row) => ({ target: row.target, cost: getCost(row) }))
    .filter((p): p is { target: number; cost: number } => p.cost !== null)
    .map((p) => ({ x: scaleX(p.target), y: scaleY(p.cost), target: p.target }));
}

export function splitByMatchRange(points: TargetedPoint[], matchedMin: number, matchedMax: number) {
  return {
    matched: points.filter((p) => p.target >= matchedMin && p.target <= matchedMax),
    leftExt: points.filter((p) => p.target <= matchedMin),
    rightExt: points.filter((p) => p.target >= matchedMax),
  };
}

export function renderSeriesPath(points: Point[], stroke: string, dashed: boolean) {
  if (points.length < 2) return null;
  return (
    <path
      d={pointsPath(points)}
      fill="none"
      stroke={stroke}
      strokeWidth={9 * R}
      strokeOpacity={dashed ? 0.55 : 1}
      strokeDasharray={dashed ? `${14 * R} ${10 * R}` : undefined}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}
