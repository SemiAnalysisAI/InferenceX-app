import type { CostProvider, GPUDataPoint, InterpolatedResult } from './types';

export function paretoFrontUpperLeft<T>(
  points: T[],
  getX: (p: T) => number,
  getY: (p: T) => number,
): T[] {
  if (points.length === 0) return [];

  const sorted = [...points].toSorted((a, b) => {
    const ax = getX(a);
    const bx = getX(b);
    if (ax === bx) return getY(b) - getY(a);
    return ax - bx;
  });

  const front: T[] = [];

  for (const point of sorted) {
    const px = getX(point);
    const py = getY(point);

    if (front.length > 0 && getX(front.at(-1)!) === px) {
      if (py > getY(front.at(-1)!)) {
        front[front.length - 1] = point;
      }
      continue;
    }

    while (front.length > 0 && py >= getY(front.at(-1)!)) {
      front.pop();
    }
    front.push(point);
  }

  return front;
}

export function sign(x: number): number {
  return x < 0 ? -1 : 1;
}

export function monotoneSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  if (n < 2) return Array.from({ length: n }, () => 0);

  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const hi = xs[i + 1] - xs[i];
    h.push(hi);
    s.push(hi === 0 ? 0 : (ys[i + 1] - ys[i]) / hi);
  }

  const m: number[] = Array.from({ length: n }, () => 0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    const h0 = h[i - 1];
    const h1 = h[i];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    m[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }

  m[0] = h[0] ? (3 * s[0] - m[1]) / 2 : m[1];
  m[n - 1] = h[n - 2] ? (3 * s[n - 2] - m[n - 2]) / 2 : m[n - 2];

  return m;
}

export function hermiteInterpolate(
  xs: number[],
  ys: number[],
  m: number[],
  targetX: number,
): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (n === 1) return ys[0];

  if (targetX <= xs[0]) return ys[0];
  if (targetX >= xs[n - 1]) return ys[n - 1];

  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= targetX) lo = mid;
    else hi = mid;
  }

  const hh = xs[hi] - xs[lo];
  if (hh === 0) return ys[lo];

  const t = (targetX - xs[lo]) / hh;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * ys[lo] + h10 * hh * m[lo] + h01 * ys[hi] + h11 * hh * m[hi];
}

export function getCostField(
  p: GPUDataPoint,
  costProvider: CostProvider,
  costType: 'total' | 'input' | 'output',
): number {
  if (costType === 'input') {
    return costProvider === 'costh' ? p.costhi : p.costri;
  }
  if (costType === 'output') {
    return costProvider === 'costh' ? p.costhOutput : p.costrOutput;
  }
  return p[costProvider];
}

export function recoverReciprocalNumerator(
  values: readonly number[],
  throughputs: readonly number[],
): number | null {
  const RELATIVE_TOLERANCE = 1e-3;
  let numerator: number | null = null;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const throughput = throughputs[i];
    if (value === undefined || throughput === undefined) continue;
    if (!(value > 0) || !(throughput > 0)) continue;

    const candidate = value * throughput;
    if (numerator === null) {
      numerator = candidate;
    } else if (Math.abs(candidate - numerator) > Math.abs(numerator) * RELATIVE_TOLERANCE) {
      return null;
    }
  }

  return numerator;
}

export function reciprocalMetricAt(numerator: number | null, throughput: number): number {
  if (numerator === null || !(throughput > 0)) return 0;
  return numerator / throughput;
}

function recoverCostRate(
  sorted: readonly GPUDataPoint[],
  costProvider: CostProvider,
): number | null {
  return recoverReciprocalNumerator(
    [
      ...sorted.map((p) => getCostField(p, costProvider, 'total')),
      ...sorted.map((p) => getCostField(p, costProvider, 'output')),
      ...sorted.map((p) => getCostField(p, costProvider, 'input')),
    ],
    [
      ...sorted.map((p) => p.throughput),
      ...sorted.map((p) => p.outputThroughput),
      ...sorted.map((p) => p.inputThroughput),
    ],
  );
}

export function maxInteractivityAtCost(
  points: GPUDataPoint[],
  targetCost: number,
  costProvider: CostProvider,
  costType: 'total' | 'input' | 'output',
): number | null {
  if (points.length === 0 || targetCost <= 0) return null;

  const frontier = paretoFrontUpperLeft(
    points,
    (p) => p.interactivity,
    (p) => p.throughput,
  );
  if (frontier.length === 0) return null;

  const sorted = [...frontier].toSorted((a, b) => a.interactivity - b.interactivity);
  const getCost = (p: GPUDataPoint) => getCostField(p, costProvider, costType);

  if (sorted.length === 1) {
    return getCost(sorted[0]) <= targetCost ? sorted[0].interactivity : null;
  }

  const xs = sorted.map((p) => p.interactivity);
  const getTput = (p: GPUDataPoint) =>
    costType === 'input'
      ? p.inputThroughput
      : costType === 'output'
        ? p.outputThroughput
        : p.throughput;
  const tputs = sorted.map(getTput);
  const costs = sorted.map(getCost);
  const rate = recoverCostRate(sorted, costProvider);
  const ys = rate === null ? costs : tputs;
  const slopes = monotoneSlopes(xs, ys);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const splineAt = (x: number) => Math.max(lo, Math.min(hi, hermiteInterpolate(xs, ys, slopes, x)));
  const costAt = (x: number) =>
    rate === null ? splineAt(x) : reciprocalMetricAt(rate, splineAt(x));

  const minX = xs[0];
  const maxX = xs.at(-1)!;

  if (costAt(maxX) <= targetCost) return maxX;

  const STEPS = 512;
  const step = (maxX - minX) / STEPS;
  let below = -1;
  for (let i = STEPS - 1; i >= 0; i--) {
    const x = minX + i * step;
    if (costAt(x) <= targetCost) {
      below = x;
      break;
    }
  }
  if (below < 0) return null;

  let loX = below;
  let hiX = Math.min(below + step, maxX);
  for (let iter = 0; iter < 40; iter++) {
    const mid = (loX + hiX) / 2;
    if (costAt(mid) <= targetCost) loX = mid;
    else hiX = mid;
  }
  return loX;
}

