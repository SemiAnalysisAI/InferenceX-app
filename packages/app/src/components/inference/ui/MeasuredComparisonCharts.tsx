'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInferenceActions, useInferenceDisplay, useInferenceFilters } from '../InferenceContext';
import type { MeasuredComparison, MeasuredMetricFamily } from '../measured-metric-config';
import {
  comparisonSourceOptions,
  comparisonSourceKey,
  relativeComparisonSeries,
  comparisonSeries,
  comparisonValueAtX,
  measuredComparisonPanels,
  measuredComparisonRows,
  type ComparisonPoint,
  type ComparisonSource,
} from '../utils/measured-comparison';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { CustomLayerConfig } from '@/lib/d3-chart/D3Chart/types';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { useLocale } from '@/lib/use-locale';
import { getHardwareConfig } from '@/lib/constants';
import { escapeHtml, getDisplayLabel } from '@/lib/utils';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import ChartLegend from '@/components/ui/chart-legend';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Heading } from '@/components/ui/heading';
import { POWERX_STRINGS } from '@/components/powerx/powerx-copy';
import { countPowerTiers } from './MeasuredPowerSummary';

const STRINGS = {
  en: {
    empty: 'No comparable values for the selected data. Missing measurements are omitted.',
    note: 'Points retain their source run and configuration. Straight lines connect adjacent tested points; they are not Pareto frontiers. Missing values leave gaps.',
    roleNote:
      'Prefill uses input tokens; decode uses output tokens. These role-local values have different denominators.',
    requestNote:
      'Reconstructed on one output-token basis using the same-window measured input/output token ratio. Only validated schema-2 disaggregated runs are included.',
    target: 'Compare at X',
    targetHint: 'Leave blank to hide the comparison marker.',
    isoNote:
      'ISO values are linearly interpolated inside each tested range; values outside coverage are omitted.',
    log: 'Log scale',
    source: 'Source run',
    baseline: 'Baseline source',
    comparator: 'Comparator source',
    choose: 'Select a configuration and run',
    relativeNote:
      'Each source is interpolated separately at the same X, only within overlapping tested ranges. Positive means more board power, more output per allocated GPU, or less energy per output token, respectively. Lines join derived comparisons, not measurements. Missing or ambiguous values leave gaps.',
    relativeEmpty:
      'Select two distinct sources with unambiguous overlapping measurements. Missing values, conflicting duplicate X values, and out-of-range comparisons are unavailable.',
  },
  zh: {
    empty: '所选数据暂无可比较的数值。缺失测量值不会绘制。',
    note: '数据点保留原始运行和配置。直线连接相邻测试点，不代表 Pareto 前沿；缺失值处保留断点。',
    roleNote:
      'Prefill 按 input token 归一化，decode 按 output token 归一化。这两组阶段能耗的分母不同。',
    requestNote:
      '使用同一测量窗口的实际 input/output token 比例，统一重建为每 output token 能耗。仅包含通过验证的 schema-2 分离式部署数据。',
    target: '在指定 X 值比较',
    targetHint: '留空可隐藏比较标记。',
    isoNote: 'ISO 数值在各曲线测试范围内线性插值；超出范围的值不显示。',
    log: '对数刻度',
    source: '来源运行',
    baseline: '基准来源',
    comparator: '对比来源',
    choose: '选择配置与运行',
    relativeNote:
      '在测试范围重叠的同一 X 值处，分别对两个来源插值。正值依次表示板级功耗增加、每分配 GPU 的输出吞吐量提升、每 output token 能耗降低。连线连接派生比较值，不代表直接测量；缺失或有歧义的值保留断点。',
    relativeEmpty:
      '请选择两个不同且测量范围重叠的来源。缺失值、同一 X 处相互冲突的记录，以及超出覆盖范围的比较均不可用。',
  },
} as const;

const hardwareLabel = (hwKey: string) => getDisplayLabel(getHardwareConfig(hwKey));

