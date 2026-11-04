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

export interface SkuColumns {
  keys: string[];
  skus: readonly number[];
  skuCount: number;
  precisions: InferenceData['precision'][];
  first: Int32Array;
  count: Int32Array;
  start: Int32Array;
  x: Float64Array;
  y: Float64Array;
  precision: Int32Array;
  tilertSeries: Int32Array;
  tilertPrecision: Int32Array;
}

let pointSeries = new Int32Array(0);
let pointPrecision = new Int32Array(0);
let pointX = new Float64Array(0);
let pointY = new Float64Array(0);
let seriesX = new Float64Array(0);
let seriesY = new Float64Array(0);
let frontierX = new Float64Array(0);
let frontierY = new Float64Array(0);

const columnsByPoints = new WeakMap<readonly InferenceData[], SkuColumns>();

class SeriesIndex {
  readonly keys: string[] = [];
  readonly skus: number[] = [];
  readonly counts: number[] = [];
  private readonly hws: InferenceData['hw'][] = [];
  private readonly skuIds = new Map<string, number>();
  private readonly byKey = new Map<string, number>();
  private mixed: Map<string, number> | undefined;

  get skuCount(): number {
    return this.skuIds.size;
  }

  of(point: InferenceData): number {
    const key = String(point.hwKey);
    let s = this.byKey.get(key);
    if (s === undefined) {
      s = this.keys.length;
      this.byKey.set(key, s);
      this.add(key, point.hw, baseSku(point));
    } else if (point.hw !== this.hws[s]) {
      const sku = baseSku(point);
      if (this.skuIds.get(sku) !== this.skus[s]) {
        this.mixed ??= new Map();
        const mixedKey = `${sku}\u0000${key}`;
        let other = this.mixed.get(mixedKey);
        if (other === undefined) {
          other = this.keys.length;
          this.mixed.set(mixedKey, other);
          this.add(key, point.hw, sku);
        }
        s = other;
      }
    }
    return s;
  }

  private add(key: string, hw: InferenceData['hw'], sku: string): void {
    let id = this.skuIds.get(sku);
    if (id === undefined) {
      id = this.skuIds.size;
      this.skuIds.set(sku, id);
    }
    this.keys.push(key);
    this.hws.push(hw);
    this.skus.push(id);
    this.counts.push(0);
  }
}

function growPoints(n: number): void {
  if (pointSeries.length >= n) return;
  const size = Math.max(n, pointSeries.length * 2);
  pointSeries = new Int32Array(size);
  pointPrecision = new Int32Array(size);
  pointX = new Float64Array(size);
  pointY = new Float64Array(size);
}

function growSeries(n: number): void {
  if (seriesX.length >= n) return;
  const size = Math.max(n, seriesX.length * 2);
  seriesX = new Float64Array(size);
  seriesY = new Float64Array(size);
  frontierX = new Float64Array(size);
  frontierY = new Float64Array(size);
}

export function skuColumns(points: readonly InferenceData[]): SkuColumns {
  let columns = columnsByPoints.get(points);
  if (!columns) {
    columns = buildSkuColumns(points);
    columnsByPoints.set(points, columns);
  }
  return columns;
}

