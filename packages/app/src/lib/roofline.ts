/**
 * Pareto frontier ("roofline") math for scatter charts.
 *
 * Four directional Pareto-front variants, the per-metric roofline computation
 * (`computeAllRooflines`), and the roof-flag marking pass (`markRooflinePoints`).
 *
 * Runtime-compatible: no Node.js-specific modules (fs, path) or build-time
 * dependencies. Split out of chart-utils.ts; re-exported from there so existing
 * imports (`@/lib/chart-utils`) keep working unchanged.
 */

import type { ChartDefinition, InferenceData, YAxisMetricKey } from '@/lib/chart-types';
import { getNestedYValue, Y_AXIS_METRICS, type YAxisMetric } from '@/lib/chart-point';
import { ROOFLINE_METRIC_FIELD_SPECS } from '@/lib/metric-registry';

// ---------------------------------------------------------------------------
// Pareto frontier variants
// ---------------------------------------------------------------------------
//
// The four directions are NOT collapsed into a single fully-parameterised
// function because their scan bodies are genuinely different algorithms, not
// mirror images of one shape:
//
//   - upper_right : greedy max-Y sweep with a flat-roofline extension rule and
//                   a dedup-by-x "replace last" branch.
//   - upper_left  : monotone-stack sweep that pops while y >= top-of-stack.
//   - lower_left  : "new global minimum" sweep, sorted x ascending.
//   - lower_right : "new global minimum" sweep, sorted x descending.
//
// Only lower_left and lower_right share an identical scan body (they differ
// solely in sort order), so those two delegate to `scanNewMinimum`. Trying to
// force upper_right/upper_left through the same parameterisation would need
// per-direction loop bodies anyway and would obscure the tie-breaking and
// ordering that the tests pin exactly. The four named exports below preserve
// their original behaviour verbatim, including the in-place sort side effect.

/**
 * Shared scan for the "lower" fronts: after sorting, keep only points that hit
 * a new global minimum y. Used by both lower_left (x asc) and lower_right
 * (x desc); the caller supplies the sort so the traversal order differs.
 */
function scanNewMinimum(points: InferenceData[]): InferenceData[] {
  const front: InferenceData[] = [];
  let minY = Infinity;

  for (const point of points) {
    if (point.y < minY) {
      front.push(point);
      minY = point.y;
    }
  }
  return front;
}

/**
 * Calculates the Pareto front (upper right) for a given set of points.
 */
