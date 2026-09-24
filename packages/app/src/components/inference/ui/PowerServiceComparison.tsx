'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { Heading } from '@/components/ui/heading';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import type { AggDataEntry, InferenceData } from '../types';
import {
  buildEqualServiceComparison,
  equalServiceSourceKey,
  getEqualServiceComparisonCurve,
  getEqualServiceSources,
  observedPoints,
  type EqualServiceEstimate,
  type EqualServiceReason,
} from '../utils/equal-service-comparison';
import MatchedConcurrencyTable from './MatchedConcurrencyTable';
import PowerFitPanel from './PowerFitPanel';
import { PowerPanelPlot } from './PowerPanelPlot';
import PowerRoleGroup from './PowerRoleGroup';

const STRINGS = {
  en: {
    compare: 'Compare at the same speed / latency',
    roles: 'Prefill / decode roles',
    fit: 'Power vs output-rate fit',
    baseline: 'Baseline',
    comparator: 'Comparator',
    target: 'Target',
    change: 'Change',
    title: 'Power, throughput and energy at the same service point',
    method:
      'Change = (comparator ÷ baseline − 1) × 100%. A negative energy change means lower energy use. Matches the selected axis only; other latencies may differ.',
    interpolation:
      'Within each source, raw quantities are linearly interpolated between neighboring observations, then compared. No extrapolation. Larger markers show the selected target. Lines connect the derived comparisons; they are not additional measurements.',
    targetHelp:
      'Enter a target within both source ranges to inspect values and bracketing observations.',
    concurrency:
      'Concurrency is a load diagnostic, not equal service. Select interactivity, TTFT or end-to-end latency for the equal-service comparison; the table below pairs observations at each concurrency.',
    metric: 'Metric',
    empty: 'No comparable points in the selected sources’ overlapping range.',
    measured: 'Observed',
    interpolated: 'Interpolated',
    observation: 'Observation',
    meanWattsPerGpu: 'Mean GPU power (W/GPU)',
    outputTokensPerSecond: 'Deployment output (tok/s)',
    joulesPerOutputToken: 'GPU energy (J/output token)',
    percent: 'Comparator change (%)',
    unavailable: 'Unavailable',
  },
  zh: {
    compare: '在相同速度 / 延迟下比较',
    roles: '预填充 / 解码角色',
    fit: '功耗与输出速率拟合',
    baseline: '基准',
    comparator: '对比对象',
    target: '目标值',
    change: '变化',
    title: '相同服务指标下的功耗、吞吐量与能耗',
    method:
      '变化 =（对比对象 ÷ 基准 − 1）× 100%。能耗变化率为负表示能耗更低。只匹配所选横轴，其他延迟可能不同。',
    interpolation:
      '各数据源在相邻观测点间对原始数值进行线性插值，再计算变化率；不做外推。大圆点标记所选目标值。连线连接推导出的比较结果，不代表额外实测。',
    targetHelp: '输入两个数据源范围内的目标值，查看数值及插值两端的观测点。',
    concurrency:
      '并发数用于分析负载，并不代表相同服务水平。相同服务水平的比较请选择交互性、首 token 延迟或端到端延迟；下表按各并发数配对观测值。',
    metric: '指标',
    empty: '所选数据源的重叠范围内没有可比较的数据。',
    measured: '实测',
    interpolated: '插值',
    observation: '观测点',
    meanWattsPerGpu: '平均 GPU 功耗（W/GPU）',
    outputTokensPerSecond: '部署输出吞吐量（tok/s）',
    joulesPerOutputToken: 'GPU 能耗（J/输出 token）',
    percent: '对比对象变化（%）',
    unavailable: '不可用',
  },
};
const REASONS: Record<EqualServiceReason, [string, string]> = {
  'unsupported-axis': ['Select a service axis.', '请选择服务指标横轴。'],
  'invalid-target': ['Enter a positive finite target.', '请输入有效的正数目标值。'],
  'same-source': ['Choose two different sources.', '请选择两个不同的数据源。'],
  'unknown-source': [
    'A selected source is unavailable under these filters.',
    '当前筛选条件下找不到所选数据源。',
  ],
  'out-of-range': ['Target is outside a source range.', '目标值超出数据源范围。'],
  'ambiguous-x': [
    'Conflicting observations at the same X; no value selected.',
    '相同横轴值有冲突的观测数据，未选择数值。',
  ],
  'missing-metric': ['A required observation is missing this metric.', '所需观测点缺少该指标。'],
};
const METRICS = ['meanWattsPerGpu', 'outputTokensPerSecond', 'joulesPerOutputToken'] as const;
const DASHES = ['', '6,4', '2,3'];
const number = d3.format(',.4~g');
const percent = d3.format('+.2f');

