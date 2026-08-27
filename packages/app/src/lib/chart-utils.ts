/**
 * Runtime-compatible chart utility functions.
 * These functions can be used in API routes and client-side code.
 * They do NOT import Node.js-specific modules (fs, path) or build-time dependencies.
 */

import { resolveFrameworkAlias, USD_TO_CNY } from '@semianalysisai/inferencex-constants';
import iwanthue from 'iwanthue';

import type {
  AggDataEntry,
  ChartDefinition,
  InferenceData,
  YAxisMetricKey,
} from '@/components/inference/types';
import {
  BENCHMARK_METRIC_CONFIG_KEYS,
  type BenchmarkMetricKey,
} from '@/components/inference/metric-registry';
import { getGpuSpecs, isKnownGpu } from '@/lib/constants';
import { getVendor, type Vendor } from '@/lib/dynamic-colors';
import type { Locale } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// High-contrast color generation (iwanthue — k-means in CIELab)
// ---------------------------------------------------------------------------

/**
 * Banned hue test per vendor (CIELab hue angle, 0-360).
 * In Lab space: 0° = red, 90° = yellow, 180° = green, 270° = blue.
 * NVIDIA must not be red/rose/pink (wraps around 0°: 320–40°).
 * AMD must not be green (roughly 120–195°).
 */
const BANNED_HUE_TEST: Record<Vendor, ((hue: number) => boolean) | null> = {
  nvidia: (hue) => hue >= 320 || hue <= 40, // red/rose/pink zone
  amd: (hue) => hue >= 120 && hue <= 195, // green zone
  teacup: (hue) => hue < 170 || hue > 300, // keep the blue/cyan zone
  unknown: null,
};

/**
 * Preferred hue ranges (CIELab) — used when a vendor has few items so they
 * cluster in the brand-appropriate zone. NVIDIA = greens, AMD = reds/oranges.
 */
const PREFERRED_ZONE: Record<
  Vendor,
  { hmin: number; hmax: number; cmin?: number; lmin?: number } | null
> = {
  nvidia: { hmin: 100, hmax: 195 }, // greens/teals
  amd: { hmin: 20, hmax: 50, cmin: 70, lmin: 50 }, // vivid reds/oranges
  teacup: { hmin: 190, hmax: 280 }, // cyans/blues
  unknown: null,
};

/** Max items that fit distinctly in the preferred zone before we open up. */
const PREFERRED_MAX = 4;

/** Beyond this count per vendor, drop the hue ban entirely for best spacing. */
const BAN_MAX = 10;

/**
 * Palette cache. iwanthue's force-vector clustering costs tens of
 * milliseconds per call (quality 50 × 5 attempts) and shows up as main-thread
 * time on every render that recomputes high-contrast colors. The output is
 * fully deterministic (seeded RNG) and — crucially — independent of the key
 * *names*: a vendor group's palette depends only on the item count, vendor
 * zone/ban mode, theme seed, and lightness bounds. Identical requests across
 * renders, charts, and tabs therefore share one entry. Key space is tiny
 * (vendors × themes × counts × 3 modes), so no eviction is needed.
 */
const PALETTE_CACHE = new Map<string, string[]>();

/**
 * Generates high-contrast colors using iwanthue (k-means in CIELab space).
 *
 * Tiered strategy per vendor (only when >1 vendor is present):
 *   ≤ PREFERRED_MAX → constrain to brand zone (NVIDIA=green, AMD=red)
 *   ≤ BAN_MAX       → full wheel minus rival's brand color
 *   > BAN_MAX       → full wheel, no restrictions, best spacing wins
 *
 * Single-vendor case (e.g. an all-NVIDIA agentic comparison of B200/B300 ×
 * vLLM/SGLang): the brand zone and rival-ban exist to keep vendors apart at a
 * glance, but with one vendor there's no rival — clamping every series into the
 * same narrow hue band just collapses the contrast HC is supposed to maximize.
 * So skip both restrictions and use the full wheel, giving the series the widest
 * possible separation.
 */