export const paretoFrontUpperRight = (points: InferenceData[]): InferenceData[] => {
  if (points.length === 0) {
    return [];
  }

  points.sort((a, b) => {
    if (a.x === b.x) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const front: InferenceData[] = [];
  let maxY = -Infinity;

  for (const point of points) {
    if (point.y > maxY || (front.length > 0 && point.y === maxY && point.x > front.at(-1)!.x)) {
      if (front.length > 0 && point.x === front.at(-1)!.x) {
        front[front.length - 1] = point;
      } else {
        front.push(point);
      }
      maxY = point.y;
    }
  }
  return front;
};

/**
 * Calculates the Pareto front (upper left) for a given set of points.
 */
export const paretoFrontUpperLeft = (points: InferenceData[]): InferenceData[] => {
  if (points.length === 0) {
    return [];
  }

  points.sort((a, b) => {
    if (a.x === b.x) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const front: InferenceData[] = [];

  for (const point of points) {
    if (front.length > 0 && point.x === front.at(-1)!.x) {
      if (point.y > front.at(-1)!.y) {
        front[front.length - 1] = point;
      }
      continue;
    }

    while (front.length > 0 && point.y >= front.at(-1)!.y) {
      front.pop();
    }
    front.push(point);
  }
  return front;
};

/**
 * Calculates the Pareto front (lower left) for a given set of points.
 */
export const paretoFrontLowerLeft = (points: InferenceData[]): InferenceData[] => {
  if (points.length === 0) {
    return [];
  }

  points.sort((a, b) => {
    if (a.x === b.x) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  return scanNewMinimum(points);
};

/**
 * Calculates the Pareto front (lower right) for a given set of points.
 */
export const paretoFrontLowerRight = (points: InferenceData[]): InferenceData[] => {
  if (points.length === 0) {
    return [];
  }

  points.sort((a, b) => {
    if (a.x === b.x) {
      return a.y - b.y;
    }
    return b.x - a.x;
  });

  return scanNewMinimum(points);
};

type RooflineDirection = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

/**
 * Dotted-path y-key variants accepted by calculateRoofline / computeAllRooflines.
 * Enumerates every `<metric>.y` accessor path plus the plain InferenceData keys.
 */
type RooflineYKey =
  | keyof InferenceData
  | `tpPerGpu.y`
  | `outputTputPerGpu.y`
  | `inputTputPerGpu.y`
  | `tpPerMw.y`
  | `inputTputPerMw.y`
  | `outputTputPerMw.y`
  | `costh.y`
  | `costn.y`
  | `costr.y`
  | `costhOutput.y`
  | `costnOutput.y`
  | `costrOutput.y`
  | `costhi.y`
  | `costni.y`
  | `costri.y`
  | `jTotal.y`
  | `jOutput.y`
  | `jInput.y`
  | `measuredAvgPower.y`
  | `measuredPrefillAvgPower.y`
  | `measuredDecodeAvgPower.y`
  | `measuredJPerOutputToken.y`
  | `measuredJPerTotalToken.y`
  | `measuredJPerInputToken.y`;

/**
 * Calculates the roofline for a given set of points.
 */
export const calculateRoofline = (
  points: InferenceData[],
  yKey: RooflineYKey,
  rooflineDirection: RooflineDirection,
): InferenceData[] => {
  const pointsForRoofline = points.map((p) => {
    const yValue = getNestedYValue(p, yKey);
    return { ...p, y: yValue };
  });

  switch (rooflineDirection) {
    case 'upper_right': {
      return paretoFrontUpperRight(pointsForRoofline);
    }
    case 'upper_left': {
      return paretoFrontUpperLeft(pointsForRoofline);
    }
    case 'lower_left': {
      return paretoFrontLowerLeft(pointsForRoofline);
    }
    case 'lower_right': {
      return paretoFrontLowerRight(pointsForRoofline);
    }
    default: {
      return [];
    }
  }
};

/**
 * Computes all relevant rooflines for a given set of grouped data points.
 */
export function computeAllRooflines(
  groupedData: Record<string, InferenceData[]>,
  chartDef: ChartDefinition,
): Record<string, Record<YAxisMetric, InferenceData[]>> {
  const computedRooflines: Record<string, Record<YAxisMetric, InferenceData[]>> = {};

  for (const hw of Object.keys(groupedData)) {
    computedRooflines[hw] = {} as Record<YAxisMetric, InferenceData[]>;
    for (const chartDefYKey of Y_AXIS_METRICS) {
      const actualDataYKey = chartDef[chartDefYKey as keyof ChartDefinition];
      const rooflineDirectionKey = `${chartDefYKey}_roofline` as keyof ChartDefinition;
      const rooflineDirection = chartDef[rooflineDirectionKey] as RooflineDirection | undefined;

      if (actualDataYKey && rooflineDirection) {
        computedRooflines[hw][chartDefYKey] = calculateRoofline(
          groupedData[hw],
          actualDataYKey as RooflineYKey,
          rooflineDirection,
        );
      }
    }
  }
  return computedRooflines;
}

/**
 * Maps each roofline-bearing metric key to its `{ y, roof }` field on
 * InferenceData, and whether that field is always present (required) or
 * conditionally present (optional). DERIVED from the metric registry
 * (`ROOFLINE_METRIC_FIELD_SPECS`) — one registry entry now supplies both the
 * config field and this marking spec, so there is no second list to keep in
 * sync (see `@/lib/metric-registry`).
 *
 * This drives both the roof reset pass and the roof marking pass in
 * markRooflinePoints. `required: false` fields are only touched when present on
 * the point, exactly preserving the original
 * `if (newPoint.field) newPoint.field.roof = ...` optional-field semantics.
 *
 * The `'y'` entry in Y_AXIS_METRICS has no roofline field, so it is not part of
 * the registry's roofline set and is naturally omitted here.
 */
const ROOFLINE_METRIC_FIELDS: readonly {
  metric: YAxisMetric;
  field: YAxisMetricKey;
  required: boolean;
}[] = ROOFLINE_METRIC_FIELD_SPECS;

/**
 * Marks data points as being "on the roofline".
 */
export function markRooflinePoints(
  groupedData: Record<string, InferenceData[]>,
  computedRooflines: Record<string, Record<YAxisMetric, InferenceData[]>>,
  chartDef: ChartDefinition,
): InferenceData[] {
  const finalProcessedData: InferenceData[] = [];

  for (const hwKey of Object.keys(groupedData)) {
    for (const point of groupedData[hwKey]) {
      const newPoint = { ...point };

      // Reset every roof flag before re-evaluating. Required fields are always
      // present; optional fields are only touched when present (mirrors the
      // original `if (newPoint.field) newPoint.field.roof = false`).
      for (const { field, required } of ROOFLINE_METRIC_FIELDS) {
        const metricValue = newPoint[field];
        if (required || metricValue) {
          metricValue!.roof = false;
        }
      }

      for (const { metric, field, required } of ROOFLINE_METRIC_FIELDS) {
        const rooflinePoints = computedRooflines[hwKey]?.[metric];
        if (!rooflinePoints) {
          continue;
        }

        const actualDataYKey = chartDef[metric as keyof ChartDefinition];
        if (!actualDataYKey) {
          continue;
        }

        const onCurrentRoofline = rooflinePoints.some(
          (rooflinePoint) =>
            rooflinePoint.x === point.x &&
            rooflinePoint.y === getNestedYValue(point, actualDataYKey as string) &&
            rooflinePoint.hwKey === point.hwKey,
        );

        const metricValue = newPoint[field];
        if (required || metricValue) {
          metricValue!.roof = onCurrentRoofline;
        }
      }
      finalProcessedData.push(newPoint);
    }
  }
  return finalProcessedData;
}