function PanelToggle({
  checked,
  onChange,
  label,
  testId,
  event,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId: string;
  event: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
          track(event, { enabled: e.target.checked });
        }}
        data-testid={testId}
      />
      {label}
    </label>
  );
}

/**
 * PowerX analysis panels under a measured-power chart: equal-service and
 * matched-concurrency comparisons, the prefill/decode role group and the
 * power-vs-output-rate fit. Every panel reads the chart's visible official and
 * `?unofficialrun=` rows; overlay sources take their run's legend colour.
 */
export default function PowerServiceComparison({
  data,
  overlayData = [],
  xField,
  xLabel,
  interactivityField,
  chartId,
  contextLabel,
}: {
  data: InferenceData[];
  /** The subset of `data` loaded from unofficial runs. */
  overlayData?: readonly InferenceData[];
  xField: keyof AggDataEntry;
  xLabel: string;
  /** Streaming-speed field at the selected statistic, for load-matched rows. */
  interactivityField: keyof AggDataEntry;
  chartId: string;
  contextLabel?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { getUrlParam, setUrlParams } = useUrlState();
  const { runIndexByUrl } = useUnofficialRun();
  const [enabled, setEnabled] = useState(() => getUrlParam('i_servicecompare') === '1');
  const [roleShare, setRoleShare] = useState(() => getUrlParam('i_roleshare') === '1');
  const [powerFit, setPowerFit] = useState(() => getUrlParam('i_powerfit') === '1');
  const [baseline, setBaseline] = useState(() => getUrlParam('i_servicebase') ?? '');
  const [comparator, setComparator] = useState(() => getUrlParam('i_servicepeer') ?? '');
  const [target, setTarget] = useState(() => getUrlParam('i_servicetarget') ?? '');
  const sources = useMemo(() => getEqualServiceSources(data, locale), [data, locale]);
  const base = baseline || sources[0]?.key || '';
  const peer = comparator || sources[1]?.key || '';
  const previousAxis = useRef(xField);
  useEffect(() => {
    if (previousAxis.current !== xField) {
      previousAxis.current = xField;
      setTarget('');
      setUrlParams({ i_servicetarget: '' });
    }
  }, [xField, setUrlParams]);
  useEffect(() => {
    setUrlParams({
      i_servicecompare: enabled ? '1' : '0',
      i_roleshare: roleShare ? '1' : '0',
      i_powerfit: powerFit ? '1' : '0',
      i_servicebase: enabled ? base : baseline,
      i_servicepeer: enabled ? peer : comparator,
      i_servicetarget: target,
    });
  }, [enabled, roleShare, powerFit, base, peer, baseline, comparator, target, setUrlParams]);
  const curve = useMemo(
    () =>
      enabled
        ? getEqualServiceComparisonCurve(data, {
            baseline: base,
            comparator: peer,
            xField,
          })
        : [],
    [enabled, data, base, peer, xField],
  );
  const comparison = useMemo(
    () =>
      enabled && target.trim()
        ? buildEqualServiceComparison(data, {
            baseline: base,
            comparator: peer,
            xField,
            target: Number(target),
          })
        : null,
    [enabled, data, base, peer, xField, target],
  );
  const { resolveColor } = useThemeColors({
    highContrast: true,
    identifiers: [...METRICS, ...sources.map((s) => s.key)],
  });
  const metricColors = Object.fromEntries(METRICS.map((key) => [key, resolveColor(key)]));
  const overlaySourceKeys = useMemo(
    () => new Map(observedPoints(overlayData).map((p) => [equalServiceSourceKey(p), p.run_url])),
    [overlayData],
  );
  const colorOf = useCallback(
    (key: string) =>
      overlaySourceKeys.has(key)
        ? overlayRunColor(overlayRunIndex(overlaySourceKeys.get(key), runIndexByUrl))
        : resolveColor(key),
    [overlaySourceKeys, runIndexByUrl, resolveColor],
  );
  const sourceLabel = (key: string) =>
    sources.find((source) => source.key === key)?.label ?? t.unavailable;
  // The percentage of interpolated raw values is not linear in X. Include the
  // exact selected target as a knot so its plotted marker agrees with the table.
  const plottedCurve =
    comparison && Object.values(comparison.metrics).some((metric) => metric.changePercent !== null)
      ? [...curve.filter((row) => row.target !== comparison.target), comparison].sort(
          (a, b) => a.target - b.target,
        )
      : curve;
  const plotPoints = METRICS.flatMap((key) =>
    plottedCurve.map((row) => ({
      key,
      x: row.target,
      y: row.metrics[key].changePercent ?? NaN,
      selected: row.target === comparison?.target,
    })),
  );
  const reason = (value?: EqualServiceReason) =>
    value ? REASONS[value][locale === 'zh' ? 1 : 0] : t.unavailable;
  const estimate = (value: EqualServiceEstimate | null) =>
    value ? (
      <>
        <strong>{number(value.value)}</strong>
        <span className="block text-xs text-muted-foreground">
          {value.interpolated ? t.interpolated : t.measured}
        </span>
        <span className="block text-xs text-muted-foreground">
          {value.endpoints
            .map(
              (endpoint) =>
                `${t.observation} ${endpoint.point.id ?? '—'}: ${number(endpoint.x)} · c${endpoint.point.conc}`,
            )
            .join(' → ')}
        </span>
      </>
    ) : (
      '—'
    );
  const selectClass = 'w-full min-w-0 rounded-md border bg-background p-2 text-sm';
  const sourceSelect = (
    value: string,
    onChange: (value: string) => void,
    label: string,
    testId: string,
    role: 'baseline' | 'comparator',
  ) => (
    <label className="min-w-0 space-y-1 text-sm">
      <span>{label}</span>
      <select
        className={selectClass}
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          track('inference_equal_service_source_changed', { role });
        }}
      >
        {!sources.some((source) => source.key === value) && (
          <option value={value}>{t.unavailable}</option>
        )}
        {sources.map((source) => (
          <option key={source.key} value={source.key}>
            {source.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mt-6 min-w-0 space-y-4 border-t pt-4" data-testid="power-service-comparison">
      <div className="no-export flex flex-wrap gap-4 text-sm">
        <PanelToggle
          checked={enabled}
          onChange={setEnabled}
          label={t.compare}
          testId="equal-service-toggle"
          event="inference_equal_service_toggled"
        />
        <PanelToggle
          checked={roleShare}
          onChange={setRoleShare}
          label={t.roles}
          testId="role-share-toggle"
          event="inference_power_roles_toggled"
        />
        <PanelToggle
          checked={powerFit}
          onChange={setPowerFit}
          label={t.fit}
          testId="power-fit-toggle"
          event="inference_power_fit_toggled"
        />
      </div>
      {enabled && (
        <>
          <div className="no-export grid min-w-0 gap-3 md:grid-cols-2">
            {sourceSelect(base, setBaseline, t.baseline, 'equal-service-baseline', 'baseline')}
            {sourceSelect(
              peer,
              setComparator,
              t.comparator,
              'equal-service-comparator',
              'comparator',
            )}
          </div>
          {xField === 'conc' ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="equal-service-concurrency-note"
            >
              {t.concurrency}
            </p>
          ) : (
            <section
              id={`${chartId}-service`}
              className="min-w-0 space-y-3"
              data-testid="equal-service-panel"
            >
              <Heading as="h3" level="card">
                {t.title}
              </Heading>
              <p className="text-sm text-muted-foreground">{contextLabel}</p>
              <p className="text-sm text-muted-foreground">{t.method}</p>
              <p className="break-words text-sm">
                {t.baseline}: {sourceLabel(base)} → {t.comparator}: {sourceLabel(peer)}
              </p>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {METRICS.map((key, index) => (
                  <span key={key} className="inline-flex items-center gap-2">
                    <svg width="28" height="10" aria-hidden="true">
                      <line
                        x1="0"
                        x2="28"
                        y1="5"
                        y2="5"
                        stroke={metricColors[key]}
                        strokeWidth="2"
                        strokeDasharray={DASHES[index]}
                      />
                    </svg>
                    {t[key]}
                  </span>
                ))}
              </div>
              {plotPoints.some((p) => Number.isFinite(p.y)) ? (
                <PowerPanelPlot
                  chartId={`${chartId}-service`}
                  markers={plotPoints.filter((p) => Number.isFinite(p.y))}
                  lines={METRICS.map((key, index) => ({
                    key,
                    color: metricColors[key],
                    dash: DASHES[index],
                    points: plotPoints.filter((p) => p.key === key),
                  }))}
                  markerColor={(key) => metricColors[key]}
                  xLabel={xLabel}
                  yLabel={t.percent}
                  reference={0}
                  height={360}
                />
              ) : (
                <p className="py-6 text-sm text-muted-foreground">{t.empty}</p>
              )}
              <p className="text-xs text-muted-foreground">{t.interpolation}</p>
              <div className="max-h-0 overflow-hidden">
                <div id={`${chartId}-service-export`} className="p-4" />
              </div>
              <ChartButtons
                chartId={`${chartId}-service`}
                analyticsPrefix="equal_service"
                hideZoomReset
              />
              <label className="no-export block max-w-lg space-y-1 text-sm">
                {t.target} · {xLabel}
                <input
                  className={selectClass}
                  type="number"
                  min="0"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  data-testid="equal-service-target"
                />
              </label>
              {comparison ? (
                <div className="min-w-0">
                  <table
                    className="w-full table-fixed break-words text-left text-sm"
                    data-testid="equal-service-table"
                  >
                    <caption className="mb-2 text-left">
                      {xLabel}: {number(comparison.target)}
                    </caption>
                    <thead>
                      <tr>
                        <th className="p-2">{t.metric}</th>
                        <th className="p-2">{t.baseline}</th>
                        <th className="p-2">{t.comparator}</th>
                        <th className="p-2">{t.change}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METRICS.map((key) => (
                        <tr className="border-t" key={key} data-testid={`equal-service-${key}`}>
                          <th className="p-2 font-medium">{t[key]}</th>
                          <td className="p-2 align-top">
                            {estimate(comparison.metrics[key].baseline)}
                          </td>
                          <td className="p-2 align-top">
                            {estimate(comparison.metrics[key].comparator)}
                          </td>
                          <td className="p-2 align-top">
                            {comparison.metrics[key].changePercent === null
                              ? reason(comparison.metrics[key].reason)
                              : `${percent(comparison.metrics[key].changePercent!)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t.targetHelp}</p>
              )}
            </section>
          )}
          <MatchedConcurrencyTable
            chartId={chartId}
            data={data}
            baseline={base}
            comparator={peer}
            interactivityField={interactivityField}
            sourceLabel={sourceLabel}
          />
        </>
      )}
      {roleShare && (
        <PowerRoleGroup
          chartId={chartId}
          data={data}
          xField={xField}
          xLabel={xLabel}
          contextLabel={contextLabel}
          sources={sources}
          colorOf={colorOf}
        />
      )}
      {powerFit && (
        <PowerFitPanel
          chartId={chartId}
          data={data}
          contextLabel={contextLabel}
          colorOf={colorOf}
        />
      )}
    </div>
  );
}
