import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';
import { hasPoolSplit } from '@/lib/benchmarks/chip-basis';

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
import {
  DEFAULT_TCO_BASIS,
  getGpuSpecs,
  isKnownGpu,
  type GpuSpecs,
  type TcoBasis,
} from '@/lib/catalog/constants';
import type { Locale } from '@/lib/i18n/i18n';
import { POWER_BASIS_FIELD_KEYS, writePowerBasisChartFields } from '@/lib/power/power-basis';
import { reconstructedRoleEnergy } from '@/components/inference/utils/role-energy';

export const Y_AXIS_METRICS = ['y', ...BENCHMARK_METRIC_CONFIG_KEYS] as const;

export type YAxisMetric = (typeof Y_AXIS_METRICS)[number];

export type HardwareKeyFields = Pick<
  AggDataEntry,
  'hw' | 'framework' | 'disagg' | 'benchmark_type' | 'mtp' | 'spec_decoding'
>;

export const getHardwareKey = (entry: HardwareKeyFields): string => {
  const dash = entry.hw.indexOf('-');
  let normalizedHwName = dash === -1 ? entry.hw : entry.hw.slice(0, dash);
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
/** Requested derived metrics as a lookup, so writers test a key instead of calling back per metric. */
export type DerivedMetricRequest = Readonly<Partial<Record<DerivedMetricKey, true>>>;

export function derivedMetricRequest(keys: readonly DerivedMetricKey[]): DerivedMetricRequest {
  const request: Partial<Record<DerivedMetricKey, true>> = {};
  for (const key of keys) request[key] = true;
  return request;
}

const UNROOFED_METRIC = { y: 0, roof: false };

export function chartMetric(y: number): { y: number; roof: boolean } {
  return { ...UNROOFED_METRIC, y };
}

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
  specs?: GpuSpecs,
): Partial<DerivedChartFields>;
export function buildDerivedChartFields(
  entry: AggDataEntry,
  currentHwKey: string,
  requestedMetrics?: readonly DerivedMetricKey[],
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
  specs: GpuSpecs = getGpuSpecs(currentHwKey, tcoBasis),
): Partial<DerivedChartFields> {
  const fields: Partial<DerivedChartFields> = {};
  writeDerivedChartFields(
    fields,
    entry,
    requestedMetrics && derivedMetricRequest(requestedMetrics),
    specs,
  );
  return fields;
}

export function writeDerivedChartFields(
  fields: Partial<DerivedChartFields>,
  entry: AggDataEntry,
  request: DerivedMetricRequest | undefined,
  specs: GpuSpecs,
): void {
  writeThroughputChartFields(fields, entry, request, specs);
  let wantsMeasured = request === undefined;
  let wantsPowerBasis = request === undefined;
  if (request) {
    for (const key in request) {
      if (Object.hasOwn(MEASURED_POWER_FIELD_KEYS, key)) wantsMeasured = true;
      else if (Object.hasOwn(POWER_BASIS_FIELD_KEYS, key)) wantsPowerBasis = true;
    }
  }
  if (wantsMeasured) writeMeasuredPowerChartFields(fields, entry, specs.tdp, request);
  if (wantsPowerBasis) writePowerBasisChartFields(fields, entry, specs, request);
}

export type ThroughputChartInput = Pick<
  AggDataEntry,
  'tput_per_gpu' | 'output_tput_per_gpu' | 'input_tput_per_gpu'
>;

export function requestsPowerChartFields(requestedMetrics: readonly DerivedMetricKey[]): boolean {
  return requestedMetrics.some(
    (key) =>
      Object.hasOwn(MEASURED_POWER_FIELD_KEYS, key) || Object.hasOwn(POWER_BASIS_FIELD_KEYS, key),
  );
}

