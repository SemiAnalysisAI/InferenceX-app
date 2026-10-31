import { hermiteInterpolate, monotoneSlopes } from '@/components/calculator/interpolation';
import type { InferenceData } from '@/components/inference/types';
import { isFrontierEligible, paretoFrontForDirection } from '@/lib/charts/chart-utils';

type Direction = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

const SAMPLE_COUNT = 9;
const MIN_CURVE_FRONTIER_POINTS = 2;

export function baseSku(point: Pick<InferenceData, 'hw' | 'hwKey'>): string {
  const rawHardware = String(point.hw || '').split('-')[0];
  return rawHardware || String(point.hwKey).split(/[_-]/u)[0];
}

interface ScoredSeries {
  key: string;
  points: InferenceData[];
  minX: number;
  maxX: number;
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
  const higherYIsBetter = direction.startsWith('upper');

  for (const series of bySku.values()) {
    const candidates: ScoredSeries[] = [...series.entries()].map(([key, rows]) => {
      const frontier = paretoFrontForDirection(direction)([...rows]).toSorted((a, b) => a.x - b.x);
      return {
        key,
        points: frontier,
        minX: frontier[0]?.x ?? Infinity,
        maxX: frontier.at(-1)?.x ?? -Infinity,
      };
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

    const commonMin = Math.max(...scoringPool.map((candidate) => candidate.minX));
    const commonMax = Math.min(...scoringPool.map((candidate) => candidate.maxX));
    const hasCommonDomain = commonMin <= commonMax;

    const score = (candidate: ScoredSeries): number => {
      const xs = candidate.points.map((point) => point.x);
      const ys = candidate.points.map((point) => point.y);
      if (!hasCommonDomain) {
        return higherYIsBetter ? Math.max(...ys) : -Math.min(...ys);
      }
      const slopes = monotoneSlopes(xs, ys);
      let total = 0;
      for (let index = 0; index < SAMPLE_COUNT; index++) {
        const fraction = index / (SAMPLE_COUNT - 1);
        const x = commonMin + (commonMax - commonMin) * fraction;
        total += hermiteInterpolate(xs, ys, slopes, x);
      }
      const mean = total / SAMPLE_COUNT;
      return higherYIsBetter ? mean : -mean;
    };

    const winner = scoringPool
      .map((candidate) => ({ candidate, score: score(candidate) }))
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
