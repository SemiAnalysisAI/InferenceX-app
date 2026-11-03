import type { InferenceData } from '@/components/inference/types';
import { isFrontierEligible, paretoMaximizesX } from '@/lib/charts/chart-utils';

type Direction = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

const MIN_CURVE_FRONTIER_POINTS = 2;

export function baseSku(point: Pick<InferenceData, 'hw' | 'hwKey'>): string {
  const hw = String(point.hw || '');
  const dash = hw.indexOf('-');
  if (dash !== 0 && hw) return dash === -1 ? hw : hw.slice(0, dash);
  const key = String(point.hwKey);
  const cut = key.search(/[_-]/u);
  return cut === -1 ? key : key.slice(0, cut);
}

interface Series {
  key: string;
  hw: InferenceData['hw'];
  sku: string;
  start: number;
  count: number;
  frontier: number;
  area: number;
}

let seriesOf = new Int32Array(0);
let seriesX = new Float64Array(0);
let seriesY = new Float64Array(0);
let frontierX = new Float64Array(0);
let frontierY = new Float64Array(0);

export function bestSeriesPerSku(
  points: InferenceData[],
  direction: Direction,
  precisions?: readonly string[],
): Set<string> {
  const n = points.length;
  if (seriesOf.length < n) {
    const size = Math.max(n, seriesOf.length * 2);
    seriesOf = new Int32Array(size);
    seriesX = new Float64Array(size);
    seriesY = new Float64Array(size);
    frontierX = new Float64Array(size);
    frontierY = new Float64Array(size);
  }
  const series: Series[] = [];
  const byKey = new Map<string, number>();
  let mixed: Map<string, number> | undefined;
  const selected = new Set<string>();
  let last = -1;
  let lastHwKey: string | undefined;
  let lastHw: InferenceData['hw'] | undefined;
  const xSign = direction === 'lower_right' ? -1 : 1;
  const ySign = direction.startsWith('upper') ? -1 : 1;
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const point = points[i];
    if (precisions && !precisions.includes(point.precision)) continue;
    if (point.powerVariant || !isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    if (point.framework === 'tilert') selected.add(String(point.hwKey));
    if (last < 0 || point.hwKey !== lastHwKey || point.hw !== lastHw) {
      const key = String(point.hwKey);
      let s = byKey.get(key);
      if (s === undefined) {
        s = series.length;
        series.push(newSeries(key, point.hw, baseSku(point)));
        byKey.set(key, s);
      } else if (point.hw !== series[s].hw) {
        const sku = baseSku(point);
        if (sku !== series[s].sku) {
          mixed ??= new Map();
          const mixedKey = `${sku}\u0000${key}`;
          let other = mixed.get(mixedKey);
          if (other === undefined) {
            other = series.length;
            series.push(newSeries(key, point.hw, sku));
            mixed.set(mixedKey, other);
          }
          s = other;
        }
      }
      last = s;
      lastHwKey = point.hwKey;
      lastHw = point.hw;
    }
    seriesOf[kept] = last;
    frontierX[kept] = point.x * xSign;
    frontierY[kept++] = point.y * ySign;
    series[last].count++;
  }

  const bySku = new Map<string, Series[]>();
  let total = 0;
  for (const entry of series) {
    entry.start = total;
    total += entry.count;
    const group = bySku.get(entry.sku);
    if (group) group.push(entry);
    else bySku.set(entry.sku, [entry]);
  }

  for (let k = 0; k < kept; k++) {
    const entry = series[seriesOf[k]];
    const at = entry.start + entry.frontier++;
    seriesX[at] = frontierX[k];
    seriesY[at] = frontierY[k];
  }

  for (const group of bySku.values()) {
    if (group.length === 1) {
      selected.add(group[0].key);
      continue;
    }
    let comparable = 0;
    let lastComparable = 0;
    for (let g = 0; g < group.length; g++) {
      const entry = group[g];
      sortRange(seriesX, seriesY, entry.start, entry.start + entry.count);
      entry.frontier = walkFrontier(
        seriesX,
        seriesY,
        entry,
        direction,
        xSign,
        ySign,
        frontierX,
        frontierY,
      );
      if (entry.frontier < MIN_CURVE_FRONTIER_POINTS) continue;
      comparable++;
      lastComparable = g;
    }
    if (comparable === 1) {
      selected.add(group[lastComparable].key);
      continue;
    }
    let winner: Series | undefined;
    for (const entry of group) {
      if (comparable > 0 && entry.frontier < MIN_CURVE_FRONTIER_POINTS) continue;
      if (
        !winner ||
        entry.area - winner.area > 0 ||
        (!(winner.area - entry.area > 0) && entry.key.localeCompare(winner.key) < 0)
      ) {
        winner = entry;
      }
    }
    selected.add(winner!.key);
  }

  return selected;
}

