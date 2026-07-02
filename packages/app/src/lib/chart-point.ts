/**
 * Chart point creation: turns a fully-typed `AggDataEntry` into a chart-ready
 * `InferenceData` scatter point, computing every derived roofline metric.
 * Also owns the `Y_AXIS_METRICS` universe and the `getNestedYValue` accessor
 * used across the roofline code.
 *
 * Formula math is delegated to `lib/derived-metrics.ts` (do not inline it here).
 *
 * Runtime-compatible: no Node.js-specific modules (fs, path) or build-time
 * dependencies. Split out of chart-utils.ts; re-exported from there so existing
 * imports (`@/lib/chart-utils`) keep working unchanged.
 */

import type { AggDataEntry, InferenceData } from '@/lib/chart-types';
import { getGpuSpecs } from '@/lib/constants';
import {
  costPerMillionTokens,
  joulesPerToken,
  tokensPerHourInMillions,
  tokensPerMwFromPerGpu,
} from '@/lib/derived-metrics';
import { ROOFLINE_METRIC_KEYS, type RooflineMetricKey } from '@/lib/metric-registry';

/**
 * All possible Y-axis metrics for chart generation: the plain-throughput default
 * `'y'` plus every roofline-bearing metric. DERIVED from the metric registry
 * (`ROOFLINE_METRIC_KEYS`) so adding a metric there flows through here with no
 * edit — see `@/lib/metric-registry`. Measured power/energy metrics are sourced
 * from the runner's aggregate_power.py output; the rest are spec-sheet derived.
 */
export const Y_AXIS_METRICS = ['y', ...ROOFLINE_METRIC_KEYS] as const;

export type YAxisMetric = 'y' | RooflineMetricKey;

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

  const tokensPerHour = tokensPerHourInMillions(tputPerGpu);
  const outputTokensPerHour = tokensPerHourInMillions(outputTputPerGpu);
  const inputTokensPerHour = tokensPerHourInMillions(inputTputPerGpu);

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

    // Disagg fields: only set when active
    disagg: entry.disagg || undefined,
    num_prefill_gpu: entry.disagg ? entry.num_prefill_gpu : undefined,
    num_decode_gpu: entry.disagg ? entry.num_decode_gpu : undefined,

    // Roofline metric fields
    tpPerGpu: { y: tputPerGpu, roof: false },
    ...(outputTputPerGpu ? { outputTputPerGpu: { y: outputTputPerGpu, roof: false } } : {}),
    ...(inputTputPerGpu ? { inputTputPerGpu: { y: inputTputPerGpu, roof: false } } : {}),
    tpPerMw: { y: tokensPerMwFromPerGpu(tputPerGpu, hardwarePower), roof: false },
    ...(inputTputPerGpu
      ? {
          inputTputPerMw: {
            y: hardwarePower ? tokensPerMwFromPerGpu(inputTputPerGpu, hardwarePower) : 0,
            roof: false,
          },
        }
      : {}),
    ...(outputTputPerGpu
      ? {
          outputTputPerMw: {
            y: hardwarePower ? tokensPerMwFromPerGpu(outputTputPerGpu, hardwarePower) : 0,
            roof: false,
          },
        }
      : {}),

    // Cost fields (combined throughput). Guard on hardwarePower (not cost) is
    // load-bearing — see derived-metrics.ts guard note.
    costh: {
      y: hardwarePower && tokensPerHour ? costPerMillionTokens(specs.costh, tputPerGpu) : 0,
      roof: false,
    },
    costn: {
      y: hardwarePower && tokensPerHour ? costPerMillionTokens(specs.costn, tputPerGpu) : 0,
      roof: false,
    },
    costr: {
      y: hardwarePower && tokensPerHour ? costPerMillionTokens(specs.costr, tputPerGpu) : 0,
      roof: false,
    },

    // Cost per million output tokens
    costhOutput: {
      y:
        hardwarePower && outputTokensPerHour
          ? costPerMillionTokens(specs.costh, outputTputPerGpu)
          : 0,
      roof: false,
    },
    costnOutput: {
      y:
        hardwarePower && outputTokensPerHour
          ? costPerMillionTokens(specs.costn, outputTputPerGpu)
          : 0,
      roof: false,
    },
    costrOutput: {
      y:
        hardwarePower && outputTokensPerHour
          ? costPerMillionTokens(specs.costr, outputTputPerGpu)
          : 0,
      roof: false,
    },

    // Cost per million input tokens
    costhi: {
      y:
        hardwarePower && inputTokensPerHour
          ? costPerMillionTokens(specs.costh, inputTputPerGpu)
          : 0,
      roof: false,
    },
    costni: {
      y:
        hardwarePower && inputTokensPerHour
          ? costPerMillionTokens(specs.costn, inputTputPerGpu)
          : 0,
      roof: false,
    },
    costri: {
      y:
        hardwarePower && inputTokensPerHour
          ? costPerMillionTokens(specs.costr, inputTputPerGpu)
          : 0,
      roof: false,
    },

    // All-in provisioned Joules per token: J/token = W/GPU / tok/s/gpu
    // hardwarePower is in kW; joulesPerToken converts kW→W internally.
    jTotal: {
      y: hardwarePower && tputPerGpu ? joulesPerToken(hardwarePower, tputPerGpu) : 0,
      roof: false,
    },
    ...(outputTputPerGpu
      ? {
          jOutput: {
            y:
              hardwarePower && outputTputPerGpu
                ? joulesPerToken(hardwarePower, outputTputPerGpu)
                : 0,
            roof: false,
          },
        }
      : {}),
    ...(inputTputPerGpu
      ? {
          jInput: {
            y:
              hardwarePower && inputTputPerGpu ? joulesPerToken(hardwarePower, inputTputPerGpu) : 0,
            roof: false,
          },
        }
      : {}),

    // Measured power / energy from runner's aggregate_power.py. Gated on the
    // raw fields existing so points from runs predating the measurement land
    // without these keys and the chart correctly filters them out.
    ...(typeof entry.avg_power_w === 'number'
      ? { measuredAvgPower: { y: entry.avg_power_w, roof: false } }
      : {}),
    ...(typeof entry.prefill_avg_power_w === 'number'
      ? { measuredPrefillAvgPower: { y: entry.prefill_avg_power_w, roof: false } }
      : {}),
    ...(typeof entry.decode_avg_power_w === 'number'
      ? { measuredDecodeAvgPower: { y: entry.decode_avg_power_w, roof: false } }
      : {}),
    ...(typeof entry.joules_per_output_token === 'number'
      ? { measuredJPerOutputToken: { y: entry.joules_per_output_token, roof: false } }
      : {}),
    ...(typeof entry.joules_per_total_token === 'number'
      ? { measuredJPerTotalToken: { y: entry.joules_per_total_token, roof: false } }
      : {}),
    ...(typeof entry.joules_per_input_token === 'number'
      ? { measuredJPerInputToken: { y: entry.joules_per_input_token, roof: false } }
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
