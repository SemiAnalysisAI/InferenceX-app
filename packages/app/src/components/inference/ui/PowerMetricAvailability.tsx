'use client';

import { useMemo } from 'react';
import { useInferenceData, useInferenceFilters } from '../InferenceContext';
import {
  isMeasuredEnergyConfigKey,
  isPowerBasisConfigKey,
  metricOptionTitle,
  POWER_BASIS_METRIC_CONFIG_KEYS,
  type MetricKey,
} from '../metric-registry';
import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { InferenceData } from '../types';
import { powerBasisNormalization } from '@/lib/power-basis';
import { matchesQuickFilters } from '../utils/quickFilters';
import {
  powerMetricAvailability,
  powerMetricState,
  type PowerAvailabilityState,
} from '../utils/power-metric-availability';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    title: 'PowerX availability',
    scope:
      'Current workload and hardware selection, before Optimal Only. Includes visible unofficial runs.',
    loading: 'Updating measurement availability…',
    none: 'No benchmark points match this selection.',
    summary: (available: number, total: number) =>
      `${available} of ${total} points have this metric`,
    labels: {
      strict: 'Validated · schema 2',
      validated: 'Validated · other or missing schema',
      unverified: 'No validation verdict',
      invalid: 'Validation failed',
      inapplicable: 'No separate worker pools',
      ambiguous: 'Whole-deployment energy schema unavailable',
      missing: 'Metric not reported',
    },
    basisLabels: {
      available: 'Value available',
      noSpec: 'No published spec for this hardware',
      noThroughput: 'No output throughput reported',
      noNormalization: 'Whole-deployment GPU count unavailable for this disaggregated row',
      noTelemetry: 'No validated GPU telemetry',
      invalid: 'Validation failed',
      modelWorkload: 'Chassis model covers 8K / 1K only',
      modelHardware: 'Hardware not in the chassis power model',
      modelUnsupported: 'Chassis model unsupported for this deployment',
    },
    note: 'A missing verdict does not establish age or validity. Prefill/decode metrics measure separate worker pools. Missing values are never replaced with zero or TDP estimates.',
    all: 'Availability of all measured metrics',
    evidence: 'Selected metric: source details',
    run: 'Source run',
  },
  zh: {
    title: 'PowerX 指标可用性',
    scope: '按当前工作负载与硬件选择统计，不受“仅最优”影响，包含已显示的非官方运行。',
    loading: '正在更新指标可用性…',
    none: '当前选择没有匹配的基准测试数据点。',
    summary: (available: number, total: number) =>
      `${total} 个数据点中有 ${available} 个提供此指标`,
    labels: {
      strict: '已验证 · schema 2',
      validated: '已验证 · 其他或未标注 schema',
      unverified: '未提供验证结论',
      invalid: '验证失败',
      inapplicable: '无独立 worker 池',
      ambiguous: '缺少整个部署的能耗 schema',
      missing: '未提供此指标',
    },
    basisLabels: {
      available: '有数值',
      noSpec: '该硬件没有公开的规格参数',
      noThroughput: '未报告输出吞吐量',
      noNormalization: '无法确定该分离式部署的 GPU 总数',
      noTelemetry: '没有已验证的 GPU 遥测',
      invalid: '验证失败',
      modelWorkload: '机箱功耗模型仅覆盖 8K / 1K',
      modelHardware: '硬件不在机箱功耗模型范围内',
      modelUnsupported: '机箱功耗模型不支持此部署',
    },
    note: '缺少验证结论不能判断数据新旧或有效性。prefill/decode 指标仅衡量独立 worker 池。缺失值不会被替换为零或 TDP 估算值。',
    all: '所有实测指标的可用性',
    evidence: '当前指标的来源详情',
    run: '来源运行',
  },
} as const;

/**
 * Why a point lacks a derived power boundary (lib/power-basis.ts). Provisioned
 * boundaries are spec constants, so their watts exist for any registered
 * hardware and their energy additionally needs output throughput plus, for
 * disaggregated rows, the whole-deployment GPU count that
 * `powerBasisNormalization` recovers only for fixed-sequence runs with integer
 * prefill/decode counts. The modeled boundary is measured telemetry carried
 * through the chassis model, so it inherits the telemetry verdict and the
 * model's own unsupported reasons.
 */