function buildSkuColumns(points: readonly InferenceData[]): SkuColumns {
  const n = points.length;
  growPoints(n);
  const series = new SeriesIndex();
  const precisionIds = new Map<InferenceData['precision'], number>();
  const precisions: InferenceData['precision'][] = [];
  const tilert: number[] = [];
  let last = -1;
  let lastHwKey: string | undefined;
  let lastHw: InferenceData['hw'] | undefined;
  let lastPrecisionId = -1;
  let lastPrecision: InferenceData['precision'] | undefined;
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const point = points[i];
    if (point.powerVariant || !isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    if (last < 0 || point.hwKey !== lastHwKey || point.hw !== lastHw) {
      last = series.of(point);
      lastHwKey = point.hwKey;
      lastHw = point.hw;
    }
    if (lastPrecisionId < 0 || point.precision !== lastPrecision) {
      let p = precisionIds.get(point.precision);
      if (p === undefined) {
        p = precisions.length;
        precisions.push(point.precision);
        precisionIds.set(point.precision, p);
      }
      lastPrecisionId = p;
      lastPrecision = point.precision;
    }
    if (point.framework === 'tilert') tilert.push(kept);
    series.counts[last]++;
    pointSeries[kept] = last;
    pointPrecision[kept] = lastPrecisionId;
    pointX[kept] = point.x;
    pointY[kept++] = point.y;
  }

  const { keys, counts } = series;
  const seriesCount = keys.length;
  const precisionCount = precisions.length;
  const first = new Int32Array(seriesCount * precisionCount);
  const count = new Int32Array(seriesCount * precisionCount);
  for (let k = 0; k < kept; k++) {
    const cell = pointSeries[k] * precisionCount + pointPrecision[k];
    if (count[cell]++ === 0) first[cell] = k;
  }
  const start = new Int32Array(seriesCount + 1);
  for (let s = 0; s < seriesCount; s++) start[s + 1] = start[s] + counts[s];
  const x = new Float64Array(kept);
  const y = new Float64Array(kept);
  const precision = new Int32Array(kept);
  const fill = start.slice(0, seriesCount);
  for (let k = 0; k < kept; k++) {
    const at = fill[pointSeries[k]]++;
    x[at] = pointX[k];
    y[at] = pointY[k];
    precision[at] = pointPrecision[k];
  }
  for (let s = 0; s < seriesCount; s++) sortRange(x, y, precision, start[s], start[s + 1]);

  return {
    keys,
    skus: series.skus,
    skuCount: series.skuCount,
    precisions,
    first,
    count,
    start,
    x,
    y,
    precision,
    tilertSeries: Int32Array.from(tilert, (k) => pointSeries[k]),
    tilertPrecision: Int32Array.from(tilert, (k) => pointPrecision[k]),
  };
}

export function bestSeriesPerSku(
  columns: SkuColumns,
  direction: Direction,
  precisions?: readonly string[],
): Set<string> {
  const { keys, first, count } = columns;
  const seriesCount = keys.length;
  const precisionCount = columns.precisions.length;
  let allowed: Uint8Array | undefined;
  if (precisions) {
    allowed = new Uint8Array(precisionCount);
    let all = true;
    for (let p = 0; p < precisionCount; p++) {
      if (precisions.includes(columns.precisions[p])) allowed[p] = 1;
      else all = false;
    }
    if (all) allowed = undefined;
  }

  const selected = new Set<string>();
  const { tilertSeries, tilertPrecision } = columns;
  for (let t = 0; t < tilertSeries.length; t++) {
    if (!allowed || allowed[tilertPrecision[t]]) selected.add(keys[tilertSeries[t]]);
  }

  let order: number[] | undefined;
  if (allowed) {
    order = [];
    const firstOf = new Int32Array(seriesCount);
    for (let s = 0; s < seriesCount; s++) {
      let earliest = -1;
      for (let p = 0; p < precisionCount; p++) {
        const cell = s * precisionCount + p;
        if (allowed[p] && count[cell] > 0 && (earliest < 0 || first[cell] < earliest)) {
          earliest = first[cell];
        }
      }
      if (earliest < 0) continue;
      firstOf[s] = earliest;
      order.push(s);
    }
    order.sort((a, b) => firstOf[a] - firstOf[b]);
  }

  const groups = groupBySku(columns.skus, columns.skuCount, order);
  growSeries(columns.x.length);
  const xSign = direction === 'lower_right' ? -1 : 1;
  const ySign = direction.startsWith('upper') ? -1 : 1;
  const end = new Int32Array(seriesCount);
  for (const group of groups) {
    if (group.length === 1) continue;
    for (const s of group) end[s] = gatherSeries(columns, s, allowed, xSign, ySign);
  }
  rankGroups(groups, keys, columns.start, end, direction, xSign, ySign, selected);
  return selected;
}

export function bestSeriesPerSkuOnce(
  points: readonly InferenceData[],
  direction: Direction,
  precisions?: readonly string[],
): Set<string> {
  const n = points.length;
  growPoints(n);
  growSeries(n);
  const xSign = direction === 'lower_right' ? -1 : 1;
  const ySign = direction.startsWith('upper') ? -1 : 1;
  const series = new SeriesIndex();
  const selected = new Set<string>();
  let last = -1;
  let lastHwKey: string | undefined;
  let lastHw: InferenceData['hw'] | undefined;
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const point = points[i];
    if (precisions && !precisions.includes(point.precision)) continue;
    if (point.powerVariant || !isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    if (point.framework === 'tilert') selected.add(String(point.hwKey));
    if (last < 0 || point.hwKey !== lastHwKey || point.hw !== lastHw) {
      last = series.of(point);
      lastHwKey = point.hwKey;
      lastHw = point.hw;
    }
    series.counts[last]++;
    pointSeries[kept] = last;
    pointX[kept] = point.x * xSign;
    pointY[kept++] = point.y * ySign;
  }

  const { keys, counts } = series;
  const seriesCount = keys.length;
  const start = new Int32Array(seriesCount + 1);
  for (let s = 0; s < seriesCount; s++) start[s + 1] = start[s] + counts[s];
  const end = start.slice(0, seriesCount);
  for (let k = 0; k < kept; k++) {
    const at = end[pointSeries[k]]++;
    seriesX[at] = pointX[k];
    seriesY[at] = pointY[k];
  }
  const groups = groupBySku(series.skus, series.skuCount);
  rankGroups(groups, keys, start, end, direction, xSign, ySign, selected);
  return selected;
}

