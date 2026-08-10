import { hermiteInterpolate, monotoneSlopes } from '@/components/calculator/interpolation';
import type { InferenceData } from '@/components/inference/types';
import { isFrontierEligible, paretoFrontForDirection } from '@/lib/chart-utils';

type Direction = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

// Named separately so the sampling density is obvious in test failures and can
// be changed without leaving a magic number in the scoring loop.
const SAMPLE_COUNT = 9;

/** The physical SKU portion shared by framework/speculative-decoding variants. */
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

/**
 * Select one configuration line per physical SKU using normalized frontier AUC.
 *
 * Every candidate is sampled over the common measured x-domain for that SKU,
 * so a curve cannot win merely because it spans a wider range. The chart's
 * existing Pareto direction and monotone interpolation are reused to keep the
 * ranking aligned with the line users see. Ties are deterministic by hwKey.
 */
export function bestSeriesPerSku(points: InferenceData[], direction: Direction): Set<string> {
  const bySku = new Map<string, Map<string, InferenceData[]>>();
  for (const point of points) {
    if (!isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    const sku = baseSku(point);
    const key = String(point.hwKey);
    let series = bySku.get(sku);
    if (!series) {
      series = new Map();
      bySku.set(sku, series);
    }
    const rows = series.get(key) ?? [];
    rows.push(point);
    series.set(key, rows);
  }

  const selected = new Set<string>();
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

    const commonMin = Math.max(...usable.map((candidate) => candidate.minX));
    const commonMax = Math.min(...usable.map((candidate) => candidate.maxX));
    const hasCommonDomain = commonMin <= commonMax;

    const score = (candidate: ScoredSeries): number => {
      const xs = candidate.points.map((point) => point.x);
      const ys = candidate.points.map((point) => point.y);
      if (!hasCommonDomain) {
        // No honest AUC comparison is possible. Prefer the best measured point;
        // the key tie-break below keeps the choice stable.
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

    const winner = usable
      .map((candidate) => ({ candidate, score: score(candidate) }))
      .toSorted((a, b) => b.score - a.score || a.candidate.key.localeCompare(b.candidate.key))[0];
    selected.add(winner.candidate.key);
  }

  return selected;
}