export const generateHighContrastColors = (
  keys: string[],
  theme: string,
  vendorKeyFor?: (key: string) => string,
): Record<string, string> => {
  if (keys.length === 0) return {};

  const colors: Record<string, string> = {};
  const [lmin, lmax] = theme === 'dark' || theme === 'minecraft' ? [50, 100] : [30, 65];

  // Group keys by vendor. When vendorKeyFor is provided, vendor is derived
  // from the mapped key (e.g. a hwKey) so callers can output colors keyed by
  // a display identifier (e.g. configLabel) while still getting vendor-aware
  // preferred-zone and banned-hue logic.
  const groups = new Map<Vendor, string[]>();
  for (const key of keys) {
    const vendor = getVendor(vendorKeyFor ? vendorKeyFor(key) : key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  // Brand-zone / rival-ban only serve to keep DIFFERENT vendors apart. With a
  // single vendor present there's nothing to separate from, so those
  // restrictions only shrink the usable hue range and kill contrast — open the
  // full wheel instead (the common all-NVIDIA agentic comparison case).
  const multiVendor = groups.size > 1;

  for (const [vendor, vendorKeys] of groups) {
    const count = vendorKeys.length;
    const isBanned = BANNED_HUE_TEST[vendor] ?? null;
    const preferred = PREFERRED_ZONE[vendor] ?? null;

    // Tier 1: few items → brand zone only
    // Tier 2: moderate  → full wheel minus rival color
    // Tier 3: many      → full wheel, no restrictions
    const usePreferred = multiVendor && preferred && count <= PREFERRED_MAX;
    const useBan = multiVendor && !usePreferred && isBanned && count <= BAN_MAX;

    // Everything iwanthue's output depends on (the ban filter and preferred
    // zone are functions of vendor; the seed is vendor+theme).
    const mode = usePreferred ? 'pref' : useBan ? 'ban' : 'open';
    const cacheKey = `${vendor}|${theme}|${count}|${mode}|${lmin}|${lmax}`;

    let palette = PALETTE_CACHE.get(cacheKey);
    if (!palette) {
      palette = iwanthue(count, {
        colorSpace: usePreferred
          ? {
              hmin: preferred.hmin,
              hmax: preferred.hmax,
              cmin: preferred.cmin ?? 30,
              cmax: 100,
              lmin: Math.max(lmin, preferred.lmin ?? 0),
              lmax,
            }
          : { hmin: 0, hmax: 360, cmin: 30, cmax: 100, lmin, lmax },
        ...(useBan &&
          isBanned && {
            colorFilter: (_rgb: [number, number, number], lab: [number, number, number]) => {
              // Enforce lightness bounds — force-vector can drift outside colorSpace
              if (lab[0] < lmin || lab[0] > lmax) return false;
              const hue = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
              return !isBanned(hue);
            },
          }),
        seed: `${vendor}-${theme}`,
        clustering: 'force-vector',
        quality: 50,
        attempts: 5,
      });
      PALETTE_CACHE.set(cacheKey, palette);
    }

    vendorKeys.sort();
    vendorKeys.forEach((key, i) => {
      colors[key] = palette[i];
    });
  }
  return colors;
};

/**
 * Metrics backed by the benchmark transform. Custom user metrics are derived
 * later from user-entered costs/power and are excluded by the registry.
 */
export const Y_AXIS_METRICS = ['y', ...BENCHMARK_METRIC_CONFIG_KEYS] as const;

export type YAxisMetric = (typeof Y_AXIS_METRICS)[number];

/**
 * Determines the chart-series hardware key.
 *
 * Fixed-sequence curves keep speculative decoding in their identity. Agentic
 * curves deliberately do not: one production curve may choose a speculative
 * method for some load points and standard decoding for others. The point
 * still carries `spec_decoding` for filters, tooltips, and point-level keys.
 */
export const getHardwareKey = (entry: AggDataEntry): string => {
  let normalizedHwName = entry.hw.split('-')[0];
  if (entry.framework) {
    // Resolve legacy/aliased framework names (e.g. atom-disagg → mooncake-atom) so chart
    // point keys match the canonical keys built by buildAvailabilityHwKey for the GPU filter.
    const fw = resolveFrameworkAlias(entry.framework);
    // Try framework as-is first, then disagg variant if it exists
    const candidateDirect = `${normalizedHwName}_${fw}`;
    if (isKnownGpu(candidateDirect)) {
      normalizedHwName = candidateDirect;
    } else if (entry.disagg) {
      const candidateDisagg = `${normalizedHwName}_${fw}-disagg`;
      normalizedHwName = isKnownGpu(candidateDisagg) ? candidateDisagg : candidateDirect;
    } else {
      normalizedHwName = candidateDirect;
    }
  }
  if (entry.benchmark_type !== 'agentic_traces') {
    if (entry.mtp === 'on' || entry['spec_decoding'] === 'mtp') {
      normalizedHwName = `${normalizedHwName}_mtp`;
    } else if (entry['spec_decoding'] && entry['spec_decoding'] !== 'none') {
      normalizedHwName = `${normalizedHwName}_${entry['spec_decoding']}`;
    }
  }
  return normalizedHwName;
};

/**
 * Normalizes a hardware key from evaluation/reliability data entries.
 * Handles the looser naming conventions in eval data (e.g. "B200 NB", "H200 CW")
 * by stripping qualifiers and building a normalized hardware key.
 */
export function normalizeEvalHardwareKey(
  hw: string,
  framework?: string,
  specDecoding?: string,
): string {
  let hwName = hw.toLowerCase().replaceAll('-', '_');

  // Strip additional qualifiers not relevant to GPU identification
  // e.g., "b200 nb" -> "b200", "h200 cw" -> "h200"
  hwName = hwName.replace(/\s+(?:nb|cw|nv|dgxc|amds|cr|amd)$/iu, '');

  // Try to find a more specific hardware config that includes framework
  if (framework) {
    const frameworkKey = resolveFrameworkAlias(framework).replaceAll('-', '_');
    const specificHwName = `${hwName}_${frameworkKey}`;

    if (isKnownGpu(specificHwName)) {
      hwName = specificHwName;
    }

    // Also check for configs with spec_decoding in the key
    if (specDecoding && specDecoding !== 'none') {
      const specKey = specDecoding.toLowerCase().replaceAll('-', '_');
      const withSpecHwName = `${hwName}_${specKey}`;
      if (isKnownGpu(withSpecHwName)) {
        hwName = withSpecHwName;
      }
    }
  }

  return isKnownGpu(hwName) ? hwName : 'unknown';
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
  benchmarkType?: string,
): string {
  let hwKey = hardware.split('-')[0];
  const fw = framework ? resolveFrameworkAlias(framework) : undefined;
  if (fw) {
    // Try framework as-is first, then disagg variant if it exists
    const candidateDirect = `${hwKey}_${fw}`;
    if (isKnownGpu(candidateDirect)) {
      hwKey = candidateDirect;
    } else if (disagg) {
      const candidateDisagg = `${hwKey}_${fw}-disagg`;
      hwKey = isKnownGpu(candidateDisagg) ? candidateDisagg : candidateDirect;
    } else {
      hwKey = candidateDirect;
    }
  }
  if (benchmarkType !== 'agentic_traces') {
    if (specMethod === 'mtp') hwKey = `${hwKey}_mtp`;
    else if (specMethod && specMethod !== 'none') hwKey = `${hwKey}_${specMethod}`;
  }
  return hwKey;
}

export type DerivedMetricKey = BenchmarkMetricKey;
export type DerivedChartFields = Pick<InferenceData, DerivedMetricKey>;

const chartMetric = (y: number): { y: number; roof: boolean } => ({ y, roof: false });

/**
 * Builds benchmark-derived metric fields. Passing `requestedMetrics` keeps
 * lightweight consumers lightweight while sharing the exact formulas used by
 * full inference points.
 */
export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
): DerivedChartFields;
export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
  requestedMetrics: readonly DerivedMetricKey[],
): Partial<DerivedChartFields>;
export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
  requestedMetrics?: readonly DerivedMetricKey[],
): Partial<DerivedChartFields> {
  const requested = requestedMetrics ? new Set<DerivedMetricKey>(requestedMetrics) : null;
  const wants = (key: DerivedMetricKey) => requested === null || requested.has(key);
  const specs = getGpuSpecs(currentHwKey);
  const hardwarePower = specs.power;
  const tputPerGpu = entry.tput_per_gpu ?? 0;
  const outputTputPerGpu = entry.output_tput_per_gpu ?? 0;
  const inputTputPerGpu = entry.input_tput_per_gpu ?? 0;
  const tokensPerHour = tputPerGpu * 3600;
  const outputTokensPerHour = outputTputPerGpu * 3600;
  const inputTokensPerHour = inputTputPerGpu * 3600;
  const millionTokensPerHour = tokensPerHour / 1_000_000;
  const millionOutputTokensPerHour = outputTokensPerHour / 1_000_000;
  const millionInputTokensPerHour = inputTokensPerHour / 1_000_000;
  const fields: Partial<DerivedChartFields> = {};

  if (wants('tpPerGpu')) fields.tpPerGpu = chartMetric(tputPerGpu);
  if (wants('outputTputPerGpu') && outputTputPerGpu) {
    fields.outputTputPerGpu = chartMetric(outputTputPerGpu);
  }
  if (wants('inputTputPerGpu') && inputTputPerGpu) {
    fields.inputTputPerGpu = chartMetric(inputTputPerGpu);
  }
  if (wants('tokenRevenuePerGpuHour')) {
    // At $1 per million total tokens, million tokens per GPU hour is
    // numerically equal to gross token revenue in $/GPU/hr.
    fields.tokenRevenuePerGpuHour = chartMetric(millionTokensPerHour);
  }
  if (wants('tpPerMw')) fields.tpPerMw = chartMetric((tputPerGpu * 1000) / hardwarePower);
  if (wants('inputTputPerMw') && inputTputPerGpu) {
    fields.inputTputPerMw = chartMetric(
      hardwarePower ? (inputTputPerGpu * 1000) / hardwarePower : 0,
    );
  }
  if (wants('outputTputPerMw') && outputTputPerGpu) {
    fields.outputTputPerMw = chartMetric(
      hardwarePower ? (outputTputPerGpu * 1000) / hardwarePower : 0,
    );
  }

  if (wants('costh')) {
    fields.costh = chartMetric(
      hardwarePower && millionTokensPerHour ? specs.costh / millionTokensPerHour : 0,
    );
  }
  if (wants('costn')) {
    fields.costn = chartMetric(
      hardwarePower && millionTokensPerHour ? specs.costn / millionTokensPerHour : 0,
    );
  }
  if (wants('costr')) {
    fields.costr = chartMetric(
      hardwarePower && millionTokensPerHour ? specs.costr / millionTokensPerHour : 0,
    );
  }
  if (wants('costhOutput')) {
    fields.costhOutput = chartMetric(
      hardwarePower && millionOutputTokensPerHour ? specs.costh / millionOutputTokensPerHour : 0,
    );
  }
  if (wants('costnOutput')) {
    fields.costnOutput = chartMetric(
      hardwarePower && millionOutputTokensPerHour ? specs.costn / millionOutputTokensPerHour : 0,
    );
  }
  if (wants('costrOutput')) {
    fields.costrOutput = chartMetric(
      hardwarePower && millionOutputTokensPerHour ? specs.costr / millionOutputTokensPerHour : 0,
    );
  }
  if (wants('costhi')) {
    fields.costhi = chartMetric(
      hardwarePower && millionInputTokensPerHour ? specs.costh / millionInputTokensPerHour : 0,
    );
  }
  if (wants('costni')) {
    fields.costni = chartMetric(
      hardwarePower && millionInputTokensPerHour ? specs.costn / millionInputTokensPerHour : 0,
    );
  }
  if (wants('costri')) {
    fields.costri = chartMetric(
      hardwarePower && millionInputTokensPerHour ? specs.costr / millionInputTokensPerHour : 0,
    );
  }

  if (wants('tokensPerDollarH')) {
    fields.tokensPerDollarH = chartMetric(specs.costh ? tokensPerHour / specs.costh : 0);
  }
  if (wants('tokensPerDollarN')) {
    fields.tokensPerDollarN = chartMetric(specs.costn ? tokensPerHour / specs.costn : 0);
  }
  if (wants('tokensPerDollarR')) {
    fields.tokensPerDollarR = chartMetric(specs.costr ? tokensPerHour / specs.costr : 0);
  }
  if (wants('outputTokensPerDollarH')) {
    fields.outputTokensPerDollarH = chartMetric(
      specs.costh ? outputTokensPerHour / specs.costh : 0,
    );
  }
  if (wants('outputTokensPerDollarN')) {
    fields.outputTokensPerDollarN = chartMetric(
      specs.costn ? outputTokensPerHour / specs.costn : 0,
    );
  }
  if (wants('outputTokensPerDollarR')) {
    fields.outputTokensPerDollarR = chartMetric(
      specs.costr ? outputTokensPerHour / specs.costr : 0,
    );
  }
  if (wants('inputTokensPerDollarH')) {
    fields.inputTokensPerDollarH = chartMetric(specs.costh ? inputTokensPerHour / specs.costh : 0);
  }
  if (wants('inputTokensPerDollarN')) {
    fields.inputTokensPerDollarN = chartMetric(specs.costn ? inputTokensPerHour / specs.costn : 0);
  }
  if (wants('inputTokensPerDollarR')) {
    fields.inputTokensPerDollarR = chartMetric(specs.costr ? inputTokensPerHour / specs.costr : 0);
  }

  if (wants('tokensPerRmbH')) {
    fields.tokensPerRmbH = chartMetric(
      specs.costh ? tokensPerHour / (specs.costh * USD_TO_CNY) : 0,
    );
  }
  if (wants('tokensPerRmbN')) {
    fields.tokensPerRmbN = chartMetric(
      specs.costn ? tokensPerHour / (specs.costn * USD_TO_CNY) : 0,
    );
  }
  if (wants('tokensPerRmbR')) {
    fields.tokensPerRmbR = chartMetric(
      specs.costr ? tokensPerHour / (specs.costr * USD_TO_CNY) : 0,
    );
  }
  if (wants('outputTokensPerRmbH')) {
    fields.outputTokensPerRmbH = chartMetric(
      specs.costh ? outputTokensPerHour / (specs.costh * USD_TO_CNY) : 0,
    );
  }
  if (wants('outputTokensPerRmbN')) {
    fields.outputTokensPerRmbN = chartMetric(
      specs.costn ? outputTokensPerHour / (specs.costn * USD_TO_CNY) : 0,
    );
  }
  if (wants('outputTokensPerRmbR')) {
    fields.outputTokensPerRmbR = chartMetric(
      specs.costr ? outputTokensPerHour / (specs.costr * USD_TO_CNY) : 0,
    );
  }
  if (wants('inputTokensPerRmbH')) {
    fields.inputTokensPerRmbH = chartMetric(
      specs.costh ? inputTokensPerHour / (specs.costh * USD_TO_CNY) : 0,
    );
  }
  if (wants('inputTokensPerRmbN')) {
    fields.inputTokensPerRmbN = chartMetric(
      specs.costn ? inputTokensPerHour / (specs.costn * USD_TO_CNY) : 0,
    );
  }
  if (wants('inputTokensPerRmbR')) {
    fields.inputTokensPerRmbR = chartMetric(
      specs.costr ? inputTokensPerHour / (specs.costr * USD_TO_CNY) : 0,
    );
  }

  if (wants('jTotal')) {
    fields.jTotal = chartMetric(
      hardwarePower && tputPerGpu ? (hardwarePower * 1000) / tputPerGpu : 0,
    );
  }
  if (wants('jOutput') && outputTputPerGpu) {
    fields.jOutput = chartMetric(hardwarePower ? (hardwarePower * 1000) / outputTputPerGpu : 0);
  }
  if (wants('jInput') && inputTputPerGpu) {
    fields.jInput = chartMetric(hardwarePower ? (hardwarePower * 1000) / inputTputPerGpu : 0);
  }

  const measured = buildMeasuredPowerChartFields(entry, specs.tdp);
  for (const [key, value] of Object.entries(measured) as [
    keyof MeasuredPowerChartFields,
    { y: number; roof: boolean },
  ][]) {
    if (wants(key)) fields[key] = value;
  }

  return fields;
}

