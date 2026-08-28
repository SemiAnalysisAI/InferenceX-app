'use client';

import { track } from '@/lib/analytics';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

import { getModelSortIndex } from '@/lib/constants';
import { D3Chart, type D3ChartHandle, type LayerConfig } from '@/lib/d3-chart/D3Chart';
import { renderErrorBars } from '@/lib/d3-chart/layers/error-bars';
import { renderPoints, updatePointsOnZoom } from '@/lib/d3-chart/layers/points';
import { computeTooltipPosition } from '@/lib/d3-chart/layers/scatter-points';
import {
  attachOverlayXMarkerHandlers,
  overlayMarkerPosition,
  xMarkerPath,
} from '@/lib/d3-chart/overlay-x-marker';
import { computeLeftMargin } from '@/lib/d3-chart/dynamic-margins';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import type { EvaluationChartData } from '@/components/evaluation/types';
import {
  type EvalBenchmark,
  type Precision,
  getEvalBenchmarkLabel,
  getChartWatermark,
  getPrecisionLabel,
} from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';
import ChartLegend from '@/components/ui/chart-legend';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useOverlayScopeReconciliation,
  useUnofficialRun,
} from '@/components/unofficial-run-provider';
import { useThemeColors } from '@/hooks/useThemeColors';
import { computeToggle } from '@/hooks/useTogglableSet';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';

const BASE_MARGIN = { top: 24, right: 24, bottom: 52 };
const OVERLAY_X_SIZE = 6;
const OVERLAY_X_HOVER_SIZE = 8;
const OVERLAY_HIT_RADIUS = 10;
const OVERLAY_ERROR_STROKE_WIDTH = 1.5;

const formatDateStr = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
};

const runLinkHTML = (runUrl?: string) =>
  runUrl
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">GitHub Actions Run</a>
      </div>`
    : '';

const row = (label: string, value: string) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}:</strong> ${value}</div>`;

const fmtSideTooltip = (tp: number, ep: number, dpa: boolean, nw: number) =>
  `TP ${tp}, EP ${ep}, DPA ${dpa ? 'True' : 'False'}, NW ${nw}`;

const parallelismHTML = (data: EvaluationChartData): string => {
  if (!data.disagg) {
    return (
      row('Tensor Parallelism', String(data.tp)) +
      row('Expert Parallelism', String(data.ep)) +
      row('Data Parallel Attention', data.dp_attention ? 'True' : 'False')
    );
  }
  return (
    row('Multinode', data.isMultinode ? 'True' : 'False') +
    row(
      'Prefill',
      fmtSideTooltip(
        data.prefillTp,
        data.prefillEp,
        data.prefillDpAttention,
        data.prefillNumWorkers,
      ),
    ) +
    row('Decode', fmtSideTooltip(data.tp, data.ep, data.dp_attention, data.decodeNumWorkers)) +
    row('Chips', `${data.numPrefillGpu} prefill / ${data.numDecodeGpu} decode`)
  );
};

const generateEvaluationTooltipContent = (
  data: EvaluationChartData,
  isPinned: boolean,
  unofficialBranch?: string,
): string => {
  const minScore = data.minScore ?? data.score;
  const maxScore = data.maxScore ?? data.score;
  const border = unofficialBranch ? '2px solid #dc2626' : '1px solid var(--border)';
  return `
    <div style="background: var(--popover); border: ${border}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      ${
        unofficialBranch
          ? `<div style="color: #dc2626; font-size: 10px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">✕ UNOFFICIAL RUN</div>
      ${row('Branch', unofficialBranch)}`
          : ''
      }
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${data.configLabel.replaceAll('\n', '<br>')}</div>
      ${row('Date', data.date)}
      ${row('Mean Score', data.score.toFixed(4))}
      ${row('Min Score', minScore.toFixed(4))}
      ${row('Max Score', maxScore.toFixed(4))}
      ${row('Concurrency', String(data.conc))}
      ${row('Precision', getPrecisionLabel(data.precision as Precision))}
      ${parallelismHTML(data)}
      ${runLinkHTML(data.runUrl)}
    </div>
  `;
};

/** Custom y-axis label formatting for horizontal bar chart: split on newline, show multi-line */
function formatYAxisLabels(axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) {
  axisGroup.selectAll('.tick text').each(function () {
    const el = d3.select(this);
    const label = el.text();
    const lines = label.split('\n');
    const totalHeight = lines.length * 1.1; // em units
    el.text(null);
    lines.forEach((line: string, i: number) => {
      el.append('tspan')
        .text(line)
        .attr('x', -8)
        .attr('dy', i === 0 ? `${-totalHeight / 2 + 0.9}em` : '1.1em')
        .attr('font-weight', i === 0 ? '600' : 'normal')
        .attr('font-size', i === 0 ? '10px' : '9px');
    });
    el.attr('text-anchor', 'end');
  });
}

