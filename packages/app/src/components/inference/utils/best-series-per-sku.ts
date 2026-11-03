import type { InferenceData } from '@/components/inference/types';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  paretoMaximizesX,
} from '@/lib/charts/chart-utils';

type Direction = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

const MIN_CURVE_FRONTIER_POINTS = 2;

export function baseSku(point: Pick<InferenceData, 'hw' | 'hwKey'>): string {
  const rawHardware = String(point.hw || '').split('-')[0];
  return rawHardware || String(point.hwKey).split(/[_-]/u)[0];
}

interface ScoredSeries {
  key: string;
  points: InferenceData[];
}

export function bestSeriesPerSku(
  points: InferenceData[],
  direction: Direction,
  precisions?: readonly string[],
): Set<string> {
  const bySku = new Map<string, Map<string, InferenceData[]>>();
  const featured = new Set<string>();
  for (const point of points) {
    if (precisions && !precisions.includes(point.precision)) continue;
    if (point.powerVariant || !isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    const sku = baseSku(point);
    const key = String(point.hwKey);
    if (point.framework === 'tilert') featured.add(key);
    let series = bySku.get(sku);
    if (!series) {
      series = new Map();
      bySku.set(sku, series);
    }
    const rows = series.get(key) ?? [];
    rows.push(point);
    series.set(key, rows);
  }

  const selected = new Set(featured);

  for (const series of bySku.values()) {
    const candidates: ScoredSeries[] = [...series.entries()].map(([key, rows]) => {
      const frontier = paretoFrontForDirection(direction)([...rows]).toSorted((a, b) => a.x - b.x);
      return { key, points: frontier };
    });
    const usable = candidates.filter((candidate) => candidate.points.length > 0);
    if (usable.length === 0) continue;
    if (usable.length === 1) {
      selected.add(usable[0].key);
      continue;
    }

    const comparable = usable.filter(
      (candidate) => candidate.points.length >= MIN_CURVE_FRONTIER_POINTS,
    );
    const scoringPool =
      comparable.length > 0
        ? comparable
        : usable.filter(
            (candidate) =>
              candidate.points.length === Math.max(...usable.map((item) => item.points.length)),
          );
    if (scoringPool.length === 1) {
      selected.add(scoringPool[0].key);
      continue;
    }

    const scores = scoringPool.map((candidate) => hypervolume(candidate.points, direction));

    const winner = scoringPool
      .map((candidate, index) => ({ candidate, score: scores[index] }))
      .toSorted((a, b) => b.score - a.score || a.candidate.key.localeCompare(b.candidate.key))[0];
    selected.add(winner.candidate.key);
  }

  return selected;
}

export function withUnrankedSkus(
  best: ReadonlySet<string>,
  rankedPoints: readonly InferenceData[],
  candidates: readonly InferenceData[],
): Set<string> {
  const selected = new Set(best);
  const rankedSkus = new Set(
    [...rankedPoints, ...candidates].filter((point) => best.has(String(point.hwKey))).map(baseSku),
  );
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