export function writeThroughputChartFields(
  fields: Partial<DerivedChartFields>,
  entry: ThroughputChartInput,
  request: DerivedMetricRequest | undefined,
  specs: GpuSpecs,
): void {
  const all = request === undefined;
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

  if (all || request.tpPerGpu) fields.tpPerGpu = chartMetric(tputPerGpu);
  if ((all || request.outputTputPerGpu) && outputTputPerGpu) {
    fields.outputTputPerGpu = chartMetric(outputTputPerGpu);
  }
  if ((all || request.inputTputPerGpu) && inputTputPerGpu) {
    fields.inputTputPerGpu = chartMetric(inputTputPerGpu);
  }
  if (all || request.tokenRevenuePerGpuHour) {
    fields.tokenRevenuePerGpuHour = chartMetric(millionTokensPerHour);
  }
  if (hardwarePower > 0 && (all || request.tpPerMw))
    fields.tpPerMw = chartMetric((tputPerGpu * 1000) / hardwarePower);
  if (hardwarePower > 0 && (all || request.inputTputPerMw) && inputTputPerGpu) {
    fields.inputTputPerMw = chartMetric(
      hardwarePower ? (inputTputPerGpu * 1000) / hardwarePower : 0,
    );
  }
  if (hardwarePower > 0 && (all || request.outputTputPerMw) && outputTputPerGpu) {
    fields.outputTputPerMw = chartMetric(
      hardwarePower ? (outputTputPerGpu * 1000) / hardwarePower : 0,
    );
  }

  if (all || request.costh) {
    fields.costh = chartMetric(millionTokensPerHour ? specs.costh / millionTokensPerHour : 0);
  }
  if (all || request.costr) {
    fields.costr = chartMetric(millionTokensPerHour ? specs.costr / millionTokensPerHour : 0);
  }
  if (all || request.costhOutput) {
    fields.costhOutput = chartMetric(
      millionOutputTokensPerHour ? specs.costh / millionOutputTokensPerHour : 0,
    );
  }
  if (all || request.costrOutput) {
    fields.costrOutput = chartMetric(
      millionOutputTokensPerHour ? specs.costr / millionOutputTokensPerHour : 0,
    );
  }
  if (all || request.costhi) {
    fields.costhi = chartMetric(
      millionInputTokensPerHour ? specs.costh / millionInputTokensPerHour : 0,
    );
  }
  if (all || request.costri) {
    fields.costri = chartMetric(
      millionInputTokensPerHour ? specs.costr / millionInputTokensPerHour : 0,
    );
  }
  if (all || request.tokensPerDollarH) {
    fields.tokensPerDollarH = chartMetric(specs.costh ? tokensPerHour / specs.costh : 0);
  }
  if (all || request.tokensPerDollarR) {
    fields.tokensPerDollarR = chartMetric(specs.costr ? tokensPerHour / specs.costr : 0);
  }
  if (all || request.outputTokensPerDollarH) {
    fields.outputTokensPerDollarH = chartMetric(
      specs.costh ? outputTokensPerHour / specs.costh : 0,
    );
  }
  if (all || request.outputTokensPerDollarR) {
    fields.outputTokensPerDollarR = chartMetric(
      specs.costr ? outputTokensPerHour / specs.costr : 0,
    );
  }
  if (all || request.inputTokensPerDollarH) {
    fields.inputTokensPerDollarH = chartMetric(specs.costh ? inputTokensPerHour / specs.costh : 0);
  }
  if (all || request.inputTokensPerDollarR) {
    fields.inputTokensPerDollarR = chartMetric(specs.costr ? inputTokensPerHour / specs.costr : 0);
  }

  if (hardwarePower > 0 && (all || request.jTotal)) {
    fields.jTotal = chartMetric(
      hardwarePower && tputPerGpu ? (hardwarePower * 1000) / tputPerGpu : 0,
    );
  }
  if (hardwarePower > 0 && (all || request.jOutput) && outputTputPerGpu) {
    fields.jOutput = chartMetric(hardwarePower ? (hardwarePower * 1000) / outputTputPerGpu : 0);
  }
  if (hardwarePower > 0 && (all || request.jInput) && inputTputPerGpu) {
    fields.jInput = chartMetric(hardwarePower ? (hardwarePower * 1000) / inputTputPerGpu : 0);
  }
}

