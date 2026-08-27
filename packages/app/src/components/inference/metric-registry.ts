import type { ChartDefinition } from './types';
import type { TokenMetricType } from '@/lib/supplemental-benchmarks';

export type RooflineDirection = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

export interface MetricDefinition {
  field: `${string}.y`;
  label: string;
  labelZh: string;
  title: string;
  titleZh: string;
  polarity?: 'higher' | 'lower';
  x?: string;
  source?: 'custom';
  xLabel?: string;
  heading?: string;
}

export const METRIC_REGISTRY = {
  tpPerGpu: {
    field: 'tpPerGpu.y',
    label: 'Token Throughput per Chip (tok/s/chip)',
    labelZh: '每芯片 token 吞吐量（tok/s/chip）',
    title: 'Token Throughput per Chip',
    titleZh: '每芯片 token 吞吐量',
    polarity: 'higher',
  },
  inputTputPerGpu: {
    field: 'inputTputPerGpu.y',
    label: 'Input Token Throughput per Chip (tok/s/chip)',
    labelZh: '每芯片输入 token 吞吐量（tok/s/chip）',
    title: 'Input Token Throughput per Chip',
    titleZh: '每芯片输入 token 吞吐量',
    polarity: 'higher',
    x: 'p90_ttft',
    xLabel: 'P90 Time To First Token (s)',
    heading: 'vs. P90 Time To First Token',
  },
  outputTputPerGpu: {
    field: 'outputTputPerGpu.y',
    label: 'Output Token Throughput per Chip (tok/s/chip)',
    labelZh: '每芯片输出 token 吞吐量（tok/s/chip）',
    title: 'Output Token Throughput per Chip',
    titleZh: '每芯片输出 token 吞吐量',
    polarity: 'higher',
  },
  tokenRevenuePerGpuHour: {
    field: 'tokenRevenuePerGpuHour.y',
    label: 'Token Revenue per GPU Hour ($/GPU/hr)',
    labelZh: '每 GPU 小时 token 收入（$/GPU/hr）',
    title: 'Token Revenue per GPU Hour',
    titleZh: '每 GPU 小时 token 收入',
    polarity: 'higher',
  },
  tpPerMw: {
    field: 'tpPerMw.y',
    label: 'Token Throughput per All in Utility MW (tok/s/MW)',
    labelZh: '每全电源配置兆瓦 token 吞吐量（tok/s/MW）',
    title: 'Token Throughput per All in Utility MW',
    titleZh: '每全电源配置兆瓦 token 吞吐量',
    polarity: 'higher',
  },
  inputTputPerMw: {
    field: 'inputTputPerMw.y',
    label: 'Input Token Throughput per All in Utility MW (tok/s/MW)',
    labelZh: '每全电源配置兆瓦输入 token 吞吐量（tok/s/MW）',
    title: 'Input Token Throughput per All in Utility MW',
    titleZh: '每全电源配置兆瓦输入 token 吞吐量',
    polarity: 'higher',
  },
  outputTputPerMw: {
    field: 'outputTputPerMw.y',
    label: 'Output Token Throughput per All in Utility MW (tok/s/MW)',
    labelZh: '每全电源配置兆瓦输出 token 吞吐量（tok/s/MW）',
    title: 'Output Token Throughput per All in Utility MW',
    titleZh: '每全电源配置兆瓦输出 token 吞吐量',
    polarity: 'higher',
  },
  costh: {
    field: 'costh.y',
    label: 'Cost per Million Total Tokens ($)',
    labelZh: '每百万总 token 成本（$）',
    title: 'Cost per Million Total Tokens (Owning - Hyperscaler)',
    titleZh: '每百万总 token 成本（自有 - 超大规模）',
    polarity: 'lower',
  },
  costn: {
    field: 'costn.y',
    label: 'Cost per Million Total Tokens ($)',
    labelZh: '每百万总 token 成本（$）',
    title: 'Cost per Million Total Tokens (Owning - Neocloud Giant)',
    titleZh: '每百万总 token 成本（自有 - Neocloud Giant）',
    polarity: 'lower',
  },
  costr: {
    field: 'costr.y',
    label: 'Cost per Million Total Tokens ($)',
    labelZh: '每百万总 token 成本（$）',
    title: 'Cost per Million Total Tokens (3 Year Rental)',
    titleZh: '每百万总 token 成本（3 年租赁）',
    polarity: 'lower',
  },
  costhOutput: {
    field: 'costhOutput.y',
    label: 'Cost per Million Output Tokens ($)',
    labelZh: '每百万输出 token 成本（$）',
    title: 'Cost per Million Output Tokens (Owning - Hyperscaler)',
    titleZh: '每百万输出 token 成本（自有 - 超大规模）',
    polarity: 'lower',
  },
  costnOutput: {
    field: 'costnOutput.y',
    label: 'Cost per Million Output Tokens ($)',
    labelZh: '每百万输出 token 成本（$）',
    title: 'Cost per Million Output Tokens (Owning - Neocloud Giant)',
    titleZh: '每百万输出 token 成本（自有 - Neocloud Giant）',
    polarity: 'lower',
  },
  costrOutput: {
    field: 'costrOutput.y',
    label: 'Cost per Million Output Tokens ($)',
    labelZh: '每百万输出 token 成本（$）',
    title: 'Cost per Million Output Tokens (3 Year Rental)',
    titleZh: '每百万输出 token 成本（3 年租赁）',
    polarity: 'lower',
  },
  costhi: {
    field: 'costhi.y',
    label: 'Cost per Million Input Tokens ($)',
    labelZh: '每百万输入 token 成本（$）',
    title: 'Cost per Million Input Tokens (Owning - Hyperscaler)',
    titleZh: '每百万输入 token 成本（自有 - 超大规模）',
    polarity: 'lower',
  },
  costni: {
    field: 'costni.y',
    label: 'Cost per Million Input Tokens ($)',
    labelZh: '每百万输入 token 成本（$）',
    title: 'Cost per Million Input Tokens (Owning - Neocloud Giant)',
    titleZh: '每百万输入 token 成本（自有 - Neocloud Giant）',
    polarity: 'lower',
  },
  costri: {
    field: 'costri.y',
    label: 'Cost per Million Input Tokens ($)',
    labelZh: '每百万输入 token 成本（$）',
    title: 'Cost per Million Input Tokens (3 Year Rental)',
    titleZh: '每百万输入 token 成本（3 年租赁）',
    polarity: 'lower',
  },
  tokensPerDollarH: {
    field: 'tokensPerDollarH.y',
    label: 'Total Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的总 token 数（tok/$）',
    title: 'Total Tokens per $1 USD (Owning - Hyperscaler)',
    titleZh: '每 1 美元可购买的总 token 数（自有 - 超大规模）',
    polarity: 'higher',
  },
  tokensPerDollarN: {
    field: 'tokensPerDollarN.y',
    label: 'Total Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的总 token 数（tok/$）',
    title: 'Total Tokens per $1 USD (Owning - Neocloud Giant)',
    titleZh: '每 1 美元可购买的总 token 数（自有 - Neocloud Giant）',
    polarity: 'higher',
  },
  tokensPerDollarR: {
    field: 'tokensPerDollarR.y',
    label: 'Total Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的总 token 数（tok/$）',
    title: 'Total Tokens per $1 USD (3 Year Rental)',
    titleZh: '每 1 美元可购买的总 token 数（3 年租赁）',
    polarity: 'higher',
  },
  outputTokensPerDollarH: {
    field: 'outputTokensPerDollarH.y',
    label: 'Output Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的输出 token 数（tok/$）',
    title: 'Output Tokens per $1 USD (Owning - Hyperscaler)',
    titleZh: '每 1 美元可购买的输出 token 数（自有 - 超大规模）',
    polarity: 'higher',
  },
  outputTokensPerDollarN: {
    field: 'outputTokensPerDollarN.y',
    label: 'Output Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的输出 token 数（tok/$）',
    title: 'Output Tokens per $1 USD (Owning - Neocloud Giant)',
    titleZh: '每 1 美元可购买的输出 token 数（自有 - Neocloud Giant）',
    polarity: 'higher',
  },
  outputTokensPerDollarR: {
    field: 'outputTokensPerDollarR.y',
    label: 'Output Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的输出 token 数（tok/$）',
    title: 'Output Tokens per $1 USD (3 Year Rental)',
    titleZh: '每 1 美元可购买的输出 token 数（3 年租赁）',
    polarity: 'higher',
  },
  inputTokensPerDollarH: {
    field: 'inputTokensPerDollarH.y',
    label: 'Input Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的输入 token 数（tok/$）',
    title: 'Input Tokens per $1 USD (Owning - Hyperscaler)',
    titleZh: '每 1 美元可购买的输入 token 数（自有 - 超大规模）',
    polarity: 'higher',
  },
  inputTokensPerDollarN: {
    field: 'inputTokensPerDollarN.y',
    label: 'Input Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的输入 token 数（tok/$）',
    title: 'Input Tokens per $1 USD (Owning - Neocloud Giant)',
    titleZh: '每 1 美元可购买的输入 token 数（自有 - Neocloud Giant）',
    polarity: 'higher',
  },
  inputTokensPerDollarR: {
    field: 'inputTokensPerDollarR.y',
    label: 'Input Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的输入 token 数（tok/$）',
    title: 'Input Tokens per $1 USD (3 Year Rental)',
    titleZh: '每 1 美元可购买的输入 token 数（3 年租赁）',
    polarity: 'higher',
  },
  tokensPerRmbH: {
    field: 'tokensPerRmbH.y',
    label: 'Total Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的总 token 数（tok/¥）',
    title: 'Total Tokens per ¥1 RMB (Owning - Hyperscaler)',
    titleZh: '每 1 元人民币可购买的总 token 数（自有 - 超大规模）',
    polarity: 'higher',
  },
  tokensPerRmbN: {
    field: 'tokensPerRmbN.y',
    label: 'Total Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的总 token 数（tok/¥）',
    title: 'Total Tokens per ¥1 RMB (Owning - Neocloud Giant)',
    titleZh: '每 1 元人民币可购买的总 token 数（自有 - Neocloud Giant）',
    polarity: 'higher',
  },
  tokensPerRmbR: {
    field: 'tokensPerRmbR.y',
    label: 'Total Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的总 token 数（tok/¥）',
    title: 'Total Tokens per ¥1 RMB (3 Year Rental)',
    titleZh: '每 1 元人民币可购买的总 token 数（3 年租赁）',
    polarity: 'higher',
  },
  outputTokensPerRmbH: {
    field: 'outputTokensPerRmbH.y',
    label: 'Output Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的输出 token 数（tok/¥）',
    title: 'Output Tokens per ¥1 RMB (Owning - Hyperscaler)',
    titleZh: '每 1 元人民币可购买的输出 token 数（自有 - 超大规模）',
    polarity: 'higher',
  },
  outputTokensPerRmbN: {
    field: 'outputTokensPerRmbN.y',
    label: 'Output Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的输出 token 数（tok/¥）',
    title: 'Output Tokens per ¥1 RMB (Owning - Neocloud Giant)',
    titleZh: '每 1 元人民币可购买的输出 token 数（自有 - Neocloud Giant）',
    polarity: 'higher',
  },
  outputTokensPerRmbR: {
    field: 'outputTokensPerRmbR.y',
    label: 'Output Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的输出 token 数（tok/¥）',
    title: 'Output Tokens per ¥1 RMB (3 Year Rental)',
    titleZh: '每 1 元人民币可购买的输出 token 数（3 年租赁）',
    polarity: 'higher',
  },
  inputTokensPerRmbH: {
    field: 'inputTokensPerRmbH.y',
    label: 'Input Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的输入 token 数（tok/¥）',
    title: 'Input Tokens per ¥1 RMB (Owning - Hyperscaler)',
    titleZh: '每 1 元人民币可购买的输入 token 数（自有 - 超大规模）',
    polarity: 'higher',
  },
  inputTokensPerRmbN: {
    field: 'inputTokensPerRmbN.y',
    label: 'Input Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的输入 token 数（tok/¥）',
    title: 'Input Tokens per ¥1 RMB (Owning - Neocloud Giant)',
    titleZh: '每 1 元人民币可购买的输入 token 数（自有 - Neocloud Giant）',
    polarity: 'higher',
  },
  inputTokensPerRmbR: {
    field: 'inputTokensPerRmbR.y',
    label: 'Input Tokens per ¥1 RMB (tok/¥)',
    labelZh: '每 1 元人民币可购买的输入 token 数（tok/¥）',
    title: 'Input Tokens per ¥1 RMB (3 Year Rental)',
    titleZh: '每 1 元人民币可购买的输入 token 数（3 年租赁）',
    polarity: 'higher',
  },
  costUser: {
    field: 'costUser.y',
    label: 'Cost per Million Total Tokens ($)',
    labelZh: '每百万总 token 成本（$）',
    title: 'Cost per Million Total Tokens (Custom User Values)',
    titleZh: '每百万总 token 成本（自定义值）',
    polarity: 'lower',
    source: 'custom',
  },
  tokensPerDollarUser: {
    field: 'tokensPerDollarUser.y',
    label: 'Total Tokens per $1 USD (tok/$)',
    labelZh: '每 1 美元可购买的总 token 数（tok/$）',
    title: 'Total Tokens per $1 USD (Custom User Values)',
    titleZh: '每 1 美元可购买的总 token 数（自定义值）',
    polarity: 'higher',
    source: 'custom',
  },
  powerUser: {
    field: 'powerUser.y',
    label: 'Token Throughput per All in Utility MW (tok/s/MW)',
    labelZh: '每全电源配置兆瓦 token 吞吐量（tok/s/MW）',
    title: 'Token Throughput per All in Utility MW (Custom User Values)',
    titleZh: '每全电源配置兆瓦 token 吞吐量（自定义值）',
    polarity: 'higher',
    source: 'custom',
  },
  jTotal: {
    field: 'jTotal.y',
    label: 'All-in Provisioned J per Total Token (J/tok)',
    labelZh: '每总 token 全电源配置能耗（J/tok）',
    title: 'All-in Provisioned Joules per Total Token',
    titleZh: '每总 token 全电源配置焦耳能耗',
    polarity: 'lower',
  },
  jOutput: {
    field: 'jOutput.y',
    label: 'All-in Provisioned J per Output Token (J/tok)',
    labelZh: '每输出 token 全电源配置能耗（J/tok）',
    title: 'All-in Provisioned Joules per Output Token',
    titleZh: '每输出 token 全电源配置焦耳能耗',
    polarity: 'lower',
  },
  jInput: {
    field: 'jInput.y',
    label: 'All-in Provisioned J per Input Token (J/tok)',
    labelZh: '每输入 token 全电源配置能耗（J/tok）',
    title: 'All-in Provisioned Joules per Input Token',
    titleZh: '每输入 token 全电源配置焦耳能耗',
    polarity: 'lower',
  },
  measuredAvgPower: {
    field: 'measuredAvgPower.y',
    label: 'Measured Avg Power per Chip (W)',
    labelZh: '每芯片实测平均功耗（W）',
    title: 'Measured Average Power per Chip',
    titleZh: '每芯片实测平均功耗',
    polarity: 'lower',
  },
  measuredPrefillAvgPower: {
    field: 'measuredPrefillAvgPower.y',
    label: 'Measured Prefill Power per Chip (W)',
    labelZh: '每芯片实测 Prefill 功耗（W）',
    title: 'Measured Prefill Power per Chip',
    titleZh: '每芯片实测 Prefill 功耗',
    polarity: 'lower',
  },
  measuredDecodeAvgPower: {
    field: 'measuredDecodeAvgPower.y',
    label: 'Measured Decode Power per Chip (W)',
    labelZh: '每芯片实测 Decode 功耗（W）',
    title: 'Measured Decode Power per Chip',
    titleZh: '每芯片实测 Decode 功耗',
    polarity: 'lower',
  },
  measuredJPerOutputToken: {
    field: 'measuredJPerOutputToken.y',
    label: 'Measured J per Output Token (J/tok)',
    labelZh: '每输出 token 实测能耗（J/tok）',
    title: 'Measured Joules per Output Token',
    titleZh: '每输出 token 实测焦耳能耗',
    polarity: 'lower',
  },
  measuredJPerInputToken: {
    field: 'measuredJPerInputToken.y',
    label: 'Measured J per Input Token (J/tok)',
    labelZh: '每输入 token 实测能耗（J/tok）',
    title: 'Measured Joules per Input Token',
    titleZh: '每输入 token 实测焦耳能耗',
    polarity: 'lower',
  },
  measuredJPerTotalToken: {
    field: 'measuredJPerTotalToken.y',
    label: 'Measured J per Token (J/tok)',
    labelZh: '每 token 实测能耗（J/tok）',
    title: 'Measured Joules per Token (incl. prompt)',
    titleZh: '每 token 实测焦耳能耗（含提示词）',
    polarity: 'lower',
  },
  measuredJPerSuccessfulQuery: {
    field: 'measuredJPerSuccessfulQuery.y',
    label: 'Measured J per Successful Query (J/query)',
    labelZh: '每次成功请求实测能耗（J/query）',
    title: 'Measured Joules per Successful Query',
    titleZh: '每次成功请求实测焦耳能耗',
    polarity: 'lower',
  },
  measuredWhPerSuccessfulQuery: {
    field: 'measuredWhPerSuccessfulQuery.y',
    label: 'Measured Wh per Successful Query (Wh/query)',
    labelZh: '每次成功请求实测能耗（Wh/query）',
    title: 'Measured Watt-hours per Successful Query',
    titleZh: '每次成功请求实测瓦时能耗',
    polarity: 'lower',
  },
  measuredPowerPercentTdp: {
    field: 'measuredPowerPercentTdp.y',
    label: 'Measured Average Power (% TDP)',
    labelZh: '实测平均功耗（TDP 占比）',
    title: 'Measured Average Power as Percent of TDP',
    titleZh: '实测平均功耗占 TDP 百分比',
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRIC_REGISTRY;
export type MetricConfigKey = `y_${MetricKey}`;
export type CustomMetricKey = {
  [Key in MetricKey]: (typeof METRIC_REGISTRY)[Key] extends { source: 'custom' } ? Key : never;
}[MetricKey];
export type BenchmarkMetricKey = Exclude<MetricKey, CustomMetricKey>;
export type BenchmarkMetricConfigKey = `y_${BenchmarkMetricKey}`;

export const DEFAULT_METRIC_CONFIG_KEY = 'y_tokensPerDollarN' satisfies MetricConfigKey;

export function isMetricKey(metricKey: string): metricKey is MetricKey {
  return Object.hasOwn(METRIC_REGISTRY, metricKey);
}

export function isBenchmarkMetricKey(metricKey: string): metricKey is BenchmarkMetricKey {
  return isMetricKey(metricKey) && !('source' in METRIC_REGISTRY[metricKey]);
}

/** Token basis represented by a y-axis option. Non-output metrics deliberately
 * resolve to total/input so output-only snapshots cannot leak into them. */
export function tokenMetricTypeForConfigKey(metric: string): TokenMetricType {
  const normalized = metric.toLowerCase();
  if (normalized.includes('output')) return 'output';
  if (normalized.includes('input') || /cost[hnr]i$/u.test(normalized)) return 'input';
  return 'total';
}

/**
 * Resolve persisted metric state to a canonical config key.
 *
 * `y` was the original chart field for total throughput and remains a
 * read-only share-link alias. Unknown persisted values fall back rather than
 * escaping the registry and reaching chart/data lookups unchecked.
 */
export function resolveMetricConfigKey(
  metricConfigKey: string | null | undefined,
  fallback?: string,
): MetricConfigKey {
  if (metricConfigKey === 'y') return 'y_tpPerGpu';
  if (metricConfigKey?.startsWith('y_')) {
    const metricKey = metricConfigKey.slice(2);
    if (isMetricKey(metricKey)) return metricConfigKey as MetricConfigKey;
  }

  if (fallback === 'y') return 'y_tpPerGpu';
  if (fallback?.startsWith('y_')) {
    const fallbackMetricKey = fallback.slice(2);
    if (isMetricKey(fallbackMetricKey)) return fallback as MetricConfigKey;
  }

  return DEFAULT_METRIC_CONFIG_KEY;
}

export const METRIC_CONFIG_KEYS = Object.keys(METRIC_REGISTRY).map(
  (key) => `y_${key}` as MetricConfigKey,
);
export const BENCHMARK_METRIC_CONFIG_KEYS = METRIC_CONFIG_KEYS.filter(
  (configKey): configKey is BenchmarkMetricConfigKey => isBenchmarkMetricKey(configKey.slice(2)),
);

export interface MetricControlGroup {
  label: string;
  labelZh: string;
  metrics: readonly MetricConfigKey[];
  gated?: boolean;
}

/**
 * The nine runner-telemetry y-axes in the "Measured Energy" control group.
 * Exported (and referenced by the group below, so the two cannot drift) for
 * consumers that treat measured axes specially — the legacy-power point ring,
 * tooltip tier line, and footer legend key.
 */
export const MEASURED_ENERGY_METRIC_CONFIG_KEYS = [
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredAvgPower',
  'y_measuredJPerInputToken',
  'y_measuredJPerOutputToken',
  'y_measuredJPerTotalToken',
  'y_measuredJPerSuccessfulQuery',
  'y_measuredWhPerSuccessfulQuery',
  'y_measuredPowerPercentTdp',
] as const satisfies readonly MetricConfigKey[];

const MEASURED_ENERGY_METRIC_CONFIG_KEY_SET: ReadonlySet<string> = new Set(
  MEASURED_ENERGY_METRIC_CONFIG_KEYS,
);

/** Whether a y-axis config key plots one of the Measured Energy metrics. */
export function isMeasuredEnergyConfigKey(configKey: string): boolean {
  return MEASURED_ENERGY_METRIC_CONFIG_KEY_SET.has(configKey);
}

export const METRIC_CONTROL_GROUPS: readonly MetricControlGroup[] = [
  {
    label: 'Throughput',
    labelZh: '吞吐量',
    metrics: [
      'y_tpPerGpu',
      'y_inputTputPerGpu',
      'y_outputTputPerGpu',
      'y_tpPerMw',
      'y_inputTputPerMw',
      'y_outputTputPerMw',
    ],
  },
  {
    label: 'Token Revenue per GPU Hour',
    labelZh: '每 GPU 小时 token 收入',
    metrics: ['y_tokenRevenuePerGpuHour'],
  },
  {
    label: 'Total Tokens per $1 USD',
    labelZh: '每 1 美元可购买的总 token 数',
    metrics: ['y_tokensPerDollarH', 'y_tokensPerDollarN', 'y_tokensPerDollarR'],
  },
  {
    label: 'Total Tokens per ¥1 CNY',
    labelZh: '每 1 元人民币可购买的总 token 数',
    metrics: ['y_tokensPerRmbH', 'y_tokensPerRmbN', 'y_tokensPerRmbR'],
  },
  {
    label: 'Output Tokens per $1 USD',
    labelZh: '每 1 美元可购买的输出 token 数',
    metrics: ['y_outputTokensPerDollarH', 'y_outputTokensPerDollarN', 'y_outputTokensPerDollarR'],
  },
  {
    label: 'Output Tokens per ¥1 CNY',
    labelZh: '每 1 元人民币可购买的输出 token 数',
    metrics: ['y_outputTokensPerRmbH', 'y_outputTokensPerRmbN', 'y_outputTokensPerRmbR'],
  },
  {
    label: 'Input Tokens per $1 USD',
    labelZh: '每 1 美元可购买的输入 token 数',
    metrics: ['y_inputTokensPerDollarH', 'y_inputTokensPerDollarN', 'y_inputTokensPerDollarR'],
  },
  {
    label: 'Input Tokens per ¥1 CNY',
    labelZh: '每 1 元人民币可购买的输入 token 数',
    metrics: ['y_inputTokensPerRmbH', 'y_inputTokensPerRmbN', 'y_inputTokensPerRmbR'],
  },
  {
    label: 'Cost per Million Total Tokens',
    labelZh: '每百万总 token 成本',
    metrics: ['y_costh', 'y_costn', 'y_costr'],
  },
  {
    label: 'Cost per Million Output Tokens',
    labelZh: '每百万输出 token 成本',
    metrics: ['y_costhOutput', 'y_costnOutput', 'y_costrOutput'],
  },
  {
    label: 'Cost per Million Input Tokens',
    labelZh: '每百万输入 token 成本',
    metrics: ['y_costhi', 'y_costni', 'y_costri'],
  },
  {
    label: 'All-in Provisioned Energy per Token',
    labelZh: '每 token 全电源配置能耗',
    metrics: ['y_jTotal', 'y_jOutput', 'y_jInput'],
  },
  {
    label: 'Measured Energy',
    labelZh: '实测能耗',
    metrics: MEASURED_ENERGY_METRIC_CONFIG_KEYS,
  },
  {
    label: 'Custom User Values',
    labelZh: '自定义值',
    metrics: ['y_tokensPerDollarUser', 'y_costUser', 'y_powerUser'],
  },
];

function rooflineDirection(
  chartType: 'interactivity' | 'e2e',
  polarity: 'higher' | 'lower',
): RooflineDirection {
  if (chartType === 'interactivity') return polarity === 'higher' ? 'upper_left' : 'lower_right';
  return polarity === 'higher' ? 'upper_right' : 'lower_left';
}

function buildChartDefinition(chartType: 'interactivity' | 'e2e'): ChartDefinition {
  const definition: ChartDefinition = {
    chartType,
    heading: chartType === 'interactivity' ? 'vs. Interactivity' : 'vs. End-to-end Latency',
    x: chartType === 'interactivity' ? 'median_intvty' : 'median_e2el',
    x_label:
      chartType === 'interactivity' ? 'Interactivity (tok/s/user)' : 'End-to-end Latency (s)',
    y: 'tput_per_gpu',
    y_cost_limit: 5,
    y_latency_limit: 60,
  };

  for (const [key, metric] of Object.entries(METRIC_REGISTRY) as [
    MetricKey,
    (typeof METRIC_REGISTRY)[MetricKey],
  ][]) {
    const configKey = `y_${key}`;
    definition[configKey] = metric.field;
    definition[`${configKey}_label`] = metric.label;
    definition[`${configKey}_labelZh`] = metric.labelZh;
    definition[`${configKey}_title`] = metric.title;
    definition[`${configKey}_titleZh`] = metric.titleZh;
    if ('polarity' in metric && metric.polarity) {
      definition[`${configKey}_roofline`] = rooflineDirection(chartType, metric.polarity);
    }
    if ('x' in metric) definition[`${configKey}_x`] = metric.x;
    if ('xLabel' in metric) definition[`${configKey}_x_label`] = metric.xLabel;
    if ('heading' in metric && chartType === 'interactivity') {
      definition[`${configKey}_heading`] = metric.heading;
    }
  }

  return definition;
}

export const chartDefinitions = [
  buildChartDefinition('interactivity'),
  buildChartDefinition('e2e'),
] satisfies ChartDefinition[];

export default chartDefinitions;