function groupBySku(
  skus: readonly number[],
  skuCount: number,
  order?: readonly number[],
): number[][] {
  const groupOf = new Int32Array(skuCount).fill(-1);
  const groups: number[][] = [];
  const total = order ? order.length : skus.length;
  for (let i = 0; i < total; i++) {
    const s = order ? order[i] : i;
    const g = groupOf[skus[s]];
    if (g < 0) {
      groupOf[skus[s]] = groups.length;
      groups.push([s]);
    } else {
      groups[g].push(s);
    }
  }
  return groups;
}

function rankGroups(
  groups: readonly number[][],
  keys: readonly string[],
  start: Int32Array,
  end: Int32Array,
  direction: Direction,
  xSign: number,
  ySign: number,
  selected: Set<string>,
): void {
  const frontierOf = new Int32Array(keys.length);
  const areaOf = new Float64Array(keys.length);
  for (const group of groups) {
    if (group.length === 1) {
      selected.add(keys[group[0]]);
      continue;
    }
    let comparable = 0;
    let lastComparable = 0;
    for (let g = 0; g < group.length; g++) {
      const s = group[g];
      sortRange(seriesX, seriesY, undefined, start[s], end[s]);
      frontierOf[s] = walkFrontier(start[s], end[s], direction, xSign, ySign, areaOf, s);
      if (frontierOf[s] < MIN_CURVE_FRONTIER_POINTS) continue;
      comparable++;
      lastComparable = g;
    }
    if (comparable === 1) {
      selected.add(keys[group[lastComparable]]);
      continue;
    }
    let winner = -1;
    for (const s of group) {
      if (comparable > 0 && frontierOf[s] < MIN_CURVE_FRONTIER_POINTS) continue;
      if (
        winner < 0 ||
        areaOf[s] - areaOf[winner] > 0 ||
        (!(areaOf[winner] - areaOf[s] > 0) && keys[s].localeCompare(keys[winner]) < 0)
      ) {
        winner = s;
      }
    }
    selected.add(keys[winner]);
  }
}

function gatherSeries(
  columns: SkuColumns,
  s: number,
  allowed: Uint8Array | undefined,
  xSign: number,
  ySign: number,
): number {
  const { x, y, precision } = columns;
  const from = columns.start[s];
  const to = columns.start[s + 1];
  let end = from;
  if (xSign < 0) {
    for (let i = to - 1; i >= from; i--) {
      if (allowed && !allowed[precision[i]]) continue;
      seriesX[end] = -x[i];
      seriesY[end++] = y[i] * ySign;
    }
  } else {
    for (let i = from; i < to; i++) {
      if (allowed && !allowed[precision[i]]) continue;
      seriesX[end] = x[i];
      seriesY[end++] = y[i] * ySign;
    }
  }
  return end;
}

function sortRange(
  xs: Float64Array,
  ys: Float64Array,
  tags: Int32Array | undefined,
  from: number,
  to: number,
): void {
  for (let i = from + 1; i < to; i++) {
    const x = xs[i];
    const y = ys[i];
    const tag = tags ? tags[i] : 0;
    let j = i - 1;
    while (j >= from && (xs[j] > x || (xs[j] === x && ys[j] > y))) {
      xs[j + 1] = xs[j];
      ys[j + 1] = ys[j];
      if (tags) tags[j + 1] = tags[j];
      j--;
    }
    xs[j + 1] = x;
    ys[j + 1] = y;
    if (tags) tags[j + 1] = tag;
  }
}

function walkFrontier(
  from: number,
  end: number,
  direction: Direction,
  xSign: number,
  ySign: number,
  areaOf: Float64Array,
  s: number,
): number {
  const xs = seriesX;
  const ys = seriesY;
  const fx = frontierX;
  const fy = frontierY;
  let len = 0;
  let bound = direction === 'upper_right' ? -Infinity : Infinity;
  for (let i = from; i < end; i++) {
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
  areaOf[s] = area;
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