export function deploymentChipCount(
  entry: Pick<
    AggDataEntry,
    | 'disagg'
    | 'num_prefill_gpu'
    | 'num_decode_gpu'
    | 'prefill_num_workers'
    | 'decode_num_workers'
    | 'tp'
    | 'pp'
  >,
  currentHwKey: string,
): number {
  // Legacy unsplit disaggregated rows record the whole deployment in both pool
  // fields, so only a real prefill/decode split adds the two pools.
  return hasPoolSplit(entry)
    ? entry.num_prefill_gpu + entry.num_decode_gpu
    : Math.max(
        entry.num_decode_gpu > 0
          ? entry.num_decode_gpu
          : entry.num_prefill_gpu > 0
            ? entry.num_prefill_gpu
            : 0,
        (currentHwKey === 'tpuv7' || currentHwKey.startsWith('tpuv7_')) &&
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
  specs: GpuSpecs = getGpuSpecs(currentHwKey),
): InferenceData {
  const physicalChips = deploymentChipCount(entry, currentHwKey);
  const point: Omit<InferenceData, keyof DerivedChartFields> & Partial<DerivedChartFields> = {
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
  };
  writeDerivedChartFields(point, entry, undefined, specs);
  return point as InferenceData;
}

const MEASURED_POWER_FIELD_KEYS = {
  measuredAvgPower: true,
  measuredP75Power: true,
  measuredP90Power: true,
  measuredPrefillAvgPower: true,
  measuredDecodeAvgPower: true,
  measuredJPerOutputToken: true,
  measuredJPerTotalToken: true,
  measuredJPerInputToken: true,
  measuredPrefillJPerInputToken: true,
  measuredDecodeJPerOutputToken: true,
  measuredJPerSuccessfulQuery: true,
  measuredWhPerSuccessfulQuery: true,
  measuredPowerPercentTdp: true,
  measuredPowerTimeline: true,
  reconstructedPrefillJPerOutputToken: true,
} as const;

type MeasuredPowerChartFields = Partial<
  Pick<InferenceData, keyof typeof MEASURED_POWER_FIELD_KEYS>
>;

function writeMeasuredPowerChartFields(
  fields: MeasuredPowerChartFields,
  entry: AggDataEntry,
  tdpWatts: number,
  request: DerivedMetricRequest | undefined,
): void {
  const all = request === undefined;
  if (typeof entry.avg_power_w === 'number') {
    if (all || request.measuredAvgPower) fields.measuredAvgPower = chartMetric(entry.avg_power_w);
    if (all || request.measuredPowerTimeline)
      fields.measuredPowerTimeline = chartMetric(entry.avg_power_w);
  }
  if (
    typeof entry.p75_power_w === 'number' &&
    Number.isFinite(entry.p75_power_w) &&
    (all || request.measuredP75Power)
  )
    fields.measuredP75Power = chartMetric(entry.p75_power_w);
  if (
    typeof entry.p90_power_w === 'number' &&
    Number.isFinite(entry.p90_power_w) &&
    (all || request.measuredP90Power)
  )
    fields.measuredP90Power = chartMetric(entry.p90_power_w);
  if (typeof entry.prefill_avg_power_w === 'number' && (all || request.measuredPrefillAvgPower))
    fields.measuredPrefillAvgPower = chartMetric(entry.prefill_avg_power_w);
  if (typeof entry.decode_avg_power_w === 'number' && (all || request.measuredDecodeAvgPower))
    fields.measuredDecodeAvgPower = chartMetric(entry.decode_avg_power_w);
  if (typeof entry.joules_per_output_token === 'number' && (all || request.measuredJPerOutputToken))
    fields.measuredJPerOutputToken = chartMetric(entry.joules_per_output_token);
  if (typeof entry.joules_per_total_token === 'number' && (all || request.measuredJPerTotalToken))
    fields.measuredJPerTotalToken = chartMetric(entry.joules_per_total_token);
  if (typeof entry.joules_per_input_token === 'number' && (all || request.measuredJPerInputToken))
    fields.measuredJPerInputToken = chartMetric(entry.joules_per_input_token);
  if (
    typeof entry.prefill_joules_per_input_token === 'number' &&
    (all || request.measuredPrefillJPerInputToken)
  )
    fields.measuredPrefillJPerInputToken = chartMetric(entry.prefill_joules_per_input_token);
  if (
    typeof entry.decode_joules_per_output_token === 'number' &&
    (all || request.measuredDecodeJPerOutputToken)
  )
    fields.measuredDecodeJPerOutputToken = chartMetric(entry.decode_joules_per_output_token);
  if (all || request.reconstructedPrefillJPerOutputToken) {
    const roleEnergy = reconstructedRoleEnergy(entry);
    if (roleEnergy) fields.reconstructedPrefillJPerOutputToken = chartMetric(roleEnergy.prefill);
  }
  if (typeof entry.joules_per_successful_query === 'number') {
    if (all || request.measuredJPerSuccessfulQuery)
      fields.measuredJPerSuccessfulQuery = chartMetric(entry.joules_per_successful_query);
    if (all || request.measuredWhPerSuccessfulQuery)
      fields.measuredWhPerSuccessfulQuery = chartMetric(entry.joules_per_successful_query / 3600);
  }
  if (
    typeof entry.avg_power_w === 'number' &&
    tdpWatts > 0 &&
    (all || request.measuredPowerPercentTdp)
  )
    fields.measuredPowerPercentTdp = chartMetric((entry.avg_power_w / tdpWatts) * 100);
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