/**
 * Measure every score label before writing any background geometry. Keeping the
 * DOM-read pass separate prevents one synchronous layout per label.
 */
export function sizeScoreLabelBackgrounds(
  labelGroups: d3.Selection<SVGGElement, EvaluationChartData, SVGGElement, unknown>,
): void {
  const measurements: { group: SVGGElement; bounds: DOMRect }[] = [];
  labelGroups.each(function () {
    const text = this.querySelector<SVGTextElement>('.score-label');
    if (text) measurements.push({ group: this, bounds: text.getBBox() });
  });

  for (const { group, bounds } of measurements) {
    d3.select(group)
      .selectAll<SVGRectElement, EvaluationChartData>('.score-label-bg')
      .data((datum) => [datum])
      .join((enter) => enter.insert('rect', ':first-child').attr('class', 'score-label-bg'))
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', 'var(--popover)')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 1)
      .attr('x', bounds.x - 5)
      .attr('y', bounds.y - 1)
      .attr('width', bounds.width + 10)
      .attr('height', bounds.height + 2);
  }
}

function renderScoreLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: EvaluationChartData[],
  showLabels: boolean,
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleBand<string>,
): void {
  const labelGroups = group
    .selectAll<SVGGElement, EvaluationChartData>('.score-label-group')
    .data(showLabels ? data : [], (datum) => datum.configLabel)
    .join((enter) => {
      const labelGroup = enter.append('g').attr('class', 'score-label-group');
      // Backgrounds are inserted only after every text node has been measured.
      labelGroup
        .append('text')
        .attr('class', 'score-label')
        .attr('text-anchor', 'start')
        .style('fill', 'var(--foreground)')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('dy', '0.35em');
      return labelGroup;
    })
    .attr(
      'transform',
      (datum) =>
        `translate(${xScale(datum.score) + 12},${
          (yScale(datum.configLabel) || 0) + yScale.bandwidth() / 2
        })`,
    );

  labelGroups.select<SVGTextElement>('.score-label').text((datum) => datum.score.toFixed(3));
  sizeScoreLabelBackgrounds(labelGroups);
}

function updateUnofficialScoreLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  showLabels: boolean,
): void {
  group
    .selectAll<SVGGElement, EvaluationChartData>('.unofficial-eval-point')
    .each(function (datum) {
      d3.select(this)
        .selectAll<SVGTextElement, EvaluationChartData>('.unofficial-score-label')
        .data(showLabels ? [datum] : [], (labelDatum) => labelDatum.configLabel)
        .join('text')
        .attr('class', 'unofficial-score-label')
        .attr('x', 12)
        .attr('text-anchor', 'start')
        .style('fill', 'var(--foreground)')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('dy', '0.35em')
        .attr('pointer-events', 'none')
        .text((labelDatum) => labelDatum.score.toFixed(3));
    });
}

const EVAL_STRINGS = {
  en: {
    showLabels: 'Show Labels',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
  },
  zh: {
    showLabels: '显示标签',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
  },
} as const;

