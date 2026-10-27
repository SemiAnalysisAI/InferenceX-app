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
  hwKey: string;
  precision: string;
  points: InferenceData[];
  minX: number;
  maxX: number;
}

/** Winning series per base SKU: hwKey → the precision(s) whose curve won for it. */
export type BestSeriesSelection = Map<string, Set<string>>;

function addWinner(selection: BestSeriesSelection, hwKey: string, precision: string): void {
  const precisions = selection.get(hwKey) ?? new Set<string>();
  precisions.add(precision);
  selection.set(hwKey, precisions);
}

/**
 * Ranks every (hwKey, precision) series of each base SKU and keeps the winner.
 *
 * A series is one hardware/framework/spec config at one precision, so the FP4
 * and FP8 curves of the same hwKey compete as separate candidates rather than
 * being merged into one Pareto front. With several precisions selected this
 * picks each chip's best config across precisions; with one precision selected
 * it is identical to ranking hwKeys within that precision.
 */
export function bestSeriesByPrecisionPerSku(
  points: InferenceData[],
  direction: Direction,
  precisions?: readonly string[],
): BestSeriesSelection {
  const bySku = new Map<string, Map<string, ScoredSeries>>();
  const selected: BestSeriesSelection = new Map();
  for (const point of points) {
    if (precisions && !precisions.includes(point.precision)) continue;
    if (point.powerVariant || !isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    const sku = baseSku(point);
    const hwKey = String(point.hwKey);
    const precision = String(point.precision);
    if (point.framework === 'tilert') addWinner(selected, hwKey, precision);
    let series = bySku.get(sku);
    if (!series) {
      series = new Map();
      bySku.set(sku, series);
    }
    const seriesKey = `${hwKey}\u0000${precision}`;
    const entry = series.get(seriesKey) ?? {
      hwKey,
      precision,
      points: [],
      minX: Infinity,
      maxX: -Infinity,
    };
    entry.points.push(point);
    series.set(seriesKey, entry);
  }

  const higherYIsBetter = direction.startsWith('upper');

  for (const series of bySku.values()) {
    const candidates: ScoredSeries[] = [...series.values()].map((entry) => {
      const frontier = paretoFrontForDirection(direction)([...entry.points]).toSorted(
        (a, b) => a.x - b.x,
      );
      return {
        ...entry,
        points: frontier,
        minX: frontier[0]?.x ?? Infinity,
        maxX: frontier.at(-1)?.x ?? -Infinity,
      };
    });
    const usable = candidates.filter((candidate) => candidate.points.length > 0);
    if (usable.length === 0) continue;
    if (usable.length === 1) {
      addWinner(selected, usable[0].hwKey, usable[0].precision);
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
      addWinner(selected, scoringPool[0].hwKey, scoringPool[0].precision);
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
      .toSorted(
        (a, b) =>
          b.score - a.score ||
          a.candidate.hwKey.localeCompare(b.candidate.hwKey) ||
          a.candidate.precision.localeCompare(b.candidate.precision),
      )[0];
    addWinner(selected, winner.candidate.hwKey, winner.candidate.precision);
  }

  return selected;
}

/** hwKeys of the winning series per base SKU (see `bestSeriesByPrecisionPerSku`). */
export function bestSeriesPerSku(
  points: InferenceData[],
  direction: Direction,
  precisions?: readonly string[],
): Set<string> {
  return new Set(bestSeriesByPrecisionPerSku(points, direction, precisions).keys());
}

/**
 * Drops the losing precisions of each winning hwKey so Optimal Only renders the
 * winning curve alone. hwKeys without a ranked winner (unranked or unselected
 * configs) keep every precision.
 */
export function restrictToBestPrecisions<T extends { hwKey: unknown; precision: unknown }>(
  points: readonly T[],
  selection: ReadonlyMap<string, ReadonlySet<string>>,
): T[] {
  return points.filter((point) => {
    const winners = selection.get(String(point.hwKey));
    return !winners || winners.has(String(point.precision));
  });
}

/** Applies `restrictToBestPrecisions` to a graph's chart, table and clipped rows. */
export function restrictGraphToBestPrecisions<
  G extends {
    data: InferenceData[];
    tableData?: InferenceData[];
    clippedData?: { point: InferenceData }[];
  },
>(graph: G, selection: ReadonlyMap<string, ReadonlySet<string>>): G {
  if (selection.size === 0) return graph;
  return {
    ...graph,
    data: restrictToBestPrecisions(graph.data, selection),
    ...(graph.tableData ? { tableData: restrictToBestPrecisions(graph.tableData, selection) } : {}),
    ...(graph.clippedData
      ? {
          clippedData: graph.clippedData.filter(
            (clipped) => restrictToBestPrecisions([clipped.point], selection).length > 0,
          ),
        }
      : {}),
  };
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