export type PowerBasisAvailabilityState =
  | 'available'
  | 'noSpec'
  | 'noThroughput'
  | 'noNormalization'
  | 'noTelemetry'
  | 'invalid'
  | 'modelWorkload'
  | 'modelHardware'
  | 'modelUnsupported';

const POWER_BASIS_AVAILABILITY_STATES: readonly PowerBasisAvailabilityState[] = [
  'available',
  'noSpec',
  'noThroughput',
  'noNormalization',
  'noTelemetry',
  'invalid',
  'modelWorkload',
  'modelHardware',
  'modelUnsupported',
];

const hasFiniteValue = (point: InferenceData, key: MetricKey): boolean => {
  const value = point[key];
  return (
    typeof value === 'object' &&
    value !== null &&
    'y' in value &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
};

export function powerBasisState(
  point: InferenceData,
  configKey: string,
): PowerBasisAvailabilityState {
  const key = configKey.replace(/^y_/u, '') as MetricKey;
  if (hasFiniteValue(point, key)) return 'available';
  const config = getMeasuredMetricConfig(configKey);
  if (config?.basis === 'utility-modeled') {
    if (point.power_valid === 0) return 'invalid';
    const model = point.modeledSystemPower;
    if (model?.status === 'unsupported') {
      if (model.reason === 'workload') return 'modelWorkload';
      if (model.reason === 'hardware') return 'modelHardware';
      if (model.reason === 'telemetry') return 'noTelemetry';
      return 'modelUnsupported';
    }
    // A supported model without a plotted value means B1 is absent (B4 follows B1).
    return 'noTelemetry';
  }
  // Provisioned energy needs the watts sibling plus the whole-deployment
  // normalization; the same helper that withheld the value says which half is
  // missing, so the explanation cannot drift from the formula.
  const wattsKey = (
    config?.basis === 'gpu-provisioned' ? 'gpuProvisionedWatts' : 'utilityProvisionedWatts'
  ) satisfies MetricKey;
  if (!hasFiniteValue(point, wattsKey)) return 'noSpec';
  const perGpu = point.output_tput_per_gpu;
  if (typeof perGpu !== 'number' || !Number.isFinite(perGpu) || perGpu <= 0) return 'noThroughput';
  // Throughput exists, so only the disaggregated GPU count can be missing.
  // Chart points may lack the counts an aggregate entry always has; an
  // unknown count is exactly the "unavailable" case the helper reports.
  const { allocatedGpus } = powerBasisNormalization({
    output_tput_per_gpu: perGpu,
    disagg: point.disagg ?? false,
    benchmark_type: point.benchmark_type,
    num_prefill_gpu: point.num_prefill_gpu ?? Number.NaN,
    num_decode_gpu: point.num_decode_gpu ?? Number.NaN,
  });
  return allocatedGpus === null ? 'noNormalization' : 'noThroughput';
}

function powerBasisAvailability(points: readonly InferenceData[], metric: string) {
  const counts = Object.fromEntries(
    POWER_BASIS_AVAILABILITY_STATES.map((state) => [state, 0]),
  ) as Record<PowerBasisAvailabilityState, number>;
  for (const point of points) counts[powerBasisState(point, metric)]++;
  return { metric, counts, available: counts.available, total: points.length };
}

export function PowerMetricAvailabilityPanel({
  points,
  metric,
  onSelect,
  loading = false,
}: {
  points: readonly InferenceData[];
  metric: string;
  onSelect: (metric: string) => void;
  loading?: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const availability = useMemo(
    () => [
      ...powerMetricAvailability(points),
      ...POWER_BASIS_METRIC_CONFIG_KEYS.map((key) => powerBasisAvailability(points, key)),
    ],
    [points],
  );
  const selected = availability.find((entry) => entry.metric === metric);
  if (!selected) return null;
  const isBasis = isPowerBasisConfigKey(metric);
  const stateOf = (point: InferenceData) =>
    isBasis ? powerBasisState(point, metric) : powerMetricState(point, metric);
  // The two dictionaries overlap on `invalid`; the selected metric, not the
  // key, decides which copy applies so the measured strings stay untouched.
  const labelOf = (state: PowerAvailabilityState | PowerBasisAvailabilityState) =>
    isBasis
      ? t.basisLabels[state as PowerBasisAvailabilityState]
      : t.labels[state as PowerAvailabilityState];
  const sources = new Map<
    string,
    {
      point: InferenceData;
      state: PowerAvailabilityState | PowerBasisAvailabilityState;
      count: number;
    }
  >();
  for (const point of points) {
    const state = stateOf(point);
    if (state === 'strict' || state === 'available') continue;
    const key = JSON.stringify([point.hwKey, point.run_url, state, point.power_invalid_reasons]);
    const group = sources.get(key);
    if (group) group.count++;
    else sources.set(key, { point, state, count: 1 });
  }
  return (
    <div
      data-testid="power-metric-availability"
      className="space-y-2 text-xs text-muted-foreground"
    >
      <p className="font-medium text-foreground">
        {t.title}:{' '}
        {loading
          ? t.loading
          : points.length > 0
            ? t.summary(selected.available, selected.total)
            : t.none}
      </p>
      {!loading && (
        <>
          <p>{t.scope}</p>
          <p>
            {Object.entries(selected.counts)
              .filter(([, count]) => count > 0)
              .map(
                ([state, count]) =>
                  `${labelOf(state as PowerAvailabilityState | PowerBasisAvailabilityState)}: ${count}`,
              )
              .join(' · ')}
          </p>
          <details
            onToggle={(event) => {
              if (event.currentTarget.open) track('inference_power_availability_opened');
            }}
          >
            <summary className="cursor-pointer">{t.all}</summary>
            <ul className="mt-2 space-y-1">
              {availability.map((entry) => (
                <li key={entry.metric}>
                  <button
                    type="button"
                    className="text-left underline underline-offset-2"
                    onClick={() => onSelect(entry.metric)}
                  >
                    {metricOptionTitle(entry.metric.slice(2) as MetricKey, locale)}:{' '}
                    {entry.available}/{entry.total}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2">{t.note}</p>
          </details>
          {sources.size > 0 && (
            <details>
              <summary className="cursor-pointer">{t.evidence}</summary>
              <ul className="mt-2 max-h-48 space-y-2 overflow-auto">
                {[...sources.values()].map(({ point, state, count }, index) => (
                  <li key={index}>
                    {point.hwKey}: {labelOf(state)} ({count})
                    {point.power_invalid_reasons?.length
                      ? ` · ${point.power_invalid_reasons.join(', ')}`
                      : ''}
                    {point.power_audit?.source ? ` · ${point.power_audit.source}` : ''}
                    {point.run_url &&
                      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/u.test(
                        point.run_url,
                      ) && (
                        <>
                          {' '}
                          ·{' '}
                          <a
                            href={point.run_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            {t.run}
                          </a>
                        </>
                      )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Reuse pre-metric rows, including overlays: absent power must not erase its own explanation. */
export function PowerMetricAvailability({
  metric,
  onSelect,
}: {
  metric: string;
  onSelect: (metric: string) => void;
}) {
  const { selectionPoints = [], loading, refreshing } = useInferenceData();
  const {
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    activeHwTypes,
    quickFilters,
    compareGpuPair,
  } = useInferenceFilters();
  const { getOverlayData, activeOverlayHwTypes, isUnofficialRun, localOfficialOverride } =
    useUnofficialRun();
  const points = useMemo(() => {
    const officialHw = isUnofficialRun ? (localOfficialOverride ?? activeHwTypes) : activeHwTypes;
    const official = selectionPoints.filter(
      (point) =>
        selectedPrecisions.includes(point.precision) && officialHw.has(String(point.hwKey)),
    );
    const overlay = getOverlayData?.(selectedModel, selectedSequence, 'interactivity')?.data ?? [];
    return [
      ...official,
      ...overlay.filter(
        (point) =>
          selectedPrecisions.includes(point.precision) &&
          activeOverlayHwTypes.has(String(point.hwKey)) &&
          matchesQuickFilters(point, quickFilters) &&
          (!compareGpuPair || hardwareKeyMatchesAnyBase(String(point.hwKey), compareGpuPair)),
      ),
    ];
  }, [
    selectionPoints,
    selectedPrecisions,
    activeHwTypes,
    getOverlayData,
    selectedModel,
    selectedSequence,
    activeOverlayHwTypes,
    isUnofficialRun,
    localOfficialOverride,
    quickFilters,
    compareGpuPair,
  ]);
  if (!isMeasuredEnergyConfigKey(metric) && !isPowerBasisConfigKey(metric)) return null;
  return (
    <PowerMetricAvailabilityPanel
      points={points}
      metric={metric}
      onSelect={onSelect}
      loading={loading || refreshing}
    />
  );
}