export default function EvalBarChartD3({ caption }: { caption?: ReactNode }) {
  const {
    loading,
    error,
    chartData,
    unofficialChartData,
    unfilteredChartData,
    enabledHardware,
    toggleHardware,
    removeHardware,
    hwTypesWithData,
    selectAllHwTypes,
    highContrast,
    setHighContrast,
    showLabels,
    setShowLabels,
    highlightedConfigs,
    selectedBenchmark,
    selectedModel,
    selectedRunDate,
    availableDates,
    isLegendExpanded,
    setIsLegendExpanded,
    modelHasEvalData,
  } = useEvaluation();
  const locale = useLocale();
  const legendT = EVAL_STRINGS[locale];
  const {
    isUnofficialRun,
    unofficialRunInfo,
    unofficialRunInfos,
    activeOverlayHwTypes,
    allOverlayHwTypes,
    localOfficialOverride,
    setUnifiedOverlaySelection,
    runIndexByUrl,
  } = useUnofficialRun();
  const chartRef = useRef<D3ChartHandle>(null);

  /** Look up the branch for an eval row via its `runUrl`, falling back to the
   * first loaded run. Used so hovering an overlay bar shows that row's own
   * branch across multi-run loads. */
  const branchForRow = useCallback(
    (datum: EvaluationChartData): string | undefined => {
      const url = datum.runUrl ?? null;
      if (url) {
        const direct = runIndexByUrl[url];
        if (direct !== undefined) return unofficialRunInfos[direct]?.branch;
        const idMatch = url.match(/\/runs\/(?<runId>\d+)/u);
        if (idMatch) {
          const viaId = runIndexByUrl[idMatch[1]];
          if (viaId !== undefined) return unofficialRunInfos[viaId]?.branch;
        }
      }
      return unofficialRunInfo?.branch ?? undefined;
    },
    [runIndexByUrl, unofficialRunInfos, unofficialRunInfo],
  );
  const branchForRowRef = useRef(branchForRow);
  branchForRowRef.current = branchForRow;
  const evaluationOverlayScope = useMemo(
    () => new Set(unofficialChartData.map((datum) => String(datum.hwKey))),
    [unofficialChartData],
  );
  const evaluationScopeRegistration = useMemo(
    () =>
      isUnofficialRun
        ? {
            scopeKey: `evaluation|${selectedModel ?? ''}|${selectedBenchmark ?? ''}|${
              selectedRunDate ?? ''
            }|${unofficialRunInfos.map((run) => run.url).join(',')}`,
            officialHwTypes: hwTypesWithData,
            overlayHwTypes: evaluationOverlayScope,
            bestOfficialHwTypes: hwTypesWithData,
            bestOverlayHwTypes: evaluationOverlayScope,
            bestPerSku: false,
            ready: !loading || hwTypesWithData.size > 0,
          }
        : null,
    [
      isUnofficialRun,
      selectedModel,
      selectedBenchmark,
      selectedRunDate,
      unofficialRunInfos,
      hwTypesWithData,
      evaluationOverlayScope,
      loading,
      activeOverlayHwTypes,
      localOfficialOverride,
    ],
  );
  useOverlayScopeReconciliation(evaluationScopeRegistration);

  const effectiveOfficialHardware = localOfficialOverride ?? enabledHardware;

  const allUnifiedHwTypes = useMemo(() => {
    const all = new Set<string>();
    hwTypesWithData.forEach((hwKey) => all.add(hwKey));
    allOverlayHwTypes.forEach((hwKey) => all.add(`overlay:${hwKey}`));
    return all;
  }, [hwTypesWithData, allOverlayHwTypes]);

  const unifiedToggle = useCallback(
    (hwKey: string) => {
      const prev = new Set<string>();
      effectiveOfficialHardware.forEach((key) => prev.add(key));
      activeOverlayHwTypes.forEach((key) => prev.add(`overlay:${key}`));
      const next = computeToggle(prev, hwKey, allUnifiedHwTypes);
      const nextOfficial = new Set<string>();
      const nextOverlay = new Set<string>();
      for (const key of next) {
        if (key.startsWith('overlay:')) nextOverlay.add(key.slice(8));
        else nextOfficial.add(key);
      }
      setUnifiedOverlaySelection(nextOfficial, nextOverlay);
    },
    [
      activeOverlayHwTypes,
      allUnifiedHwTypes,
      effectiveOfficialHardware,
      setUnifiedOverlaySelection,
    ],
  );

  const handleToggleHardware = useCallback(
    (hwKey: string) => {
      if (isUnofficialRun) unifiedToggle(hwKey);
      else toggleHardware(hwKey);
    },
    [isUnofficialRun, toggleHardware, unifiedToggle],
  );

  const configurations = useMemo(() => {
    const configMap = new Map<string, { hwKey: string; configLabel: string }>();
    unfilteredChartData.forEach((data) => {
      if (!configMap.has(data.configLabel)) {
        configMap.set(data.configLabel, {
          hwKey: String(data.hwKey),
          configLabel: data.configLabel,
        });
      }
    });
    return [...configMap.values()].toSorted(
      (a, b) =>
        getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey) || a.hwKey.localeCompare(b.hwKey),
    );
  }, [unfilteredChartData]);

  const unofficialConfigurations = useMemo(() => {
    const configMap = new Map<string, { hwKey: string; configLabel: string }>();
    unofficialChartData.forEach((data) => {
      if (!configMap.has(data.configLabel)) {
        configMap.set(data.configLabel, {
          hwKey: String(data.hwKey),
          configLabel: data.configLabel,
        });
      }
    });
    return [...configMap.values()].toSorted(
      (a, b) =>
        getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey) ||
        a.hwKey.localeCompare(b.hwKey) ||
        a.configLabel.localeCompare(b.configLabel),
    );
  }, [unofficialChartData]);

  const yLabels = useMemo(() => {
    const labels = new Set<string>();
    [...chartData, ...unofficialChartData].forEach((item) => labels.add(item.configLabel));
    return [...labels];
  }, [chartData, unofficialChartData]);

  const chartMargin = useMemo(
    () => ({
      ...BASE_MARGIN,
      left: computeLeftMargin(yLabels, {
        split: 'newline',
        primaryFont: '600 10px sans-serif',
        secondaryFont: '9px sans-serif',
        minMargin: 80,
      }),
    }),
    [yLabels],
  );

  const sortedConfigLabels = useMemo(
    () => [...configurations, ...unofficialConfigurations].map((c) => c.configLabel),
    [configurations, unofficialConfigurations],
  );
  const activeHwKeys = useMemo(
    () => [
      ...configurations.filter((c) => effectiveOfficialHardware.has(c.hwKey)).map((c) => c.hwKey),
      ...unofficialConfigurations
        .filter((c) => activeOverlayHwTypes.has(c.hwKey))
        .map((c) => c.hwKey),
    ],
    [configurations, unofficialConfigurations, effectiveOfficialHardware, activeOverlayHwTypes],
  );
  const activeConfigLabels = useMemo(
    () => [
      ...configurations
        .filter((c) => effectiveOfficialHardware.has(c.hwKey))
        .map((c) => c.configLabel),
      ...unofficialConfigurations
        .filter((c) => activeOverlayHwTypes.has(c.hwKey))
        .map((c) => c.configLabel),
    ],
    [configurations, unofficialConfigurations, effectiveOfficialHardware, activeOverlayHwTypes],
  );
  const configLabelToHwKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of configurations) map.set(c.configLabel, c.hwKey);
    for (const c of unofficialConfigurations) map.set(c.configLabel, c.hwKey);
    return map;
  }, [configurations, unofficialConfigurations]);
  const hcVendorKeyFor = useCallback(
    (configLabel: string) => configLabelToHwKey.get(configLabel) ?? configLabel,
    [configLabelToHwKey],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: sortedConfigLabels,
    activeKeys: activeHwKeys,
    hcKeys: activeConfigLabels,
    hcVendorKeyFor,
  });

  useEffect(() => {
    const pinnedPoint = chartRef.current?.getPinnedPoint() as EvaluationChartData | null;
    if (!pinnedPoint) return;
    const isOverlay = chartRef.current?.getPinnedPointIsOverlay();
    if (isOverlay && !activeOverlayHwTypes.has(String(pinnedPoint.hwKey))) {
      chartRef.current?.dismissTooltip();
      return;
    }
    if (!isOverlay && !effectiveOfficialHardware.has(String(pinnedPoint.hwKey))) {
      chartRef.current?.dismissTooltip();
    }
  }, [activeOverlayHwTypes, effectiveOfficialHardware]);

  const legendItems = useMemo(
    () => [
      // Overlay legend: one entry per loaded unofficial run that contributes
      // points to the current chart. Same palette color as the chart strokes.
      ...(unofficialConfigurations.length > 0 && unofficialRunInfos.length > 0
        ? unofficialRunInfos
            .map((info, idx) => {
              const hasPoints = unofficialChartData.some(
                (d) => overlayRunIndex(d.runUrl ?? null, runIndexByUrl) === idx,
              );
              if (!hasPoints) return null;
              const branch = info.branch || `run ${info.id}`;
              return {
                name: `✕ unofficial-run-${info.id}`,
                label: `✕ ${branch}`,
                color: overlayRunColor(idx),
                title: `UNOFFICIAL: ${branch}`,
                isHighlighted: true,
                hw: `overlay-run-${info.id}`,
                isActive: true,
                onClick: () => {},
                tooltip: (
                  <div className="font-normal text-xs">
                    <div className="text-red-500 font-semibold">UNOFFICIAL RUN</div>
                    <div>Branch: {branch}</div>
                    {info.url && (
                      <a
                        href={info.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        View workflow run
                      </a>
                    )}
                  </div>
                ),
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        : []),
      ...configurations.map(({ hwKey, configLabel }) => ({
        name: configLabel,
        label: configLabel.replaceAll('\n', ' '),
        color: resolveColor(configLabel, hwKey),
        title: configLabel.replaceAll('\n', ' '),
        isHighlighted: highlightedConfigs.has(configLabel),
        hw: hwKey,
        isActive: effectiveOfficialHardware.has(hwKey),
        onClick: () => {
          handleToggleHardware(hwKey);
          track('evaluation_hw_toggled', { hw: hwKey });
        },
      })),
    ],
    [
      configurations,
      effectiveOfficialHardware,
      handleToggleHardware,
      highlightedConfigs,
      resolveColor,
      unofficialConfigurations,
      unofficialChartData,
      unofficialRunInfos,
      runIndexByUrl,
    ],
  );

  const xDomain = useMemo((): [number, number] => {
    const allData = [...chartData, ...unofficialChartData];
    if (allData.length === 0) return [0, 1];
    const xMin = d3.min(allData, (d) => d.score - (d.scoreError || 0)) || 0;
    const xMax = d3.max(allData, (d) => d.score + (d.scoreError || 0)) || 1;
    const xPadding = (xMax - xMin) * 0.3;
    return [Math.max(0, xMin - xPadding), Math.min(1, xMax + xPadding)];
  }, [chartData, unofficialChartData]);

  const chartHeight = Math.max(400, yLabels.length * 40 + chartMargin.top + chartMargin.bottom);

  const errorData = useMemo(
    () => chartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [chartData],
  );

  const hasDisaggConfigs = useMemo(
    () => [...chartData, ...unofficialChartData].some((d) => d.disagg),
    [chartData, unofficialChartData],
  );

  const parallelismKey = hasDisaggConfigs ? (
    <div className="mt-2 px-1 pr-2 text-3xs text-muted-foreground/80 leading-tight no-export">
      <div>
        <span className="font-mono">P(·/·/·/·)</span> prefill
        <span className="mx-1">·</span>
        <span className="font-mono">D(·/·/·/·)</span> decode
      </div>
      <div>
        slots: <span className="font-mono">tp/ep/dpa/nw</span>
        <span className="mx-1">·</span>
        <span className="font-mono">T</span>/<span className="font-mono">F</span> = DPA true/false
      </div>
    </div>
  ) : null;
  const unofficialErrorData = useMemo(
    () => unofficialChartData.filter((d) => d.errorMin !== undefined && d.errorMax !== undefined),
    [unofficialChartData],
  );

  const dataIdentity = useMemo(
    () =>
      JSON.stringify(
        [
          ...chartData.map((datum) => JSON.stringify(['official', datum.configLabel])),
          ...unofficialChartData.map((datum) =>
            JSON.stringify(['unofficial', datum.runUrl ?? '', datum.configLabel]),
          ),
        ].toSorted(),
      ),
    [chartData, unofficialChartData],
  );
  const metricIdentity = useMemo(
    () =>
      JSON.stringify({
        official: chartData
          .map((datum) =>
            JSON.stringify([
              datum.configLabel,
              datum.score,
              datum.errorMin ?? null,
              datum.errorMax ?? null,
            ]),
          )
          .toSorted(),
        unofficial: unofficialChartData
          .map((datum) =>
            JSON.stringify([
              datum.runUrl ?? '',
              datum.configLabel,
              datum.score,
              datum.errorMin ?? null,
              datum.errorMax ?? null,
            ]),
          )
          .toSorted(),
        xDomain,
        yLabels,
      }),
    [chartData, unofficialChartData, xDomain, yLabels],
  );
  const officialPaletteIdentity = useMemo(
    () =>
      JSON.stringify(
        chartData
          .map((datum) =>
            JSON.stringify([
              datum.configLabel,
              getCssColor(resolveColor(datum.configLabel, String(datum.hwKey))),
            ]),
          )
          .toSorted(),
      ),
    [chartData, getCssColor, resolveColor],
  );
  const unofficialPaletteIdentity = useMemo(
    () =>
      JSON.stringify(
        unofficialChartData
          .map((datum) =>
            JSON.stringify([
              datum.runUrl ?? '',
              overlayRunColor(overlayRunIndex(datum.runUrl ?? null, runIndexByUrl)),
            ]),
          )
          .toSorted(),
      ),
    [runIndexByUrl, unofficialChartData],
  );
  const displayIdentity = `${showLabels}:${officialPaletteIdentity}:${unofficialPaletteIdentity}`;
  const xScaleConfig = useMemo(() => ({ type: 'linear' as const, domain: xDomain }), [xDomain]);
  const yScaleConfig = useMemo(
    () => ({ type: 'band' as const, domain: yLabels, padding: 0.1 }),
    [yLabels],
  );
  const xAxisConfig = useMemo(
    () => ({
      label: `${getEvalBenchmarkLabel(selectedBenchmark as EvalBenchmark)} Score`,
      tickFormat: (datum: d3.AxisDomain) => Number(datum).toFixed(2),
      tickCount: 5,
    }),
    [selectedBenchmark],
  );
  const yAxisConfig = useMemo(() => ({ customize: formatYAxisLabels }), []);
  const zoomConfig = useMemo(
    () => ({
      enabled: true,
      axes: 'x' as const,
      scaleExtent: [1, 20] as [number, number],
      resetEventName: 'evaluation_zoom_reset_evaluation-chart',
      constrain: (transform: d3.ZoomTransform) => {
        const k = transform.k;
        const innerWidth =
          (typeof window === 'undefined' ? 800 : window.innerWidth) -
          chartMargin.left -
          chartMargin.right;
        const xScale = d3.scaleLinear().domain(xDomain).range([0, innerWidth]);
        const minTx = -xScale(1) * k + innerWidth;
        const maxTx = -xScale(0) * k;
        const tx = minTx < maxTx ? Math.max(minTx, Math.min(maxTx, transform.x)) : transform.x;
        return d3.zoomIdentity.translate(tx, transform.y).scale(k);
      },
    }),
    [chartMargin.left, chartMargin.right, xDomain],
  );
  const tooltipConfig = useMemo(
    () => ({
      rulerType: 'crosshair' as const,
      content: generateEvaluationTooltipContent,
      getRulerX: (
        datum: EvaluationChartData,
        scale:
          | d3.ScaleBand<string>
          | d3.ScaleLinear<number, number>
          | d3.ScaleLogarithmic<number, number>,
      ) => {
        const xScale = scale as unknown as d3.ScaleLinear<number, number>;
        return xScale(datum.score);
      },
      getRulerY: (
        datum: EvaluationChartData,
        scale: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>,
      ) => {
        const bandScale = scale as unknown as d3.ScaleBand<string>;
        return (bandScale(datum.configLabel) || 0) + bandScale.bandwidth() / 2;
      },
      onHoverStart: (
        selection: d3.Selection<SVGCircleElement, EvaluationChartData, SVGGElement, unknown>,
      ) => selection.attr('r', 8),
      onHoverEnd: (
        selection: d3.Selection<SVGCircleElement, EvaluationChartData, SVGGElement, unknown>,
      ) => selection.attr('r', 6),
      attachToLayer: 1,
    }),
    [],
  );

  // Horizontal bar chart: yScale = band (config labels), xScale = linear (scores)
  const layers = useMemo(
    (): LayerConfig<EvaluationChartData>[] => [
      {
        type: 'custom',
        key: 'error-bars',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          // Horizontal error bars: swap x/y semantics
          // getCx = y center, getYMin = x left, getYMax = x right, capWidth = vertical cap height
          renderErrorBars(group, errorData, {
            getCx: (d: EvaluationChartData) =>
              (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2,
            getYMin: (d: EvaluationChartData) => xScale(d.errorMin!),
            getYMax: (d: EvaluationChartData) => xScale(d.errorMax!),
            capWidth: yScale.bandwidth() / 3,
            stroke: 'var(--foreground)',
          });
          // Rotate error bars 90 degrees — the render draws vertical, we need horizontal.
          // Instead, manually position: stem is horizontal, caps are vertical.
          const bars = group.selectAll<SVGGElement, EvaluationChartData>('.error-bar');
          bars
            .select('.eb-stem')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);
          const capH = yScale.bandwidth() / 6;
          bars
            .select('.eb-cap-top')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
          bars
            .select('.eb-cap-bot')
            .attr('x1', (d) => xScale(d.errorMax!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
        onZoom: (group, ctx) => {
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          const yScale = ctx.yScale as d3.ScaleBand<string>;
          const bars = group.selectAll<SVGGElement, EvaluationChartData>('.error-bar');
          bars
            .select('.eb-stem')
            .attr('x1', (d) => newXScale(d.errorMin!))
            .attr('x2', (d) => newXScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);
          const capH = yScale.bandwidth() / 6;
          bars
            .select('.eb-cap-top')
            .attr('x1', (d) => newXScale(d.errorMin!))
            .attr('x2', (d) => newXScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
          bars
            .select('.eb-cap-bot')
            .attr('x1', (d) => newXScale(d.errorMax!))
            .attr('x2', (d) => newXScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
      },
      {
        type: 'custom',
        key: 'mean-points',
        displayIdentity: officialPaletteIdentity,
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          return renderPoints(group, chartData, {
            getCx: (d: EvaluationChartData) => xScale(d.score),
            getCy: (d: EvaluationChartData) =>
              (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2,
            getColor: (d: EvaluationChartData) =>
              getCssColor(resolveColor(d.configLabel, d.hwKey as string)),
            getRadius: () => 6,
            stroke: 'none',
            strokeWidth: 0,
          });
        },
        onDisplayUpdate: (group) => {
          group
            .selectAll<SVGCircleElement, EvaluationChartData>('.point')
            .attr('fill', (datum) =>
              getCssColor(resolveColor(datum.configLabel, String(datum.hwKey))),
            );
        },
        onZoom: (group, ctx) => {
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          const yScale = ctx.yScale as d3.ScaleBand<string>;
          updatePointsOnZoom<EvaluationChartData>(
            group,
            (d) => newXScale(d.score),
            (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2,
          );
        },
      },
      {
        type: 'custom',
        key: 'unofficial-error-bars',
        render: (group, { xScale: xs, yScale: ys }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          const capH = yScale.bandwidth() / 6;

          const bars = group
            .selectAll<SVGGElement, EvaluationChartData>('.unofficial-error-bar')
            .data(unofficialErrorData, (datum) => `${datum.runUrl ?? ''}|${datum.configLabel}`)
            .join((enter) => {
              const bar = enter.append('g').attr('class', 'unofficial-error-bar');
              bar
                .append('line')
                .attr('class', 'unofficial-eb-stem')
                .attr('stroke-width', OVERLAY_ERROR_STROKE_WIDTH);
              bar
                .append('line')
                .attr('class', 'unofficial-eb-cap-top')
                .attr('stroke-width', OVERLAY_ERROR_STROKE_WIDTH);
              bar
                .append('line')
                .attr('class', 'unofficial-eb-cap-bot')
                .attr('stroke-width', OVERLAY_ERROR_STROKE_WIDTH);
              return bar;
            });

          bars.style('filter', null);
          bars
            .selectAll<SVGLineElement, EvaluationChartData>(
              '.unofficial-eb-stem, .unofficial-eb-cap-top, .unofficial-eb-cap-bot',
            )
            .attr('stroke', (d) =>
              overlayRunColor(overlayRunIndex(d.runUrl ?? null, runIndexByUrl)),
            );

          bars
            .select('.unofficial-eb-stem')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);

          bars
            .select('.unofficial-eb-cap-top')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);

          bars
            .select('.unofficial-eb-cap-bot')
            .attr('x1', (d) => xScale(d.errorMax!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
        onZoom: (group, { newXScale, yScale: ys }) => {
          const xScale = newXScale as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          const capH = yScale.bandwidth() / 6;
          const bars = group.selectAll<SVGGElement, EvaluationChartData>('.unofficial-error-bar');

          bars
            .select('.unofficial-eb-stem')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2);

          bars
            .select('.unofficial-eb-cap-top')
            .attr('x1', (d) => xScale(d.errorMin!))
            .attr('x2', (d) => xScale(d.errorMin!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);

          bars
            .select('.unofficial-eb-cap-bot')
            .attr('x1', (d) => xScale(d.errorMax!))
            .attr('x2', (d) => xScale(d.errorMax!))
            .attr('y1', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 - capH)
            .attr('y2', (d) => (yScale(d.configLabel) || 0) + yScale.bandwidth() / 2 + capH);
        },
      },
      {
        type: 'custom',
        key: 'score-labels',
        displayIdentity: showLabels ? 'visible' : 'hidden',
        render: (group, { xScale: xs, yScale: ys }) => {
          renderScoreLabels(
            group,
            chartData,
            showLabels,
            xs as d3.ScaleLinear<number, number>,
            ys as d3.ScaleBand<string>,
          );
        },
        onDisplayUpdate: (group, ctx) => {
          const baseXScale = ctx.xScale as d3.ScaleLinear<number, number>;
          const svgNode = ctx.layout.svg.node();
          const currentXScale = svgNode
            ? d3.zoomTransform(svgNode).rescaleX(baseXScale)
            : baseXScale;
          renderScoreLabels(
            group,
            chartData,
            showLabels,
            currentXScale,
            ctx.yScale as d3.ScaleBand<string>,
          );
        },
        onZoom: (group, ctx) => {
          if (!showLabels) return;
          const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
          const yScale = ctx.yScale as d3.ScaleBand<string>;
          group
            .selectAll<SVGGElement, EvaluationChartData>('.score-label-group')
            .attr(
              'transform',
              (datum) =>
                `translate(${newXScale(datum.score) + 12},${
                  (yScale(datum.configLabel) || 0) + yScale.bandwidth() / 2
                })`,
            );
        },
      },
      {
        type: 'custom',
        key: 'unofficial-overlay',
        displayIdentity: `${showLabels}:${unofficialPaletteIdentity}`,
        render: (group, { xScale: xs, yScale: ys, layout }) => {
          const xScale = xs as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          const svgNode = layout.svg.node();
          const tooltipNode = svgNode?.nextElementSibling as HTMLDivElement | null;
          const container = svgNode?.parentElement as HTMLDivElement | null;
          if (!svgNode || !tooltipNode || !container) return;

          const tooltip = d3.select(tooltipNode);
          const overlayPoints = group
            .selectAll<SVGGElement, EvaluationChartData>('.unofficial-eval-point')
            .data(unofficialChartData, (datum) => `${datum.runUrl ?? ''}|${datum.configLabel}`)
            .join((enter) => {
              const g = enter.append('g').attr('class', 'unofficial-eval-point');
              g.append('circle')
                .attr('r', OVERLAY_HIT_RADIUS)
                .attr('fill', 'transparent')
                .attr('cursor', 'pointer');
              g.append('path')
                .attr('class', 'unofficial-eval-x')
                .attr('d', xMarkerPath(OVERLAY_X_SIZE))
                .attr('fill', 'none')
                .attr('stroke-width', 2.5)
                .attr('stroke-linecap', 'round')
                .attr('cursor', 'pointer');
              return g;
            });

          overlayPoints.attr(
            'transform',
            (d) =>
              `translate(${xScale(d.score)},${(yScale(d.configLabel) || 0) + yScale.bandwidth() / 2})`,
          );
          overlayPoints.style('filter', null);

          overlayPoints
            .select('.unofficial-eval-x')
            .attr('stroke', (d) =>
              overlayRunColor(overlayRunIndex(d.runUrl ?? null, runIndexByUrl)),
            );

          updateUnofficialScoreLabels(group, showLabels);

          attachOverlayXMarkerHandlers(overlayPoints, {
            markerSelector: '.unofficial-eval-x',
            normalPath: xMarkerPath(OVERLAY_X_SIZE),
            hoverPath: xMarkerPath(OVERLAY_X_HOVER_SIZE),
            tooltip,
            handle: chartRef.current,
            content: (datum, pinned) =>
              generateEvaluationTooltipContent(datum, pinned, branchForRowRef.current(datum)),
            position: (event) => {
              const [mouseX, mouseY] = d3.pointer(event, container);
              return computeTooltipPosition(mouseX, mouseY, tooltip, container);
            },
            rulers: {
              show: (datum, marker) => {
                const position = overlayMarkerPosition(marker) ?? {
                  x: xScale(datum.score),
                  y: (yScale(datum.configLabel) || 0) + yScale.bandwidth() / 2,
                };
                group.select('.ruler-group').style('display', 'block');
                group.select('.vertical-ruler').attr('x1', position.x).attr('x2', position.x);
                group.select('.horizontal-ruler').attr('y1', position.y).attr('y2', position.y);
              },
              hide: () => group.select('.ruler-group').style('display', 'none'),
            },
          });
        },
        onDisplayUpdate: (group) => {
          group
            .selectAll<SVGGElement, EvaluationChartData>('.unofficial-eval-point')
            .select('.unofficial-eval-x')
            .attr('stroke', (datum) =>
              overlayRunColor(overlayRunIndex(datum.runUrl ?? null, runIndexByUrl)),
            );
          updateUnofficialScoreLabels(group, showLabels);
        },
        onZoom: (group, { newXScale, yScale: ys }) => {
          const xScale = newXScale as d3.ScaleLinear<number, number>;
          const yScale = ys as d3.ScaleBand<string>;
          group
            .selectAll<SVGGElement, EvaluationChartData>('.unofficial-eval-point')
            .attr(
              'transform',
              (d) =>
                `translate(${xScale(d.score)},${(yScale(d.configLabel) || 0) + yScale.bandwidth() / 2})`,
            );
        },
      },
    ],
    [
      chartData,
      errorData,
      getCssColor,
      officialPaletteIdentity,
      resolveColor,
      showLabels,
      unofficialChartData,
      unofficialErrorData,
      unofficialPaletteIdentity,
      runIndexByUrl,
    ],
  );

  // Show skeleton on first load
  const isInitializing = loading || (!selectedBenchmark && !error);
  if (isInitializing && chartData.length === 0 && unofficialChartData.length === 0) {
    return (
      <div className="p-3">
        <Skeleton className="h-7 w-2/4 mb-1" />
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || (chartData.length === 0 && unofficialChartData.length === 0)) {
    const hasSelections = selectedBenchmark && selectedModel && selectedRunDate;
    const hasNoEvalDataForDate =
      hasSelections && availableDates.length > 0 && !availableDates.includes(selectedRunDate);
    return (
      <div className="flex items-center justify-center h-100 text-muted-foreground">
        <div className="text-center">
          {error ? (
            'Failed to load eval data.'
          ) : hasSelections && !modelHasEvalData ? (
            'No evaluation data is available for this model.'
          ) : hasNoEvalDataForDate ? (
            <>
              <div>No evaluation data available for {formatDateStr(selectedRunDate)}.</div>
              <div>Try selecting a different date.</div>
            </>
          ) : (
            <>
              <div>No evaluation data available for selected model and benchmark combination.</div>
              <div>Try selecting a different combination.</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <D3Chart<EvaluationChartData>
      ref={chartRef}
      chartId="evaluation-chart"
      data={chartData}
      dataIdentity={dataIdentity}
      metricIdentity={metricIdentity}
      displayIdentity={displayIdentity}
      height={chartHeight}
      margin={chartMargin}
      watermark={getChartWatermark(isUnofficialRun)}
      grabCursor={false}
      caption={caption}
      xScale={xScaleConfig}
      yScale={yScaleConfig}
      xAxis={xAxisConfig}
      yAxis={yAxisConfig}
      layers={layers}
      zoom={zoomConfig}
      tooltip={tooltipConfig}
      legendElement={
        <ChartLegend
          variant="sidebar"
          legendItems={legendItems}
          onItemRemove={removeHardware}
          isLegendExpanded={isLegendExpanded}
          onExpandedChange={(expanded) => {
            setIsLegendExpanded(expanded);
            track('evaluation_legend_expanded', { expanded });
          }}
          switches={[
            {
              id: 'eval-show-labels',
              label: legendT.showLabels,
              checked: showLabels,
              onCheckedChange: (checked) => {
                setShowLabels(checked);
                track('evaluation_show_labels_toggled', { enabled: checked });
              },
            },
            {
              id: 'eval-high-contrast',
              label: legendT.highContrast,
              checked: highContrast,
              onCheckedChange: (checked) => {
                setHighContrast(checked);
                track('evaluation_high_contrast_toggled', { enabled: checked });
              },
            },
          ]}
          actions={
            effectiveOfficialHardware.size < hwTypesWithData.size ||
            activeOverlayHwTypes.size < allOverlayHwTypes.size
              ? [
                  {
                    id: 'eval-reset-filter',
                    label: legendT.resetFilter,
                    onClick: () => {
                      selectAllHwTypes();
                      setUnifiedOverlaySelection(hwTypesWithData, allOverlayHwTypes);
                      track('evaluation_filter_reset');
                    },
                  },
                ]
              : []
          }
          enableTooltips={true}
          keyIndicators={parallelismKey}
        />
      }
    />
  );
}
