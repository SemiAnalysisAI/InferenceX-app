/**
 * Runtime-compatible chart utility functions.
 * These functions can be used in API routes and client-side code.
 * They do NOT import Node.js-specific modules (fs, path) or build-time dependencies.
 */

import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

import { AggDataEntry, ChartDefinition, InferenceData } from '@/components/inference/types';
import { getGpuSpecs, HARDWARE_CONFIG } from '@/lib/constants';
import { VENDOR_HSL_BANDS } from '@semianalysisai/inferencex-constants';
import { getVendor } from '@/lib/dynamic-colors';

/**
 * Simple seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces deterministic values in [0, 1) for a given seed.
 */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG for deterministic results.
 * Returns a new shuffled array (does not mutate the original).
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const rng = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// High-contrast vendor color config
//
// Vendor detection and HSL brand hue bands are defined in dynamic-colors.ts
// (single source of truth). See VENDOR_HSL_BANDS and getVendor().
// ---------------------------------------------------------------------------

/**
 * Build allowed hue ranges for a vendor, ordered by preference:
 *   1. Own brand band (preferred)
 *   2. Neutral zones (not claimed by any vendor)
 * Other vendors' brand bands are excluded. With 10+ keys per vendor,
 * this is bypassed and the full 360° wheel is used for maximum separation.
 */
function getAllowedRanges(vendor: string): { start: number; span: number }[] {
  const config = VENDOR_HSL_BANDS[vendor];

  // Unknown vendor: full wheel
  if (!config) return [{ start: 0, span: 360 }];

  // Collect all brand bands to avoid (other vendors' bands)
  const avoidBands = Object.entries(VENDOR_HSL_BANDS)
    .filter(([v]) => v !== vendor)
    .map(([, c]) => c);

  // Build "forbidden" set as sorted non-overlapping intervals on 0–360
  // Then allowed = own brand + everything not forbidden
  const forbidden: { start: number; end: number }[] = [];
  for (const band of avoidBands) {
    if (band.start < band.end) {
      forbidden.push({ start: band.start, end: band.end });
    } else {
      // Wraps around — split into two
      forbidden.push({ start: band.start, end: 360 });
      forbidden.push({ start: 0, end: band.end });
    }
  }
  forbidden.sort((a, b) => a.start - b.start);

  // Merge overlapping
  const merged: { start: number; end: number }[] = [];
  for (const f of forbidden) {
    const last = merged[merged.length - 1];
    if (last && f.start <= last.end) {
      last.end = Math.max(last.end, f.end);
    } else {
      merged.push({ ...f });
    }
  }

  // Allowed = gaps between forbidden intervals within 0–360
  const allowed: { start: number; span: number }[] = [];
  let cursor = 0;
  for (const f of merged) {
    if (f.start > cursor) {
      allowed.push({ start: cursor, span: f.start - cursor });
    }
    cursor = f.end;
  }
  if (cursor < 360) {
    allowed.push({ start: cursor, span: 360 - cursor });
  }

  if (allowed.length === 0) return [{ start: 0, span: 360 }];

  // Sort: own brand band first (by overlap with brand hue range), then rest
  allowed.sort((a, b) => {
    const aOverlap = rangeOverlapsBand(a, config);
    const bOverlap = rangeOverlapsBand(b, config);
    if (aOverlap && !bOverlap) return -1;
    if (!aOverlap && bOverlap) return 1;
    return 0;
  });

  return allowed;
}

/** Check if a linear hue range [start, start+span) overlaps a brand band (may wrap). */
function rangeOverlapsBand(
  range: { start: number; span: number },
  band: { start: number; end: number },
): boolean {
  const rStart = range.start;
  const rEnd = (range.start + range.span) % 360 || 360;

  if (band.start < band.end) {
    // Non-wrapping band: any point in range falls within [band.start, band.end]
    return rStart < band.end && rEnd > band.start;
  }
  // Wrapping band (e.g. 310→30): overlaps if range touches [310,360) or [0,30]
  return rStart < band.end || rEnd > band.start;
}

