import type { InferenceData } from '../types';
import type { MeasuredComparison, MeasuredMetricFamily } from '../measured-metric-config';
import { scatterPointConfigId } from './point-identity';

export interface ComparisonSource {
  point: InferenceData;
  overlayIndex?: number;
}
export interface ComparisonMetric {
  key: string;
  label: string;
  labelZh: string;
  value: (point: InferenceData) => number | undefined;
  dash: string;
}
export interface ComparisonPanel {
  key: string;
  label: string;
  labelZh: string;
  unit: string;
  metrics: ComparisonMetric[];
}
export interface ComparisonPoint extends ComparisonSource {
  x: number;
  y: number;
  seriesKey: string;
  metric: ComparisonMetric;
  relative?: { baseline: number; comparator: number };
}
export interface ComparisonSeries {
  key: string;
  hwKey: string;
  precision: string;
  date: string;
  overlayIndex?: number;
  metric: ComparisonMetric;
  points: ComparisonPoint[];
}
export function comparisonSourceKey({ point, overlayIndex }: ComparisonSource): string {
  return `${scatterPointConfigId({ ...point, conc: 0 })}|${point.date}|${point.run_url ?? ''}|${overlayIndex ?? 'official'}`;
}

export function comparisonSourceOptions(sources: ComparisonSource[]) {
  return [...new Map(sources.map((source) => [comparisonSourceKey(source), source])).entries()].map(
    ([key, source]) => ({ key, ...source }),
  );
}
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Schema 2 aggregate energy has the same numerator for input and output tokens. */
export function reconstructedRoleEnergy(point: Partial<InferenceData>) {
  if (!point.disagg || point.power_valid !== 1 || point.power_metric_schema_version !== 2)
    return undefined;
  const input = point.joules_per_input_token;
  const output = point.joules_per_output_token;
  const prefill = point.prefill_joules_per_input_token;
  const decode = point.decode_joules_per_output_token;
  if (![input, output, prefill, decode].every(positive)) return undefined;
  const contribution = prefill! * (output! / input!);
  const total = contribution + decode!;
  if (!positive(contribution) || !positive(total)) return undefined;
  return {
    prefill: contribution,
    decode: decode!,
    total,
    prefillShare: (100 * contribution) / total,
  };
}

function chartMetric(
  key: keyof InferenceData,
  label: string,
  labelZh: string,
  dash = '',
): ComparisonMetric {
  return {
    key,
    label,
    labelZh,
    dash,
    value: (point) => {
      const value = point[key];
      return typeof value === 'object' && value !== null && 'y' in value && positive(value.y)
        ? value.y
        : undefined;
    },
  };
}
const boundaryPower = [
  chartMetric('measuredAvgPower', 'GPU measured', 'GPU 实测'),
  chartMetric('powerxGpuProvisionedWatts', 'GPU provisioned (TDP)', 'GPU 额定（TDP）', '8,4'),
  chartMetric('powerxUtilityProvisionedWatts', 'All-in utility provisioned', '全设施额定', '3,3'),
  chartMetric('powerxUtilityModeledWatts', 'All-in utility modeled', '全设施模型估算', '10,3,2,3'),
];
const boundaryEnergy = [
  chartMetric('measuredJPerOutputToken', 'GPU measured', 'GPU 实测'),
  chartMetric('powerxGpuProvisionedEnergy', 'GPU provisioned (TDP)', 'GPU 额定（TDP）', '8,4'),
  chartMetric('powerxUtilityProvisionedEnergy', 'All-in utility provisioned', '全设施额定', '3,3'),
  chartMetric('powerxUtilityModeledEnergy', 'All-in utility modeled', '全设施模型估算', '10,3,2,3'),
];
const relativePanel: ComparisonPanel = {
  key: 'relative',
  label: 'Comparator relative to baseline at matched service points',
  labelZh: '相同服务水平下，对比配置相对基准的变化',
  unit: '%',
  metrics: [
    {
      ...boundaryPower[0],
      key: 'relativePower',
      label: 'Board power increase (+)',
      labelZh: '板级功耗增加（+）',
    },
    {
      key: 'relativeThroughput',
      label: 'Output throughput gain (+)',
      labelZh: '输出吞吐量提升（+）',
      value: comparisonOutputThroughput,
      dash: '8,4',
    },
    {
      ...boundaryEnergy[0],
      key: 'relativeEnergy',
      label: 'Energy reduction (+)',
      labelZh: '能耗降低（+）',
      dash: '3,3',
    },
  ],
};