/**
 * Creates a single InferenceData point from an AggDataEntry.
 * Spreads all AggDataEntry fields through automatically, then overrides
 * with chart-specific coordinates and canonical derived fields.
 */
export function createChartDataPoint(
  date: string,
  entry: AggDataEntry,
  xKey: keyof AggDataEntry,
  yKey: keyof AggDataEntry,
  currentHwKey: string,
  derivedFields: DerivedChartFields = buildDerivedChartFields(entry, currentHwKey),
): InferenceData {
  return {
    ...entry,
    date,
    x: (entry[xKey] ?? 0) as number,
    y: (entry[yKey] ?? 0) as number,
    hwKey: currentHwKey,
    tp: entry.disagg
      ? entry.num_prefill_gpu + entry.num_decode_gpu
      : entry.tp * (entry.pp && entry.pp > 1 ? entry.pp : 1),
    image: entry.image ?? undefined,
    dp_attention:
      entry.dp_attention !== null && entry.dp_attention !== undefined
        ? entry.dp_attention === true || entry.dp_attention === 'true'
        : undefined,
    prefill_dp_attention:
      entry.prefill_dp_attention !== null && entry.prefill_dp_attention !== undefined
        ? entry.prefill_dp_attention === true || entry.prefill_dp_attention === 'true'
        : undefined,
    decode_dp_attention:
      entry.decode_dp_attention !== null && entry.decode_dp_attention !== undefined
        ? entry.decode_dp_attention === true || entry.decode_dp_attention === 'true'
        : undefined,
    is_multinode:
      entry.is_multinode !== null && entry.is_multinode !== undefined
        ? Boolean(entry.is_multinode)
        : undefined,
    disagg: entry.disagg || undefined,
    num_prefill_gpu: entry.disagg ? entry.num_prefill_gpu : undefined,
    num_decode_gpu: entry.disagg ? entry.num_decode_gpu : undefined,
    ...derivedFields,
  };
}

