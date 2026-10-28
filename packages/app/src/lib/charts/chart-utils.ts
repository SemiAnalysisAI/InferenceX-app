import {
  GOOGLE_BLUE,
  HUAWEI_CHART_COLORS,
  HUAWEI_CHART_PALETTE,
  resolveFrameworkAlias,
} from '@semianalysisai/inferencex-constants';
import iwanthue from 'iwanthue';
import { chartPaletteTheme, isDarkTheme } from '@/lib/themes/themes';

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
import { DEFAULT_TCO_BASIS, getGpuSpecs, isKnownGpu, type TcoBasis } from '@/lib/catalog/constants';
import { getVendor, type Vendor } from '@/lib/charts/dynamic-colors';
import type { Locale } from '@/lib/i18n/i18n';
import { buildPowerBasisChartFields, type PowerBasisChartFields } from '@/lib/power/power-basis';
import { reconstructedRoleEnergy } from '@/components/inference/utils/role-energy';

const BANNED_HUE_TEST: Record<Vendor, ((hue: number) => boolean) | null> = {
  nvidia: (hue) => hue >= 320 || hue <= 40,
  amd: (hue) => hue >= 120 && hue <= 195,
  openai: (hue) => hue < 290 || hue > 350,
  google: (hue) => hue < 255 || hue > 300,
  huawei: null,
  unknown: null,
};

const PREFERRED_ZONE: Record<
  Vendor,
  { hmin: number; hmax: number; cmin?: number; lmin?: number } | null
> = {
  nvidia: { hmin: 100, hmax: 195 },
  amd: { hmin: 20, hmax: 50, cmin: 70, lmin: 50 },
  openai: { hmin: 300, hmax: 340 },
  google: { hmin: 265, hmax: 295 },
  huawei: HUAWEI_CHART_PALETTE.lab,
  unknown: null,
};

const PREFERRED_MAX = 4;

const BAN_MAX = 10;

const PALETTE_CACHE = new Map<string, string[]>();