/** Matching concurrency does not hold service speed constant across hardware. */
export function relativeComparisonSeries(
  sources: ComparisonSource[],
  xField: string,
  baselineKey: string,
  comparatorKey: string,
  target?: number,
): ComparisonSeries[] {
  if (!baselineKey || !comparatorKey || baselineKey === comparatorKey) return [];
  const curves = comparisonSeries(sources, relativePanel, xField);
  return relativePanel.metrics.flatMap((metric) => {
    const baseline = curves.find((curve) => curve.key === `${metric.key}|${baselineKey}`);
    const comparator = curves.find((curve) => curve.key === `${metric.key}|${comparatorKey}`);
    if (!baseline || !comparator) return [];
    const lower = Math.max(baseline.points[0].x, comparator.points[0].x);
    const upper = Math.min(baseline.points.at(-1)!.x, comparator.points.at(-1)!.x);
    if (lower > upper) return [];
    const coordinates = [
      ...new Set([
        ...baseline.points.map((point) => point.x),
        ...comparator.points.map((point) => point.x),
        ...(target === undefined ? [] : [target]),
      ]),
    ]
      .filter((x) => x >= lower && x <= upper)
      .sort((a, b) => a - b);
    const points = coordinates.map((x): ComparisonPoint => {
      const a = comparisonValueAtX(baseline.points, x);
      const b = comparisonValueAtX(comparator.points, x);
      const valid = positive(a) && positive(b);
      return {
        ...comparator.points[0],
        x,
        y: valid ? 100 * (metric.key === 'relativeEnergy' ? (a - b) / a : (b - a) / a) : NaN,
        relative: valid ? { baseline: a, comparator: b } : undefined,
      };
    });
    return points.some((point) => Number.isFinite(point.y)) ? [{ ...comparator, points }] : [];
  });
}
export function measuredComparisonPanels(
  mode: Exclude<MeasuredComparison, 'single'>,
  family: MeasuredMetricFamily,
): ComparisonPanel[] {
  if (mode === 'relative') return [relativePanel];
  if (mode === 'boundaries') {
    const power = {
      key: 'boundaries-power',
      label: 'Power boundaries',
      labelZh: '功耗口径对比',
      unit: 'W/GPU',
      metrics: boundaryPower,
    };
    const energy = {
      key: 'boundaries-energy',
      label: 'Energy boundaries',
      labelZh: '能耗口径对比',
      unit: 'J/output token',
      metrics: boundaryEnergy,
    };
    return family === 'power' ? [power, energy] : [energy, power];
  }
  const power = {
    key: 'role-power',
    label: 'Prefill and decode power',
    labelZh: 'Prefill 与 decode 功耗',
    unit: 'W/GPU',
    metrics: [
      chartMetric('measuredPrefillAvgPower', 'Prefill', 'Prefill', '6,4'),
      chartMetric('measuredDecodeAvgPower', 'Decode', 'Decode'),
    ],
  };
  if (mode === 'roles')
    return [
      power,
      {
        key: 'role-local-energy',
        label: 'Role-local energy',
        labelZh: '各阶段能耗',
        unit: 'J/token',
        metrics: [
          chartMetric(
            'measuredPrefillJPerInputToken',
            'Prefill · J/input token',
            'Prefill · J/input token',
            '6,4',
          ),
          chartMetric(
            'measuredDecodeJPerOutputToken',
            'Decode · J/output token',
            'Decode · J/output token',
          ),
        ],
      },
    ];
  const reconstructed = (
    key: 'prefill' | 'decode' | 'total' | 'prefillShare',
    label: string,
    labelZh: string,
    dash = '',
  ): ComparisonMetric => ({
    key,
    label,
    labelZh,
    dash,
    value: (point) => reconstructedRoleEnergy(point)?.[key],
  });
  const contributions = {
    key: 'request-energy',
    label: 'Complete-request energy contributions',
    labelZh: '完整请求的能耗构成',
    unit: 'J/output token',
    metrics: [
      reconstructed('prefill', 'Prefill contribution', 'Prefill 能耗贡献', '6,4'),
      reconstructed('decode', 'Decode contribution', 'Decode 能耗贡献'),
      reconstructed('total', 'Complete-request total', '完整请求总能耗', '3,3'),
    ],
  };
  return [
    power,
    {
      key: 'prefill-share',
      label: 'Prefill share of reconstructed energy',
      labelZh: '重建总能耗中 prefill 的占比',
      unit: '%',
      metrics: [reconstructed('prefillShare', 'Prefill share', 'Prefill 占比')],
    },
    contributions,
  ];
}