type MeasuredPowerChartFields = Partial<
  Pick<
    InferenceData,
    | 'measuredAvgPower'
    | 'measuredPrefillAvgPower'
    | 'measuredDecodeAvgPower'
    | 'measuredJPerOutputToken'
    | 'measuredJPerTotalToken'
    | 'measuredJPerInputToken'
    | 'measuredJPerSuccessfulQuery'
    | 'measuredWhPerSuccessfulQuery'
    | 'measuredPowerPercentTdp'
  >
>;

/** Builds optional runner-telemetry fields for the canonical derived builder. */
function buildMeasuredPowerChartFields(
  entry: AggDataEntry,
  tdpWatts: number,
): MeasuredPowerChartFields {
  return {
    ...(typeof entry.avg_power_w === 'number'
      ? { measuredAvgPower: chartMetric(entry.avg_power_w) }
      : {}),
    ...(typeof entry.prefill_avg_power_w === 'number'
      ? { measuredPrefillAvgPower: chartMetric(entry.prefill_avg_power_w) }
      : {}),
    ...(typeof entry.decode_avg_power_w === 'number'
      ? { measuredDecodeAvgPower: chartMetric(entry.decode_avg_power_w) }
      : {}),
    ...(typeof entry.joules_per_output_token === 'number'
      ? { measuredJPerOutputToken: chartMetric(entry.joules_per_output_token) }
      : {}),
    ...(typeof entry.joules_per_total_token === 'number'
      ? { measuredJPerTotalToken: chartMetric(entry.joules_per_total_token) }
      : {}),
    ...(typeof entry.joules_per_input_token === 'number'
      ? { measuredJPerInputToken: chartMetric(entry.joules_per_input_token) }
      : {}),
    ...(typeof entry.joules_per_successful_query === 'number'
      ? {
          measuredJPerSuccessfulQuery: chartMetric(entry.joules_per_successful_query),
          measuredWhPerSuccessfulQuery: chartMetric(entry.joules_per_successful_query / 3600),
        }
      : {}),
    ...(typeof entry.avg_power_w === 'number' && tdpWatts > 0
      ? { measuredPowerPercentTdp: chartMetric((entry.avg_power_w / tdpWatts) * 100) }
      : {}),
  };
}
/**
 * Remaps a chart-ready point onto a resolved metric and x-axis field. Official
 * and overlay pipelines share this coordinate step while retaining separate
 * clipping and frontier policies.
 */