export const generateHighContrastColors = (
  keys: string[],
  theme: string,
  vendorKeyFor?: (key: string) => string,
): Record<string, string> => {
  if (keys.length === 0) return {};
  theme = chartPaletteTheme(theme);

  const colors: Record<string, string> = {};
  const [lmin, lmax] = isDarkTheme(theme) ? [50, 100] : [30, 65];

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

  const multiVendor = groups.size > 1;
  const reserveHuawei = groups.has('huawei');

  for (const [vendor, vendorKeys] of groups) {
    const count = vendorKeys.length;
    if (vendor === 'huawei' && count === 1) {
      colors[vendorKeys[0]] = HUAWEI_CHART_COLORS[isDarkTheme(theme) ? 'dark' : 'light'];
      continue;
    }
    if (vendor === 'google' && count === 1) {
      colors[vendorKeys[0]] = GOOGLE_BLUE;
      continue;
    }
    const isBanned = BANNED_HUE_TEST[vendor] ?? null;
    const preferred = PREFERRED_ZONE[vendor] ?? null;

    const usePreferred =
      preferred && ((multiVendor && count <= PREFERRED_MAX) || vendor === 'huawei');
    const useBan = multiVendor && !usePreferred && isBanned && count <= BAN_MAX;

    const excludeAmber = reserveHuawei && vendor !== 'huawei';
    const mode = usePreferred ? 'pref' : useBan ? 'ban' : 'open';
    const cacheKey = `${vendor}|${theme}|${count}|${mode}|${lmin}|${lmax}|${excludeAmber}`;

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
        ...((useBan || excludeAmber) && {
          colorFilter: (_rgb: [number, number, number], lab: [number, number, number]) => {
            if (lab[0] < lmin || lab[0] > lmax) return false;
            const hue = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
            return (
              !(useBan && isBanned?.(hue)) &&
              !(
                excludeAmber &&
                hue >= HUAWEI_CHART_PALETTE.reservedLab.hmin &&
                hue <= HUAWEI_CHART_PALETTE.reservedLab.hmax
              )
            );
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

export const Y_AXIS_METRICS = ['y', ...BENCHMARK_METRIC_CONFIG_KEYS] as const;

export type YAxisMetric = (typeof Y_AXIS_METRICS)[number];

export const getHardwareKey = (entry: AggDataEntry): string => {
  let normalizedHwName = entry.hw.split('-')[0];
  if (entry.framework) {
    const fw = resolveFrameworkAlias(entry.framework);
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

export function normalizeEvalHardwareKey(
  hw: string,
  framework?: string,
  specDecoding?: string,
): string {
  let hwName = hw.toLowerCase().replaceAll('-', '_');

  hwName = hwName.replace(/\s+(?:nb|cw|nv|dgxc|amds|cr|amd)$/iu, '');

  if (framework) {
    const frameworkKey = resolveFrameworkAlias(framework).replaceAll('-', '_');
    const specificHwName = `${hwName}_${frameworkKey}`;

    if (isKnownGpu(specificHwName)) {
      hwName = specificHwName;
    }

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

export type DerivedMetricKey = BenchmarkMetricKey | 'reconstructedPrefillJPerOutputToken';
export type DerivedChartFields = Pick<InferenceData, DerivedMetricKey>;

const chartMetric = (y: number): { y: number; roof: boolean } => ({ y, roof: false });

export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
  requestedMetrics?: undefined,
  tcoBasis?: TcoBasis,
): DerivedChartFields;
export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
  requestedMetrics: readonly DerivedMetricKey[],
  tcoBasis?: TcoBasis,
): Partial<DerivedChartFields>;
export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
  requestedMetrics?: readonly DerivedMetricKey[],
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
): Partial<DerivedChartFields> {
  const requested = requestedMetrics ? new Set<DerivedMetricKey>(requestedMetrics) : null;
  const wants = (key: DerivedMetricKey) => requested === null || requested.has(key);
  const specs = getGpuSpecs(currentHwKey, tcoBasis);
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
    fields.tokenRevenuePerGpuHour = chartMetric(millionTokensPerHour);
  }
  if (hardwarePower > 0 && wants('tpPerMw'))
    fields.tpPerMw = chartMetric((tputPerGpu * 1000) / hardwarePower);
  if (hardwarePower > 0 && wants('inputTputPerMw') && inputTputPerGpu) {
    fields.inputTputPerMw = chartMetric(
      hardwarePower ? (inputTputPerGpu * 1000) / hardwarePower : 0,
    );
  }
  if (hardwarePower > 0 && wants('outputTputPerMw') && outputTputPerGpu) {
    fields.outputTputPerMw = chartMetric(
      hardwarePower ? (outputTputPerGpu * 1000) / hardwarePower : 0,
    );
  }

  if (wants('costh')) {
    fields.costh = chartMetric(millionTokensPerHour ? specs.costh / millionTokensPerHour : 0);
  }
  if (wants('costr')) {
    fields.costr = chartMetric(millionTokensPerHour ? specs.costr / millionTokensPerHour : 0);
  }
  if (wants('costhOutput')) {
    fields.costhOutput = chartMetric(
      millionOutputTokensPerHour ? specs.costh / millionOutputTokensPerHour : 0,
    );
  }
  if (wants('costrOutput')) {
    fields.costrOutput = chartMetric(
      millionOutputTokensPerHour ? specs.costr / millionOutputTokensPerHour : 0,
    );
  }
  if (wants('costhi')) {
    fields.costhi = chartMetric(
      millionInputTokensPerHour ? specs.costh / millionInputTokensPerHour : 0,
    );
  }
  if (wants('costri')) {
    fields.costri = chartMetric(
      millionInputTokensPerHour ? specs.costr / millionInputTokensPerHour : 0,
    );
  }
  if (wants('tokensPerDollarH')) {
    fields.tokensPerDollarH = chartMetric(specs.costh ? tokensPerHour / specs.costh : 0);
  }
  if (wants('tokensPerDollarR')) {
    fields.tokensPerDollarR = chartMetric(specs.costr ? tokensPerHour / specs.costr : 0);
  }
  if (wants('outputTokensPerDollarH')) {
    fields.outputTokensPerDollarH = chartMetric(
      specs.costh ? outputTokensPerHour / specs.costh : 0,
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
  if (wants('inputTokensPerDollarR')) {
    fields.inputTokensPerDollarR = chartMetric(specs.costr ? inputTokensPerHour / specs.costr : 0);
  }

  if (hardwarePower > 0 && wants('jTotal')) {
    fields.jTotal = chartMetric(
      hardwarePower && tputPerGpu ? (hardwarePower * 1000) / tputPerGpu : 0,
    );
  }
  if (hardwarePower > 0 && wants('jOutput') && outputTputPerGpu) {
    fields.jOutput = chartMetric(hardwarePower ? (hardwarePower * 1000) / outputTputPerGpu : 0);
  }
  if (hardwarePower > 0 && wants('jInput') && inputTputPerGpu) {
    fields.jInput = chartMetric(hardwarePower ? (hardwarePower * 1000) / inputTputPerGpu : 0);
  }

  const measured = buildMeasuredPowerChartFields(entry, specs.tdp);
  for (const [key, value] of Object.entries(measured) as [
    keyof MeasuredPowerChartFields,
    { y: number; roof: boolean },
  ][]) {
    if (wants(key)) fields[key] = value;
  }

  const powerBasis = buildPowerBasisChartFields(entry, specs);
  for (const [key, value] of Object.entries(powerBasis) as [
    keyof PowerBasisChartFields,
    { y: number; roof: boolean },
  ][]) {
    if (wants(key)) fields[key] = value;
  }

  return fields;
}

export function deploymentChipCount(
  entry: Pick<AggDataEntry, 'disagg' | 'num_prefill_gpu' | 'num_decode_gpu' | 'tp' | 'pp'>,
  currentHwKey: string,
): number {
  return entry.disagg
    ? entry.num_prefill_gpu + entry.num_decode_gpu
    : Math.max(
        entry.num_decode_gpu > 0
          ? entry.num_decode_gpu
          : entry.num_prefill_gpu > 0
            ? entry.num_prefill_gpu
            : 0,
        currentHwKey.split('_')[0] === 'tpuv7' &&
          (entry.num_decode_gpu > 0 || entry.num_prefill_gpu > 0)
          ? 0
          : entry.tp * (entry.pp && entry.pp > 1 ? entry.pp : 1),
      );
}

export function createChartDataPoint(
  date: string,
  entry: AggDataEntry,
  xKey: keyof AggDataEntry,
  yKey: keyof AggDataEntry,
  currentHwKey: string,
  derivedFields: DerivedChartFields = buildDerivedChartFields(entry, currentHwKey),
): InferenceData {
  const physicalChips = deploymentChipCount(entry, currentHwKey);
  return {
    ...entry,
    date,
    x: (entry[xKey] ?? 0) as number,
    y: (entry[yKey] ?? 0) as number,
    hwKey: currentHwKey,
    tp: physicalChips,
    physicalChips,
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
    | 'measuredP75Power'
    | 'measuredP90Power'
    | 'measuredPrefillAvgPower'
    | 'measuredDecodeAvgPower'
    | 'measuredJPerOutputToken'
    | 'measuredJPerTotalToken'
    | 'measuredJPerInputToken'
    | 'measuredPrefillJPerInputToken'
    | 'measuredDecodeJPerOutputToken'
    | 'measuredJPerSuccessfulQuery'
    | 'measuredWhPerSuccessfulQuery'
    | 'measuredPowerPercentTdp'
    | 'measuredPowerTimeline'
    | 'reconstructedPrefillJPerOutputToken'
  >
>;

function buildMeasuredPowerChartFields(
  entry: AggDataEntry,
  tdpWatts: number,
): MeasuredPowerChartFields {
  const roleEnergy = reconstructedRoleEnergy(entry);
  return {
    ...(typeof entry.avg_power_w === 'number'
      ? {
          measuredAvgPower: chartMetric(entry.avg_power_w),
          measuredPowerTimeline: chartMetric(entry.avg_power_w),
        }
      : {}),
    ...(typeof entry.p75_power_w === 'number' && Number.isFinite(entry.p75_power_w)
      ? { measuredP75Power: chartMetric(entry.p75_power_w) }
      : {}),
    ...(typeof entry.p90_power_w === 'number' && Number.isFinite(entry.p90_power_w)
      ? { measuredP90Power: chartMetric(entry.p90_power_w) }
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
    ...(typeof entry.prefill_joules_per_input_token === 'number'
      ? { measuredPrefillJPerInputToken: chartMetric(entry.prefill_joules_per_input_token) }
      : {}),
    ...(typeof entry.decode_joules_per_output_token === 'number'
      ? { measuredDecodeJPerOutputToken: chartMetric(entry.decode_joules_per_output_token) }
      : {}),
    ...(roleEnergy ? { reconstructedPrefillJPerOutputToken: chartMetric(roleEnergy.prefill) } : {}),
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
export function remapInferencePoint(
  point: InferenceData,
  metricKey: YAxisMetricKey,
  xAxisField: keyof AggDataEntry,
): InferenceData {
  const metric = point[metricKey];
  const xCandidate = (point as Partial<AggDataEntry>)[xAxisField];
  const requiresMeasuredValue =
    xAxisField.endsWith('_ttft') || xAxisField === 'mean_e2el' || xAxisField === 'mean_tpot_intvty';
  const missingMeasuredValue =
    requiresMeasuredValue &&
    (typeof xCandidate !== 'number' || !Number.isFinite(xCandidate) || xCandidate <= 0);
  return {
    ...point,
    x: missingMeasuredValue ? NaN : typeof xCandidate === 'number' ? xCandidate : point.x,
    y: metric?.y ?? point.y,
    roof: metric?.roof ?? false,
  };
}

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

export const isFrontierEligible = (p: { x: number }): boolean => Number.isFinite(p.x) && p.x > 0;

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

export const paretoFrontForDirection = (
  dir: ParetoDirection,
): ((points: InferenceData[]) => InferenceData[]) => PARETO_BY_DIRECTION[dir];

export const paretoMaximizesX = (dir: ParetoDirection): boolean =>
  dir === 'upper_left' || dir === 'lower_right';

export function metricTitle(chartDef: ChartDefinition, metricKey: string, locale: Locale): string {
  if (locale === 'zh') {
    const zh = chartDef[`${metricKey}_titleZh`];
    if (typeof zh === 'string' && zh) return zh;
  }
  return (chartDef[`${metricKey}_title`] as string) || '';
}

export function metricChartTitle(
  chartDef: ChartDefinition,
  metricKey: string,
  locale: Locale,
): string {
  if (locale === 'zh') {
    const zh = chartDef[`${metricKey}_chartTitleZh`];
    if (typeof zh === 'string' && zh) return zh;
  }
  return (
    (chartDef[`${metricKey}_chartTitle`] as string) || metricTitle(chartDef, metricKey, locale)
  );
}

export function metricLabel(chartDef: ChartDefinition, metricKey: string, locale: Locale): string {
  if (locale === 'zh') {
    const zh = chartDef[`${metricKey}_labelZh`];
    if (typeof zh === 'string' && zh) return zh;
  }
  return (chartDef[`${metricKey}_label`] as string) || '';
}

export function xAxisLabel(chartDef: ChartDefinition, locale: Locale): string {
  return locale === 'zh' && chartDef.x_labelZh ? chartDef.x_labelZh : chartDef.x_label;
}