/**
 * Generates high contrast colors for chart elements using HSL color space.
 * Each vendor's keys are distributed across allowed hue ranges (excluding
 * other vendors' brand bands) for maximum distinction without confusing
 * color associations. With 10+ keys per vendor, uses the full hue wheel.
 * @param keys - Array of keys (hardware types, models, etc.) to generate colors for
 * @param theme - Current theme ('dark' or 'light') to adjust lightness
 * @param shuffleSeed - Optional seed for shuffling hue assignments. 0 = no shuffle.
 * @returns Object mapping each key to its high contrast HSL color
 */
export const generateHighContrastColors = (
  keys: string[],
  theme: string,
  shuffleSeed: number = 0,
): { [key: string]: string } => {
  const colors: { [key: string]: string } = {};
  const lightness = theme === 'dark' ? 65 : 35;

  // Group keys by vendor
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const vendor = getVendor(key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  // For each vendor group, distribute hues across their allowed ranges.
  // With 10+ keys, hue separation matters more than brand identity — use the full wheel.
  const MAX_VENDOR_AWARE = 10;
  for (const [vendor, vendorKeys] of groups) {
    const ranges =
      vendorKeys.length >= MAX_VENDOR_AWARE ? [{ start: 0, span: 360 }] : getAllowedRanges(vendor);
    const totalSpan = ranges.reduce((s, r) => s + r.span, 0);
    const count = vendorKeys.length;

    // Generate evenly-spaced hues across the concatenated allowed ranges
    let hues: number[] = [];
    for (let i = 0; i < count; i++) {
      // Position within the total allowed span
      const pos = count <= 1 ? totalSpan / 2 : ((i + 0.5) / count) * totalSpan;
      // Map position to actual hue by walking through ranges
      let remaining = pos;
      let hue = 0;
      for (const range of ranges) {
        if (remaining <= range.span) {
          hue = (range.start + remaining) % 360;
          break;
        }
        remaining -= range.span;
      }
      hues.push(hue);
    }

    if (shuffleSeed !== 0) {
      hues = seededShuffle(hues, shuffleSeed);
    }

    vendorKeys.forEach((key, i) => {
      colors[key] = `hsl(${hues[i].toFixed(1)}, 70%, ${lightness}%)`;
    });
  }
  return colors;
};

/**
 * Defines all possible Y-axis metrics that can be used for chart generation,
 * including base metrics and calculated roofline metrics.
 */
export const Y_AXIS_METRICS = [
  'y',
  'y_tpPerGpu',
  'y_inputTputPerGpu',
  'y_outputTputPerGpu',
  'y_tpPerMw',
  'y_inputTputPerMw',
  'y_outputTputPerMw',
  'y_costh',
  'y_costn',
  'y_costr',
  'y_costhOutput',
  'y_costnOutput',
  'y_costrOutput',
  'y_costhi',
  'y_costni',
  'y_costri',
  'y_jTotal',
  'y_jOutput',
  'y_jInput',
] as const;

export type YAxisMetric = (typeof Y_AXIS_METRICS)[number];

/**
 * Determines the correct hardware key based on the hardware name and MTP status.
 */
export const getHardwareKey = (entry: AggDataEntry): string => {
  let normalizedHwName = entry.hw.split('-')[0];
  if (entry.framework) {
    // Try framework as-is first, then disagg variant if it exists in HARDWARE_CONFIG
    const candidateDirect = `${normalizedHwName}_${entry.framework}`;
    if (candidateDirect in HARDWARE_CONFIG) {
      normalizedHwName = candidateDirect;
    } else if (entry.disagg) {
      const candidateDisagg = `${normalizedHwName}_${entry.framework}-disagg`;
      normalizedHwName = candidateDisagg in HARDWARE_CONFIG ? candidateDisagg : candidateDirect;
    } else {
      normalizedHwName = candidateDirect;
    }
  }
  if (entry.mtp === 'on' || entry['spec_decoding'] === 'mtp') {
    normalizedHwName = `${normalizedHwName}_mtp`;
  } else {
    if (entry['spec_decoding'] && entry['spec_decoding'] !== 'none') {
      normalizedHwName = `${normalizedHwName}_${entry['spec_decoding']}`;
    }
  }
  return normalizedHwName;
};

/**
 * Normalizes a hardware key from evaluation/reliability data entries.
 * Handles the looser naming conventions in eval data (e.g. "B200 NB", "H200 CW")
 * by stripping qualifiers and building a HARDWARE_CONFIG-compatible key.
 */
export function normalizeEvalHardwareKey(
  hw: string,
  framework?: string,
  specDecoding?: string,
): string {
  let hwName = hw.toLowerCase().replace(/-/g, '_');

  // Strip additional qualifiers that aren't in HARDWARE_CONFIG
  // e.g., "b200 nb" -> "b200", "h200 cw" -> "h200"
  hwName = hwName.replace(/\s+(nb|cw|nv|dgxc|amds|cr|amd)$/i, '');

  // Try to find a more specific hardware config that includes framework
  if (framework) {
    const frameworkKey = resolveFrameworkAlias(framework).replace(/-/g, '_');
    const specificHwName = `${hwName}_${frameworkKey}`;

    if (specificHwName in HARDWARE_CONFIG) {
      hwName = specificHwName;
    }

    // Also check for configs with spec_decoding in the key
    if (specDecoding && specDecoding !== 'none') {
      const specKey = specDecoding.toLowerCase().replace(/-/g, '_');
      const withSpecHwName = `${hwName}_${specKey}`;
      if (withSpecHwName in HARDWARE_CONFIG) {
        hwName = withSpecHwName;
      }
    }
  }

  return hwName in HARDWARE_CONFIG ? hwName : 'unknown';
}

/**
 * Builds a hardware key from availability row fields.
 * Used by InferenceContext to match availability rows to hardware configs.
 */
export function buildAvailabilityHwKey(
  hardware: string,
  framework?: string,
  specMethod?: string,
  disagg?: boolean,
): string {
  let hwKey = hardware.split('-')[0];
  const fw = framework ? resolveFrameworkAlias(framework) : undefined;
  if (fw) {
    // Try framework as-is first, then disagg variant if it exists
    const candidateDirect = `${hwKey}_${fw}`;
    if (candidateDirect in HARDWARE_CONFIG) {
      hwKey = candidateDirect;
    } else if (disagg) {
      const candidateDisagg = `${hwKey}_${fw}-disagg`;
      hwKey = candidateDisagg in HARDWARE_CONFIG ? candidateDisagg : candidateDirect;
    } else {
      hwKey = candidateDirect;
    }
  }
  if (specMethod === 'mtp') hwKey = `${hwKey}_mtp`;
  else if (specMethod && specMethod !== 'none') hwKey = `${hwKey}_${specMethod}`;
  return hwKey;
}

/**
 * Creates a single InferenceData point from an AggDataEntry.
 * Spreads all AggDataEntry fields through automatically, then overrides
 * with chart-specific derived fields (coordinates, costs, roofline metrics).
 */
export function createChartDataPoint(
  date: string,
  entry: AggDataEntry,
  xKey: keyof AggDataEntry,
  yKey: keyof AggDataEntry,
  currentHwKey: string,
): InferenceData {
  const yValue = (entry[yKey] ?? 0) as number;
  const xValue = (entry[xKey] ?? 0) as number;
  const specs = getGpuSpecs(currentHwKey);
  const hardwarePower = specs.power;
  const tputPerGpu = entry.tput_per_gpu ?? 0;
  const outputTputPerGpu = entry.output_tput_per_gpu ?? 0;
  const inputTputPerGpu = entry.input_tput_per_gpu ?? 0;

  const tokensPerHour = (tputPerGpu * 3600) / 1000000;
  const outputTokensPerHour = (outputTputPerGpu * 3600) / 1000000;
  const inputTokensPerHour = (inputTputPerGpu * 3600) / 1000000;

  return {
    // Spread all AggDataEntry fields (raw stats, metadata, etc.)
    ...entry,

    // Chart-specific overrides
    date,
    x: xValue,
    y: yValue,
    hwKey: currentHwKey,
    tp: entry.disagg ? entry.num_prefill_gpu + entry.num_decode_gpu : entry.tp,
    image: entry.image ?? undefined,

    // Narrow boolean | string fields to boolean
    dp_attention:
      entry.dp_attention != null
        ? entry.dp_attention === true || entry.dp_attention === 'true'
        : undefined,
    prefill_dp_attention:
      entry.prefill_dp_attention != null
        ? entry.prefill_dp_attention === true || entry.prefill_dp_attention === 'true'
        : undefined,
    decode_dp_attention:
      entry.decode_dp_attention != null
        ? entry.decode_dp_attention === true || entry.decode_dp_attention === 'true'
        : undefined,
    is_multinode: entry.is_multinode != null ? !!entry.is_multinode : undefined,

    // Disagg fields: only set when active
    disagg: entry.disagg || undefined,
    num_prefill_gpu: entry.disagg ? entry.num_prefill_gpu : undefined,
    num_decode_gpu: entry.disagg ? entry.num_decode_gpu : undefined,

    // Roofline metric fields
    tpPerGpu: { y: tputPerGpu, roof: false },
    ...(outputTputPerGpu ? { outputTputPerGpu: { y: outputTputPerGpu, roof: false } } : {}),
    ...(inputTputPerGpu ? { inputTputPerGpu: { y: inputTputPerGpu, roof: false } } : {}),
    tpPerMw: { y: (tputPerGpu * 1000) / hardwarePower, roof: false },
    ...(inputTputPerGpu
      ? {
          inputTputPerMw: {
            y: hardwarePower ? (inputTputPerGpu * 1000) / hardwarePower : 0,
            roof: false,
          },
        }
      : {}),
    ...(outputTputPerGpu
      ? {
          outputTputPerMw: {
            y: hardwarePower ? (outputTputPerGpu * 1000) / hardwarePower : 0,
            roof: false,
          },
        }
      : {}),

    // Cost fields (combined throughput)
    costh: {
      y: hardwarePower && tokensPerHour ? specs.costh / tokensPerHour : 0,
      roof: false,
    },
    costn: {
      y: hardwarePower && tokensPerHour ? specs.costn / tokensPerHour : 0,
      roof: false,
    },
    costr: {
      y: hardwarePower && tokensPerHour ? specs.costr / tokensPerHour : 0,
      roof: false,
    },

    // Cost per million output tokens
    costhOutput: {
      y: hardwarePower && outputTokensPerHour ? specs.costh / outputTokensPerHour : 0,
      roof: false,
    },
    costnOutput: {
      y: hardwarePower && outputTokensPerHour ? specs.costn / outputTokensPerHour : 0,
      roof: false,
    },
    costrOutput: {
      y: hardwarePower && outputTokensPerHour ? specs.costr / outputTokensPerHour : 0,
      roof: false,
    },

    // Cost per million input tokens
    costhi: {
      y: hardwarePower && inputTokensPerHour ? specs.costh / inputTokensPerHour : 0,
      roof: false,
    },
    costni: {
      y: hardwarePower && inputTokensPerHour ? specs.costn / inputTokensPerHour : 0,
      roof: false,
    },
    costri: {
      y: hardwarePower && inputTokensPerHour ? specs.costr / inputTokensPerHour : 0,
      roof: false,
    },

    // All-in provisioned Joules per token: J/token = W/GPU / tok/s/gpu
    // hardwarePower is in kW, so multiply by 1000 to get watts
    jTotal: {
      y: hardwarePower && tputPerGpu ? (hardwarePower * 1000) / tputPerGpu : 0,
      roof: false,
    },
    ...(outputTputPerGpu
      ? {
          jOutput: {
            y: hardwarePower && outputTputPerGpu ? (hardwarePower * 1000) / outputTputPerGpu : 0,
            roof: false,
          },
        }
      : {}),
    ...(inputTputPerGpu
      ? {
          jInput: {
            y: hardwarePower && inputTputPerGpu ? (hardwarePower * 1000) / inputTputPerGpu : 0,
            roof: false,
          },
        }
      : {}),
  };
}

/**
 * Safely retrieves a nested Y-value from an InferenceData object.
 */
export const getNestedYValue = <T extends InferenceData>(point: T, key: string): number => {
  if (key.includes('.')) {
    const [mainKey, subKey] = key.split('.');
    const mainValue = point[mainKey as keyof T];
    if (typeof mainValue === 'object' && mainValue !== null && subKey in mainValue) {
      return (mainValue as Record<string, number>)[subKey] ?? 0;
    }
    return 0;
  }
  return (point[key as keyof T] as number) ?? 0;
};

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
    if (
      point.y > maxY ||
      (front.length > 0 && point.y === maxY && point.x > front[front.length - 1].x)
    ) {
      if (front.length > 0 && point.x === front[front.length - 1].x) {
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
    if (front.length > 0 && point.x === front[front.length - 1].x) {
      if (point.y > front[front.length - 1].y) {
        front[front.length - 1] = point;
      }
      continue;
    }

    while (front.length >= 1 && point.y >= front[front.length - 1].y) {
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

  const front: InferenceData[] = [];
  let minY = Infinity;

  for (const point of points) {
    if (point.y < minY) {
      front.push(point);
      minY = point.y;
    }
  }
  return front;
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

  const front: InferenceData[] = [];
  let minY = Infinity;

  for (const point of points) {
    if (point.y < minY) {
      front.push(point);
      minY = point.y;
    }
  }
  return front;
};

/**
 * Calculates the roofline for a given set of points.
 */
export const calculateRoofline = (
  points: InferenceData[],
  yKey:
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
    | `jInput.y`,
  rooflineDirection: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right',
): InferenceData[] => {
  const pointsForRoofline = points.map((p) => {
    const yValue = getNestedYValue(p, yKey);
    return { ...p, y: yValue };
  });

  switch (rooflineDirection) {
    case 'upper_right':
      return paretoFrontUpperRight(pointsForRoofline);
    case 'upper_left':
      return paretoFrontUpperLeft(pointsForRoofline);
    case 'lower_left':
      return paretoFrontLowerLeft(pointsForRoofline);
    case 'lower_right':
      return paretoFrontLowerRight(pointsForRoofline);
    default:
      return [];
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

  for (const hw in groupedData) {
    computedRooflines[hw] = {} as Record<YAxisMetric, InferenceData[]>;
    for (const chartDefYKey of Y_AXIS_METRICS) {
      const actualDataYKey = chartDef[chartDefYKey as keyof ChartDefinition];
      const rooflineDirectionKey = `${chartDefYKey}_roofline` as keyof ChartDefinition;
      const rooflineDirection = chartDef[rooflineDirectionKey] as
        | 'upper_right'
        | 'upper_left'
        | 'lower_left'
        | 'lower_right'
        | undefined;

      if (actualDataYKey && rooflineDirection) {
        computedRooflines[hw][chartDefYKey] = calculateRoofline(
          groupedData[hw],
          actualDataYKey as
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
            | `jInput.y`,
          rooflineDirection,
        );
      }
    }
  }
  return computedRooflines;
}

/**
 * Marks data points as being "on the roofline".
 */
export function markRooflinePoints(
  groupedData: Record<string, InferenceData[]>,
  computedRooflines: Record<string, Record<YAxisMetric, InferenceData[]>>,
  chartDef: ChartDefinition,
): InferenceData[] {
  const finalProcessedData: InferenceData[] = [];

  for (const hwKey in groupedData) {
    for (const point of groupedData[hwKey]) {
      const newPoint = { ...point };
      newPoint.tpPerGpu.roof = false;
      if (newPoint.outputTputPerGpu) {
        newPoint.outputTputPerGpu.roof = false;
      }
      if (newPoint.inputTputPerGpu) {
        newPoint.inputTputPerGpu.roof = false;
      }
      newPoint.tpPerMw.roof = false;
      if (newPoint.inputTputPerMw) newPoint.inputTputPerMw.roof = false;
      if (newPoint.outputTputPerMw) newPoint.outputTputPerMw.roof = false;
      newPoint.costh.roof = false;
      newPoint.costn.roof = false;
      newPoint.costr.roof = false;
      if (newPoint.costhOutput) newPoint.costhOutput.roof = false;
      if (newPoint.costnOutput) newPoint.costnOutput.roof = false;
      if (newPoint.costrOutput) newPoint.costrOutput.roof = false;
      newPoint.costhi.roof = false;
      newPoint.costni.roof = false;
      newPoint.costri.roof = false;
      if (newPoint.jTotal) newPoint.jTotal.roof = false;
      if (newPoint.jOutput) newPoint.jOutput.roof = false;
      if (newPoint.jInput) newPoint.jInput.roof = false;

      for (const chartDefYKey of Y_AXIS_METRICS) {
        const rooflinePoints = computedRooflines[hwKey]?.[chartDefYKey];
        if (!rooflinePoints) {
          continue;
        }

        const actualDataYKey = chartDef[chartDefYKey as keyof ChartDefinition];
        if (!actualDataYKey) {
          continue;
        }

        const onCurrentRoofline = rooflinePoints.some(
          (rooflinePoint) =>
            rooflinePoint.x === point.x &&
            rooflinePoint.y === getNestedYValue(point, actualDataYKey as string) &&
            rooflinePoint.hwKey === point.hwKey,
        );

        if (chartDefYKey === 'y_tpPerGpu') {
          newPoint.tpPerGpu.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_outputTputPerGpu') {
          if (newPoint.outputTputPerGpu) {
            newPoint.outputTputPerGpu.roof = onCurrentRoofline;
          }
        } else if (chartDefYKey === 'y_inputTputPerGpu') {
          if (newPoint.inputTputPerGpu) {
            newPoint.inputTputPerGpu.roof = onCurrentRoofline;
          }
        } else if (chartDefYKey === 'y_tpPerMw') {
          newPoint.tpPerMw.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_inputTputPerMw') {
          if (newPoint.inputTputPerMw) newPoint.inputTputPerMw.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_outputTputPerMw') {
          if (newPoint.outputTputPerMw) newPoint.outputTputPerMw.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costh') {
          newPoint.costh.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costn') {
          newPoint.costn.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costr') {
          newPoint.costr.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costhOutput') {
          if (newPoint.costhOutput) newPoint.costhOutput.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costnOutput') {
          if (newPoint.costnOutput) newPoint.costnOutput.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costrOutput') {
          if (newPoint.costrOutput) newPoint.costrOutput.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costhi') {
          newPoint.costhi.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costni') {
          newPoint.costni.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_costri') {
          newPoint.costri.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_jTotal') {
          if (newPoint.jTotal) newPoint.jTotal.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_jOutput') {
          if (newPoint.jOutput) newPoint.jOutput.roof = onCurrentRoofline;
        } else if (chartDefYKey === 'y_jInput') {
          if (newPoint.jInput) newPoint.jInput.roof = onCurrentRoofline;
        }
      }
      finalProcessedData.push(newPoint);
    }
  }
  return finalProcessedData;
}