export function comparisonSeries(
  sources: ComparisonSource[],
  panel: ComparisonPanel,
  xField: string,
): ComparisonSeries[] {
  const groups = new Map<string, ComparisonSeries>();
  for (const source of sources) {
    const { point } = source;
    const x =
      xField === 'outputThroughputAllGpus'
        ? comparisonOutputThroughput(point)
        : point[xField as keyof InferenceData];
    if (!positive(x)) continue;
    for (const metric of panel.metrics) {
      const y = metric.value(point);

      const key = `${metric.key}|${comparisonSourceKey(source)}`;
      let series = groups.get(key);
      if (!series) {
        series = {
          key,
          hwKey: String(point.hwKey),
          precision: point.precision,
          date: point.date,
          overlayIndex: source.overlayIndex,
          metric,
          points: [],
        };
        groups.set(key, series);
      }
      series.points.push({ ...source, x, y: y ?? NaN, seriesKey: key, metric });
    }
  }
  return [...groups.values()]
    .filter((series) => series.points.some((point) => Number.isFinite(point.y)))
    .map((series) => ({ ...series, points: series.points.toSorted((a, b) => a.x - b.x) }));
}

/** Missing or ambiguous source points cannot establish an ISO comparison. */
export function comparisonValueAtX(
  points: readonly { x: number; y: number }[],
  x: number,
): number | undefined {
  const exact = points.filter((point) => point.x === x);
  if (exact.length > 0)
    return Number.isFinite(exact[0].y) && exact.every((point) => point.y === exact[0].y)
      ? exact[0].y
      : undefined;
  const right = points.findIndex((point) => point.x > x);
  if (right <= 0) return undefined;
  const a = points[right - 1],
    b = points[right];
  if (!Number.isFinite(a.y) || !Number.isFinite(b.y)) return undefined;
  if (
    points.some((point, index) => index !== right - 1 && point.x === a.x && point.y !== a.y) ||
    points.some((point, index) => index !== right && point.x === b.x && point.y !== b.y)
  )
    return undefined;
  return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
}

/** Multiple panels must not inflate the reported measurement coverage. */
export function measuredComparisonRows(series: readonly ComparisonSeries[]): InferenceData[] {
  const rows = new Map<string, InferenceData>();
  for (const curve of series) {
    if (!curve.metric.key.startsWith('measured')) continue;
    for (const sample of curve.points) {
      if (!Number.isFinite(sample.y)) continue;
      const point = sample.point;
      const key = `${sample.overlayIndex ?? 'official'}|${scatterPointConfigId(point)}|${point.date}|${point.id ?? ''}|${point.run_url ?? ''}`;
      rows.set(key, point);
    }
  }
  return [...rows.values()];
}

export function comparisonOutputThroughput(point: Partial<InferenceData>): number | undefined {
  const throughput = point.output_tput_per_gpu;
  if (!positive(throughput)) return undefined;
  if (!point.disagg || point.benchmark_type === 'agentic_traces') return throughput;
  const prefill = point.num_prefill_gpu,
    decode = point.num_decode_gpu;
  if (
    point.benchmark_type !== 'single_turn' ||
    !positive(prefill) ||
    !positive(decode) ||
    !Number.isSafeInteger(prefill) ||
    !Number.isSafeInteger(decode)
  )
    return undefined;
  return (throughput * decode) / (prefill + decode);
}