export function remapInferencePoint(
  point: InferenceData,
  metricKey: YAxisMetricKey,
  xAxisField: keyof AggDataEntry,
): InferenceData {
  const metric = point[metricKey];
  const xCandidate = (point as Partial<AggDataEntry>)[xAxisField];
  return {
    ...point,
    x: typeof xCandidate === 'number' ? xCandidate : point.x,
    y: metric?.y ?? point.y,
    roof: metric?.roof ?? false,
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
 * Whether a point may sit on the Pareto frontier / "optimal" set. Points with a
 * non-positive or non-finite x (e.g. interactivity = 0 when ITL is missing/zero,
 * or a 0/negative latency) are degenerate — no real config runs there — so they
 * must never be marked optimal. Apply this to a frontier function's INPUT; the
 * points still render in the show-all view, they just lose roofline eligibility.
 * NOTE: filter at the call site, not inside the paretoFront* functions — those are
 * kept 1:1 with the calculator's Python port (iso_interactivity.py).
 */
export const isFrontierEligible = (p: { x: number }): boolean => Number.isFinite(p.x) && p.x > 0;

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

const PARETO_BY_DIRECTION = {
  upper_right: paretoFrontUpperRight,
  upper_left: paretoFrontUpperLeft,
  lower_left: paretoFrontLowerLeft,
  lower_right: paretoFrontLowerRight,
} as const;

export type ParetoDirection = keyof typeof PARETO_BY_DIRECTION;

/** Look up the Pareto frontier function for a roofline direction. */
export const paretoFrontForDirection = (
  dir: ParetoDirection,
): ((points: InferenceData[]) => InferenceData[]) => PARETO_BY_DIRECTION[dir];

// ---------------------------------------------------------------------------
// Locale-aware metric label/title helpers
// ---------------------------------------------------------------------------

export function metricTitle(chartDef: ChartDefinition, metricKey: string, locale: Locale): string {
  if (locale === 'zh') {
    const zh = chartDef[`${metricKey}_titleZh`];
    if (typeof zh === 'string' && zh) return zh;
  }
  return (chartDef[`${metricKey}_title`] as string) || '';
}

export function metricLabel(chartDef: ChartDefinition, metricKey: string, locale: Locale): string {
  if (locale === 'zh') {
    const zh = chartDef[`${metricKey}_labelZh`];
    if (typeof zh === 'string' && zh) return zh;
  }
  return (chartDef[`${metricKey}_label`] as string) || '';
}