function newSeries(key: string, hw: InferenceData['hw'], sku: string): Series {
  return { key, hw, sku, start: 0, count: 0, frontier: 0, area: 0 };
}

function sortRange(xs: Float64Array, ys: Float64Array, from: number, to: number): void {
  for (let i = from + 1; i < to; i++) {
    const x = xs[i];
    const y = ys[i];
    let j = i - 1;
    while (j >= from && (xs[j] > x || (xs[j] === x && ys[j] > y))) {
      xs[j + 1] = xs[j];
      ys[j + 1] = ys[j];
      j--;
    }
    xs[j + 1] = x;
    ys[j + 1] = y;
  }
}

function walkFrontier(
  xs: Float64Array,
  ys: Float64Array,
  entry: Series,
  direction: Direction,
  xSign: number,
  ySign: number,
  fx: Float64Array,
  fy: Float64Array,
): number {
  const end = entry.start + entry.count;
  let len = 0;
  let bound = direction === 'upper_right' ? -Infinity : Infinity;
  for (let i = entry.start; i < end; i++) {
    const x = xs[i] * xSign;
    const y = ys[i] * ySign;
    if (direction === 'upper_right') {
      if (!(y > bound || (y === bound && x > fx[len - 1]))) continue;
      len++;
      bound = y;
    } else if (direction === 'upper_left') {
      if (len > 0 && x === fx[len - 1]) continue;
      while (len > 0 && y >= fy[len - 1]) len--;
      len++;
    } else {
      if (!(y < bound)) continue;
      len++;
      bound = y;
    }
    fx[len - 1] = x;
    fy[len - 1] = y;
  }

  const maximizeX = paretoMaximizesX(direction);
  const maximizeY = ySign < 0;
  const reverse = maximizeX !== xSign < 0;
  let area = 0;
  let coveredV = 0;
  for (let k = 0; k < len; k++) {
    const at = reverse ? len - 1 - k : k;
    const u = maximizeX ? fx[at] : 1 / fx[at];
    const v = maximizeY ? fy[at] : 1 / fy[at];
    if (!(Number.isFinite(u) && Number.isFinite(v) && u > 0 && v > 0) || v <= coveredV) continue;
    area += u * (v - coveredV);
    coveredV = v;
  }
  entry.area = area;
  return len;
}

export function withUnrankedSkus(
  best: ReadonlySet<string>,
  rankedPoints: readonly InferenceData[],
  candidates: readonly InferenceData[],
): Set<string> {
  const selected = new Set(best);
  const rankedSkus = new Set<string>();
  for (const group of [rankedPoints, candidates]) {
    for (const point of group) {
      if (best.has(String(point.hwKey))) rankedSkus.add(baseSku(point));
    }
  }
  for (const point of candidates) {
    if (!rankedSkus.has(baseSku(point))) selected.add(String(point.hwKey));
  }
  return selected;
}

/**
 * Area of the chart a frontier dominates, measured from the origin after
 * mapping every lower-is-better axis to its reciprocal (cost → tokens per $,
 * latency → requests per second). A large lead where values are high outweighs
 * a long tail of small leads, missing coverage earns nothing, and reciprocal
 * metrics such as $/M tok and tok/$ rank identically.
 */
export function hypervolume(points: readonly InferenceData[], direction: Direction): number {
  const maximizeX = paretoMaximizesX(direction);
  const maximizeY = direction.startsWith('upper');
  const mapped = points
    .map((point) => ({
      u: maximizeX ? point.x : 1 / point.x,
      v: maximizeY ? point.y : 1 / point.y,
    }))
    .filter(({ u, v }) => Number.isFinite(u) && Number.isFinite(v) && u > 0 && v > 0)
    .toSorted((a, b) => b.u - a.u);
  let area = 0;
  let coveredV = 0;
  for (const { u, v } of mapped) {
    if (v <= coveredV) continue;
    area += u * (v - coveredV);
    coveredV = v;
  }
  return area;
}
