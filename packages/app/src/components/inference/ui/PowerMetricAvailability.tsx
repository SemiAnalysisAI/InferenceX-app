'use client';

import { useMemo } from 'react';
import { useInferenceData, useInferenceFilters } from '../InferenceContext';
import { isMeasuredEnergyConfigKey, metricOptionTitle, type MetricKey } from '../metric-registry';
import type { InferenceData } from '../types';
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
    note: '缺少验证结论不能判断数据新旧或有效性。prefill/decode 指标仅衡量独立 worker 池。缺失值不会被替换为零或 TDP 估算值。',
    all: '所有实测指标的可用性',
    evidence: '当前指标的来源详情',
    run: '来源运行',
  },
} as const;

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
  const availability = useMemo(() => powerMetricAvailability(points), [points]);
  const selected = availability.find((entry) => entry.metric === metric);
  if (!selected) return null;
  const sources = new Map<
    string,
    { point: InferenceData; state: PowerAvailabilityState; count: number }
  >();
  for (const point of points) {
    const state = powerMetricState(point, metric);
    if (state === 'strict') continue;
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
              .map(([state, count]) => `${t.labels[state as PowerAvailabilityState]}: ${count}`)
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
                    {point.hwKey}: {t.labels[state]} ({count})
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
  if (!isMeasuredEnergyConfigKey(metric)) return null;
  return (
    <PowerMetricAvailabilityPanel
      points={points}
      metric={metric}
      onSelect={onSelect}
      loading={loading || refreshing}
    />
  );
}