export default function MeasuredComparisonCharts({
  chartId,
  sources,
  mode,
  family,
  xField,
  xLabel,
  caption,
}: {
  chartId: string;
  sources: ComparisonSource[];
  mode: Exclude<MeasuredComparison, 'single'>;
  family: MeasuredMetricFamily;
  xField: string;
  xLabel: string;
  caption: ReactNode;
}) {
  const locale = useLocale(),
    t = STRINGS[locale];
  const { activeHwTypes } = useInferenceFilters();
  const { highContrast, logScale, isLegendExpanded } = useInferenceDisplay();
  const { toggleHwType, setLogScale, setIsLegendExpanded, setBestPerSku } = useInferenceActions();
  const {
    isUnofficialRun,
    activeOverlayHwTypes,
    localOfficialOverride,
    setUnifiedOverlaySelection,
  } = useUnofficialRun();
  const official = isUnofficialRun ? (localOfficialOverride ?? activeHwTypes) : activeHwTypes;
  const visible = useMemo(
    () =>
      sources.filter(({ point, overlayIndex }) =>
        (overlayIndex === undefined ? official : activeOverlayHwTypes).has(String(point.hwKey)),
      ),
    [sources, official, activeOverlayHwTypes],
  );
  const hardwareKeys = useMemo(
    () => [...new Set(sources.map(({ point }) => String(point.hwKey)))],
    [sources],
  );
  const { resolveColor, getCssColor } = useThemeColors({ highContrast, activeKeys: hardwareKeys });
  const { getUrlParam, setUrlParam, setUrlParams } = useUrlState();
  const [baselineKey, setBaselineKey] = useState(() => getUrlParam('i_mbase') ?? '');
  const [comparatorKey, setComparatorKey] = useState(() => getUrlParam('i_mcomp') ?? '');
  const sourceOptions = useMemo(() => comparisonSourceOptions(visible), [visible]);
  const relative = mode === 'relative';
  const [statistic, setStatistic] = useState(() =>
    getUrlParam('i_mstat') === 'mean' ? 'mean' : 'median',
  );
  const fixedSequence = sources.every(({ point }) => point.benchmark_type !== 'agentic_traces');
  const actualXField = fixedSequence
    ? xField.replace(/^(?:mean|median|p\d+(?:\.\d+)?)_/u, `${statistic}_`)
    : xField;
  const actualXLabel = fixedSequence
    ? `${statistic === 'mean' ? (locale === 'zh' ? '平均' : 'Mean') : locale === 'zh' ? '中位' : 'Median'} ${xLabel.replace(/^(?:Mean|Median|P\d+(?:\.\d+)?|平均|中位)\s*/u, '')}`
    : xLabel;
  const [target, setTarget] = useState(() =>
    getUrlParam('i_iso_axis') === actualXField ? (getUrlParam('i_iso') ?? '') : '',
  );
  const previousAxis = useRef(actualXField);
  useEffect(() => {
    if (
      previousAxis.current !== actualXField ||
      (getUrlParam('i_iso') && getUrlParam('i_iso_axis') !== actualXField)
    ) {
      previousAxis.current = actualXField;
      setTarget('');
      setUrlParams({ i_iso: '', i_iso_axis: '' });
    }
  }, [actualXField, getUrlParam, setUrlParams]);
  const targetNumber =
    target.trim() !== '' && Number.isFinite(Number(target)) && Number(target) > 0
      ? Number(target)
      : undefined;
  const panels = useMemo(
    () =>
      measuredComparisonPanels(mode, family).map((panel) => ({
        ...panel,
        series: relative
          ? relativeComparisonSeries(
              visible,
              actualXField,
              baselineKey,
              comparatorKey,
              targetNumber,
            )
          : comparisonSeries(visible, panel, actualXField),
      })),
    [visible, mode, family, actualXField, relative, baselineKey, comparatorKey, targetNumber],
  );
  const allX = panels.flatMap((panel) =>
    panel.series.flatMap((series) => series.points.map((point) => point.x)),
  );
  const plottedPrecisions = [
    ...new Set(
      panels.flatMap((panel) =>
        panel.series.flatMap((series) =>
          series.points
            .filter((point) => Number.isFinite(point.y))
            .map(({ point }) => point.precision.toUpperCase()),
        ),
      ),
    ),
  ].join(', ');
  const plottedHardware = new Set(
    panels.flatMap((panel) =>
      panel.series.flatMap((series) =>
        series.points
          .filter((point) => Number.isFinite(point.y))
          .map((source) => `${source.overlayIndex ?? 'official'}|${source.point.hwKey}`),
      ),
    ),
  );
  const unavailableHardware = relative
    ? []
    : [
        ...new Map(
          visible.map((source) => [
            `${source.overlayIndex ?? 'official'}|${source.point.hwKey}`,
            source,
          ]),
        ).entries(),
      ]
        .filter(([key]) => !plottedHardware.has(key))
        .map(
          ([, source]) =>
            `${source.overlayIndex === undefined ? '' : '✕ '}${hardwareLabel(String(source.point.hwKey))}`,
        );
  const historicalRows = countPowerTiers(
    measuredComparisonRows(
      relative
        ? measuredComparisonPanels('boundaries', family).flatMap((panel) =>
            comparisonSeries(
              visible.filter((source) =>
                [baselineKey, comparatorKey].includes(comparisonSourceKey(source)),
              ),
              panel,
              actualXField,
            ),
          )
        : panels.flatMap((panel) => panel.series),
    ),
  ).legacy;
  const xDomain: [number, number] = [0, (d3.max(allX) ?? 100) * 1.05];
  const visiblePue =
    [
      ...new Set(
        visible.flatMap(({ point }) =>
          point.modeledSystemPower?.status === 'supported' ? [point.modeledSystemPower.pue] : [],
        ),
      ),
    ].join(', ') || '—';
  const color = (source: { hwKey: string; overlayIndex?: number }) =>
    source.overlayIndex === undefined
      ? getCssColor(resolveColor(source.hwKey))
      : overlayRunColor(source.overlayIndex);
  const legendSources = [
    ...new Map(
      sources
        .filter(
          (source) =>
            !relative || [baselineKey, comparatorKey].includes(comparisonSourceKey(source)),
        )
        .map((source) => [`${source.overlayIndex ?? 'official'}|${source.point.hwKey}`, source]),
    ).values(),
  ];
  const legend = (
    <ChartLegend
      variant="sidebar"
      containerStyle={{ width: '100%', maxWidth: 'none' }}
      legendItems={legendSources.map(({ point, overlayIndex }) => {
        const hwKey = String(point.hwKey),
          overlay = overlayIndex !== undefined;
        return {
          name: `${overlayIndex ?? 'official'}|${hwKey}`,
          label: `${overlay ? '✕ ' : ''}${hardwareLabel(hwKey)}`,
          color: color({ hwKey, overlayIndex }),
          isActive: (overlay ? activeOverlayHwTypes : official).has(hwKey),
          onClick: () => {
            if (!isUnofficialRun) {
              toggleHwType(hwKey);
              return;
            }
            setBestPerSku(false, { applySelection: false });
            const next = new Set(overlay ? activeOverlayHwTypes : official);
            if (next.has(hwKey)) next.delete(hwKey);
            else next.add(hwKey);
            setUnifiedOverlaySelection(
              overlay ? official : next,
              overlay ? next : activeOverlayHwTypes,
            );
          },
        };
      })}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={setIsLegendExpanded}
      switches={
        relative
          ? []
          : [
              {
                id: `${chartId}-comparison-log`,
                label: t.log,
                checked: logScale,
                onCheckedChange: setLogScale,
              },
            ]
      }
    />
  );
  const sourceLabel = (key: string, full = false) => {
    const source = sourceOptions.find((option) => option.key === key);
    if (!source)
      return key
        ? locale === 'zh'
          ? '所选来源不在当前筛选中'
          : 'Selected source is outside current filters'
        : t.choose;
    const point = source.point;
    const configuration = [
      `TP${point.tp}`,
      point.dp ? `DP${point.dp}` : '',
      point.disagg
        ? `${point.num_prefill_gpu}P+${point.num_decode_gpu}D · P-TP${point.prefill_tp ?? '—'}/EP${point.prefill_ep ?? '—'} · D-EP${point.decode_ep ?? '—'}`
        : '',
      point.physicalChips ? `${point.physicalChips} GPUs` : '',
      point.offload_mode && point.offload_mode !== 'off' ? point.offload_mode : '',
      point.spec_decoding && point.spec_decoding !== 'none' ? point.spec_decoding : '',
      !full && (point.recipe_fingerprint?.length ?? 0) > 12
        ? `${point.recipe_fingerprint!.slice(0, 12)}…`
        : (point.recipe_fingerprint ?? ''),
    ]
      .filter(Boolean)
      .join(' · ');
    const run = point.run_url?.match(/runs\/(?<id>\d+)/u)?.groups?.id ?? point.run_url;
    return `${source.overlayIndex === undefined ? '' : '✕ '}${hardwareLabel(String(point.hwKey))} · ${point.precision.toUpperCase()} · ${configuration} · ${point.date}${run ? ` · Run ${run}` : ''}`;
  };
  return (
    <div id={chartId} data-testid="measured-comparison-charts" className="min-w-0">
      <figcaption>{caption}</figcaption>
      {relative && (
        <>
          <div className="no-export my-3 grid min-w-0 gap-3 md:grid-cols-2">
            {(['baseline', 'comparator'] as const).map((kind) => (
              <div className="min-w-0" key={kind}>
                <Label htmlFor={`${chartId}-${kind}`}>{t[kind]}</Label>
                <Select
                  value={(kind === 'baseline' ? baselineKey : comparatorKey) || undefined}
                  onValueChange={(key) => {
                    if (kind === 'baseline') {
                      setBaselineKey(key);
                      setUrlParam('i_mbase', key);
                    } else {
                      setComparatorKey(key);
                      setUrlParam('i_mcomp', key);
                    }
                  }}
                >
                  <SelectTrigger
                    id={`${chartId}-${kind}`}
                    data-testid={`measured-relative-${kind}`}
                    className="w-full min-w-0"
                  >
                    <SelectValue placeholder={t.choose} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((source) => (
                      <SelectItem
                        key={source.key}
                        value={source.key}
                        title={sourceLabel(source.key, true)}
                      >
                        {sourceLabel(source.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <p
            data-testid="measured-relative-sources"
            className="mb-2 break-words text-xs text-muted-foreground"
          >
            <span title={sourceLabel(baselineKey, true)}>
              {t.baseline}: {sourceLabel(baselineKey)}
            </span>
            <br />
            <span title={sourceLabel(comparatorKey, true)}>
              {t.comparator}: {sourceLabel(comparatorKey)}
            </span>
          </p>
        </>
      )}
      <div className="no-export my-3 flex flex-wrap items-center gap-2">
        {fixedSequence && (
          <>
            <Label htmlFor={`${chartId}-statistic`}>
              {locale === 'zh' ? 'X 轴统计值' : 'X statistic'}
            </Label>
            <Select
              value={statistic}
              onValueChange={(value) => {
                setStatistic(value);
                setUrlParam('i_mstat', value);
              }}
            >
              <SelectTrigger
                id={`${chartId}-statistic`}
                data-testid="measured-comparison-statistic"
                className="w-28"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="median">{locale === 'zh' ? '中位数' : 'Median'}</SelectItem>
                <SelectItem value="mean">{locale === 'zh' ? '平均值' : 'Mean'}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <Label htmlFor={`${chartId}-iso`}>
          {t.target} ({actualXLabel})
        </Label>
        <Input
          id={`${chartId}-iso`}
          data-testid="measured-comparison-iso"
          type="number"
          min="0"
          className="w-28"
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setUrlParams({ i_iso: event.target.value, i_iso_axis: actualXField });
          }}
          placeholder="—"
        />
        <span className="text-xs text-muted-foreground">{t.targetHint}</span>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {!relative && plottedPrecisions && (
          <span data-testid="measured-comparison-precision">
            {locale === 'zh' ? '精度' : 'Precision'}: {plottedPrecisions}.{' '}
          </span>
        )}
        {relative ? t.relativeNote : t.note}
      </p>
      {unavailableHardware.length > 0 && (
        <p
          data-testid="measured-comparison-unavailable-hardware"
          className="mb-2 text-xs text-muted-foreground"
        >
          {unavailableHardware.join(', ')}:{' '}
          {locale === 'zh' ? '所选指标没有可用数值。' : 'No values for the selected metrics.'}
        </p>
      )}
      {historicalRows > 0 && (
        <p
          data-testid="measured-comparison-historical"
          className="mb-2 text-xs text-muted-foreground"
        >
          {locale === 'zh'
            ? `包含 ${historicalRows} 条历史测量记录，其遥测数据没有采集端验证结果。`
            : `Includes ${historicalRows} historical measurements whose telemetry has no producer validation verdict.`}
        </p>
      )}
      {mode === 'boundaries' && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {locale === 'zh'
              ? `GPU 实测、GPU 额定、全设施额定与模型估算分别显示。设施模型采用 PUE ${visiblePue}。`
              : `GPU measured, GPU provisioned, utility provisioned and utility modeled are distinct boundaries. Facility model PUE ${visiblePue}.`}
          </p>
          <details className="no-export mb-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {locale === 'zh' ? '功耗假设与模型来源' : 'Power assumptions and model provenance'}
            </summary>
            <p className="mt-2">
              {POWERX_STRINGS[locale].model} {POWERX_STRINGS[locale].provisioned}
            </p>
          </details>
        </>
      )}
      {mode === 'roles' && <p className="mb-2 text-xs text-muted-foreground">{t.roleNote}</p>}
      {mode === 'role-energy' && (
        <p className="mb-2 text-xs text-muted-foreground">{t.requestNote}</p>
      )}
      {targetNumber !== undefined && (
        <p className="mb-2 text-xs text-muted-foreground">
          {actualXLabel}: {targetNumber}. {t.isoNote}
        </p>
      )}
      <div className={`grid min-w-0 gap-5 ${relative ? '' : 'xl:grid-cols-2'}`}>
        {panels.map((panel) => {
          const availableSourceCount = visible.filter(({ point }) => {
            const x = point[actualXField as keyof typeof point];
            return typeof x === 'number' && Number.isFinite(x) && x > 0;
          }).length;
          const points = panel.series
            .flatMap((series) => series.points)
            .filter((point) => Number.isFinite(point.y));
          const labels = panel.series.map((series, index) => ({
            series,
            id: `series-${index}`,
            label: `${series.overlayIndex === undefined ? '' : '✕ '}${hardwareLabel(series.hwKey)} · ${locale === 'zh' ? series.metric.labelZh : series.metric.label}`,
            value:
              targetNumber === undefined
                ? undefined
                : comparisonValueAtX(series.points, targetNumber),
          }));
          const lines = Object.fromEntries(labels.map(({ series, id }) => [id, series.points]));
          const min = d3.min(points, (point) => point.y) ?? 1,
            max = d3.max(points, (point) => point.y) ?? 100;
          const useLog = logScale && panel.unit !== '%';
          const yDomain: [number, number] = relative
            ? [Math.min(0, min * 1.1), Math.max(0, max * 1.1) || 1]
            : panel.unit === '%'
              ? [0, 100]
              : [useLog ? min * 0.9 : Math.min(0, min), max * 1.1];
          const drawIso: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
            const xs = (ctx.renderedXScale ?? ctx.xScale) as d3.ScaleLinear<number, number>;
            const ys = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLinear<number, number>;
            const parity = group
              .selectAll<SVGGElement, number>('.comparison-role-parity')
              .data(panel.key === 'prefill-share' ? [50] : relative ? [0] : [])
              .join('g')
              .attr('class', 'comparison-role-parity');
            parity
              .selectAll('line')
              .data((value) => [value])
              .join('line')
              .attr('x1', 0)
              .attr('x2', ctx.width)
              .attr('y1', (value) => ys(value))
              .attr('y2', (value) => ys(value))
              .attr('stroke', 'currentColor')
              .attr('stroke-dasharray', '5,4')
              .attr('opacity', 0.5);
            parity
              .selectAll('text')
              .data((value) => [value])
              .join('text')
              .attr('x', ctx.width - 4)
              .attr('y', (value) => ys(value) - 6)
              .attr('text-anchor', 'end')
              .attr('font-size', CHART_TYPE.annotation)
              .attr('fill', 'currentColor')
              .text(
                relative
                  ? locale === 'zh'
                    ? '0% · 无变化'
                    : '0% · No change'
                  : locale === 'zh'
                    ? '50% · Prefill 与 decode 能耗相等'
                    : '50% · Equal prefill and decode energy',
              );
            const values = labels
              .filter((entry) => entry.value !== undefined)
              .toSorted((a, b) => ys(a.value!) - ys(b.value!));
            const layer = group
              .selectAll<SVGGElement, number>('.comparison-iso')
              .data(targetNumber === undefined ? [] : [targetNumber])
              .join('g')
              .attr('class', 'comparison-iso');
            layer
              .selectAll('line')
              .data(targetNumber === undefined ? [] : [targetNumber])
              .join('line')
              .attr('x1', (x) => xs(x))
              .attr('x2', (x) => xs(x))
              .attr('y1', 0)
              .attr('y2', ctx.height)
              .attr('stroke', 'currentColor')
              .attr('stroke-dasharray', '3,3')
              .attr('opacity', 0.5);
            const rowHeight = CHART_TYPE.annotation + 5;
            const start = Math.max(
              10,
              Math.min(ys(values[0]?.value ?? 0), ctx.height - values.length * rowHeight),
            );
            layer
              .selectAll<SVGTextElement, (typeof values)[number]>('text')
              .data(values, (entry) => entry.id)
              .join('text')
              .attr('x', Math.min(ctx.width - 4, Math.max(4, xs(targetNumber ?? 0) + 6)))
              .attr('y', (_entry, index) => start + index * rowHeight)
              .attr('text-anchor', xs(targetNumber ?? 0) > ctx.width / 2 ? 'end' : 'start')
              .attr('font-size', CHART_TYPE.annotation)
              .attr('fill', (entry) => color(entry.series))
              .attr('paint-order', 'stroke')
              .attr('stroke', 'var(--background)')
              .attr('stroke-width', 3)
              .text((entry) => {
                const label = relative
                  ? {
                      relativePower: locale === 'zh' ? '功耗增加' : 'Power increase',
                      relativeThroughput: locale === 'zh' ? '吞吐量提升' : 'Output gain',
                      relativeEnergy: locale === 'zh' ? '能耗降低' : 'Energy reduction',
                    }[entry.series.metric.key]
                  : ctx.width < 450
                    ? locale === 'zh'
                      ? entry.series.metric.labelZh
                      : entry.series.metric.label
                    : entry.label;
                return `${label}: ${d3.format('.3~g')(entry.value!)}${relative ? '%' : ''}`;
              })
              .each(function () {
                const box = this.getBBox();
                const x = Number(this.getAttribute('x'));
                if (box.x < 4) this.setAttribute('x', String(x + 4 - box.x));
                else if (box.x + box.width > ctx.width - 4)
                  this.setAttribute('x', String(x - (box.x + box.width - ctx.width + 4)));
              });
          };
          return (
            <section
              className="min-w-0"
              key={panel.key}
              data-testid={`measured-panel-${panel.key}`}
            >
              <Heading as="h3" level="card">
                {locale === 'zh' ? panel.labelZh : panel.label}
              </Heading>
              <div className="my-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {panel.metrics.map((metric) => {
                  const available = points.filter(
                    (point) => point.metric.key === metric.key,
                  ).length;
                  return (
                    <span
                      key={metric.key}
                      data-testid={`measured-coverage-${metric.key}`}
                      data-coverage={`${available}/${availableSourceCount}`}
                      className={`inline-flex items-center gap-1 ${available === 0 ? 'text-muted-foreground' : ''}`}
                    >
                      <svg width="28" height="10" aria-hidden="true">
                        <line
                          x1="0"
                          x2="28"
                          y1="5"
                          y2="5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={metric.dash}
                        />
                      </svg>
                      {locale === 'zh' ? metric.labelZh : metric.label}
                      {relative &&
                        available === 0 &&
                        (locale === 'zh' ? '（不可用）' : ' (unavailable)')}
                      {!relative && available < availableSourceCount && (
                        <span>
                          {locale === 'zh'
                            ? `（${availableSourceCount - available}/${availableSourceCount} 个点不可用）`
                            : `(${availableSourceCount - available}/${availableSourceCount} points unavailable)`}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              {points.length === 0 ? (
                <p className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
                  {relative ? t.relativeEmpty : t.empty}
                </p>
              ) : (
                <D3Chart<ComparisonPoint>
                  chartId={`${chartId}-${panel.key}`}
                  data={points}
                  height={440}
                  watermark="logo"
                  testId="measured-comparison-chart"
                  margin={{ top: 28, right: 18, bottom: 58, left: 65 }}
                  xScale={{ type: 'linear', domain: xDomain, nice: true }}
                  yScale={{
                    type: useLog ? 'log' : 'linear',
                    domain: yDomain,
                    nice: true,
                  }}
                  xAxis={{ label: actualXLabel, tickCount: 5 }}
                  yAxis={{ label: panel.unit, tickCount: 6 }}
                  layers={[
                    {
                      type: 'line',
                      lines,
                      config: {
                        curve: d3.curveLinear,
                        isDefined: (point) => Number.isFinite(point.y),
                        getColor: (key) => color(labels.find((entry) => entry.id === key)!.series),
                        getStrokeDasharray: (key) =>
                          labels.find((entry) => entry.id === key)!.series.metric.dash,
                      },
                    },
                    {
                      type: 'point',
                      data: points,
                      config: {
                        getCx: () => 0,
                        getCy: () => 0,
                        getX: (point) => point.x,
                        getY: (point) => point.y,
                        getRadius: () => 3,
                        getColor: (point) =>
                          color({
                            hwKey: String(point.point.hwKey),
                            overlayIndex: point.overlayIndex,
                          }),
                      },
                    },
                    {
                      type: 'custom',
                      key: 'iso',
                      render: drawIso,
                      onZoom: (group, ctx) =>
                        drawIso(group, {
                          ...ctx,
                          renderedXScale: ctx.newXScale,
                          renderedYScale: ctx.newYScale,
                        }),
                    },
                  ]}
                  onRender={({ layout }) => {
                    // Export can resize the grid; retain both panels' complete plot coordinates.
                    layout.svg.attr(
                      'viewBox',
                      `0 0 ${layout.width + layout.margin.left + layout.margin.right} ${layout.height + layout.margin.top + layout.margin.bottom}`,
                    );

                    layout.zoomGroup
                      .selectAll<SVGCircleElement, ComparisonPoint>('circle.point')
                      .attr('data-metric', (point) => point.metric.key)
                      .attr('data-source', (point) =>
                        point.overlayIndex === undefined
                          ? 'official'
                          : `overlay-${point.overlayIndex}`,
                      );
                  }}
                  zoom={{
                    enabled: true,
                    axes: 'both',
                    resetEventName: `${xField.endsWith('_intvty') ? 'interactivity' : 'latency'}_zoom_reset_${chartId}`,
                  }}
                  tooltip={{
                    attachToLayer: 1,
                    rulerType: 'crosshair',
                    getRulerX: (point, scale) => (scale as d3.ScaleLinear<number, number>)(point.x),
                    getRulerY: (point, scale) => scale(point.y),
                    content: (point) =>
                      relative
                        ? `<div class="rounded-md border bg-background p-3 text-xs">${escapeHtml(locale === 'zh' ? point.metric.labelZh : point.metric.label)}: ${point.y.toPrecision(4)}%<br>${escapeHtml(actualXLabel)}: ${point.x.toPrecision(4)}<br>${t.baseline}: ${point.relative?.baseline.toPrecision(4)}<br>${t.comparator}: ${point.relative?.comparator.toPrecision(4)}<br>${escapeHtml(sourceLabel(baselineKey))}<br>${escapeHtml(sourceLabel(comparatorKey))}</div>`
                        : `<div class="rounded-md border bg-background p-3 text-xs">${escapeHtml(hardwareLabel(String(point.point.hwKey)))} · ${escapeHtml(locale === 'zh' ? point.metric.labelZh : point.metric.label)}<br>${point.y.toPrecision(4)} ${escapeHtml(panel.unit)}<br>${escapeHtml(actualXLabel)}: ${point.x.toPrecision(4)} · C=${point.point.conc}<br>${escapeHtml(point.point.date)} · ${t.source}: ${escapeHtml(point.point.run_url ?? '—')}</div>`,
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
      <div className="w-full min-w-0 [&_ul]:grid [&_ul]:grid-cols-1 [&_ul]:gap-x-5 sm:[&_ul]:grid-cols-2 lg:[&_ul]:grid-cols-3">
        {legend}
      </div>
      <div className="overflow-hidden max-h-0">
        <div id={`${chartId}-export`} className="p-4" />
      </div>
    </div>
  );
}