export function interpolateForGPU(
  points: GPUDataPoint[],
  targetValue: number,
  mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
  costProvider: CostProvider,
): InterpolatedResult | null {
  if (points.length === 0) return null;

  const hwKey = points[0].hwKey;

  const getInputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.interactivity : p.throughput;
  const getOutputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.throughput : p.interactivity;

  const frontier = paretoFrontUpperLeft(points, getInputValue, getOutputValue);
  if (frontier.length === 0) return null;

  const sorted = [...frontier].toSorted((a, b) => getInputValue(a) - getInputValue(b));

  const minInput = getInputValue(sorted[0]);
  const maxInput = getInputValue(sorted.at(-1)!);

  const clampedTarget = Math.max(minInput, Math.min(maxInput, targetValue));
  const clampedBelow = targetValue < minInput;
  const clampedAbove = targetValue > maxInput;
  const clamped = clampedBelow || clampedAbove;

  if (sorted.length === 1) {
    return {
      hwKey,
      resultKey: hwKey,
      value: getOutputValue(sorted[0]),
      outputTputValue: sorted[0].outputThroughput,
      inputTputValue: sorted[0].inputThroughput,
      cost: getCostField(sorted[0], costProvider, 'total'),
      costInput: getCostField(sorted[0], costProvider, 'input'),
      costOutput: getCostField(sorted[0], costProvider, 'output'),
      tpPerMw: sorted[0].tpPerMw,
      inputTpPerMw: sorted[0].inputTpPerMw,
      outputTpPerMw: sorted[0].outputTpPerMw,
      cacheHitRate: sorted[0].cacheHitRate,
      theoreticalCacheHitRate: sorted[0].theoreticalCacheHitRate,
      inputTokenShare: sorted[0].inputTokenShare,
      concurrency: sorted[0].concurrency,
      nearestPoints: [sorted[0]],
      clamped,
      clampedAbove,
      clampedBelow,
    };
  }

  const xs = sorted.map(getInputValue);

  const buildMetric = (extract: (p: GPUDataPoint) => number) => {
    const ys = sorted.map(extract);
    let lo = ys[0];
    let hi = ys[0];
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < lo) lo = ys[i];
      if (ys[i] > hi) hi = ys[i];
    }
    const slopes = monotoneSlopes(xs, ys);
    const raw = hermiteInterpolate(xs, ys, slopes, clampedTarget);
    return Math.max(lo, Math.min(hi, raw));
  };

  const value = buildMetric(getOutputValue);
  const outputTputValue = buildMetric((p) => p.outputThroughput);
  const inputTputValue = buildMetric((p) => p.inputThroughput);

  const totalTputAtTarget = mode === 'interactivity_to_throughput' ? value : clampedTarget;
  const rate = recoverCostRate(sorted, costProvider);
  const cost =
    rate === null
      ? buildMetric((p) => getCostField(p, costProvider, 'total'))
      : reciprocalMetricAt(rate, totalTputAtTarget);
  const costInput =
    rate === null
      ? buildMetric((p) => getCostField(p, costProvider, 'input'))
      : reciprocalMetricAt(rate, inputTputValue);
  const costOutput =
    rate === null
      ? buildMetric((p) => getCostField(p, costProvider, 'output'))
      : reciprocalMetricAt(rate, outputTputValue);

  const tpPerMw = buildMetric((p) => p.tpPerMw);
  const inputTpPerMw = buildMetric((p) => p.inputTpPerMw);
  const outputTpPerMw = buildMetric((p) => p.outputTpPerMw);
  const concurrency = Math.round(buildMetric((p) => p.concurrency));

  const cacheHitRate = sorted.every((p) => typeof p.cacheHitRate === 'number')
    ? buildMetric((p) => p.cacheHitRate!)
    : undefined;

  const theoreticalCacheHitRate = sorted.every((p) => typeof p.theoreticalCacheHitRate === 'number')
    ? buildMetric((p) => p.theoreticalCacheHitRate!)
    : undefined;

  const inputTokenShare = sorted.every((p) => typeof p.inputTokenShare === 'number')
    ? buildMetric((p) => p.inputTokenShare!)
    : undefined;

  let nearestPoints: GPUDataPoint[];
  if (clampedTarget <= minInput) {
    nearestPoints = [sorted[0]];
  } else if (clampedTarget >= maxInput) {
    nearestPoints = [sorted.at(-1)!];
  } else {
    let lowerIdx = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (getInputValue(sorted[i]) <= clampedTarget) lowerIdx = i;
    }
    const upperIdx = lowerIdx + 1;
    nearestPoints = [sorted[lowerIdx], sorted[upperIdx]];
  }

  return {
    hwKey,
    resultKey: hwKey,
    value,
    outputTputValue,
    inputTputValue,
    cost,
    costInput,
    costOutput,
    tpPerMw,
    inputTpPerMw,
    outputTpPerMw,
    cacheHitRate,
    theoreticalCacheHitRate,
    inputTokenShare,
    concurrency,
    nearestPoints,
    clamped,
    clampedAbove,
    clampedBelow,
  };
}
