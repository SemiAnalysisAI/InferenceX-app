'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import { useEffect, useMemo, useRef } from 'react';
import { useLocale } from '@/lib/use-locale';

import type { HardwareConfig } from '@/components/inference/types';
import { getHardwareConfig } from '@/lib/constants';
import { getChartWatermark } from '@/lib/data-mappings';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { contrastColors } from '@/lib/d3-chart/contrast-colors';
import { computeLeftMargin, measureTextWidth } from '@/lib/d3-chart/dynamic-margins';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  HorizontalBarLayerConfig,
  RenderContext,
} from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { escapeHtml, getDisplayLabel } from '@/lib/utils';

import type {
  BarMetric,
  CalculatorMode,
  CostProvider,
  CostType,
  InterpolatedResult,
} from './types';

/**
 * Overlay-only tooltip strings. The rest of the tooltip is English-only today;
 * these are new user-visible strings, so they ship with a Chinese version.
 */
const OVERLAY_STRINGS = {
  en: {
    unofficialRun: 'UNOFFICIAL RUN',
    branch: 'Branch',
    viewRun: 'View workflow run',
    clamped: 'Outside measured range — showing nearest data point',
  },
  zh: {
    unofficialRun: '非官方运行',
    branch: '分支',
    viewRun: '查看工作流运行',
    clamped: '超出实测范围——显示最接近的数据点',
  },
} as const;

export type OverlayTooltipStrings = (typeof OVERLAY_STRINGS)[keyof typeof OVERLAY_STRINGS];

interface ThroughputBarChartProps {
  results: InterpolatedResult[];
  hardwareConfig: HardwareConfig;
  mode: CalculatorMode;
  targetValue: number;
  barMetric: BarMetric;
  costType: CostType;
  runUrl?: string;
  selectedBars: Set<string>;
  onBarSelect: (resultKey: string) => void;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  /** Optional color resolver — when provided, overrides static hardware config colors. */
  colorResolver?: (hwKey: string) => string;
}

/** Get the throughput value for the selected token type. */
export function getThroughputForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTputValue;
  if (costType === 'output') return d.outputTputValue;
  return d.value; // total
}

/** Get the tok/s/MW value for the selected token type. */
export function getTpPerMwForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.inputTpPerMw;
  if (costType === 'output') return d.outputTpPerMw;
  return d.tpPerMw; // total
}

export function getMetricValue(
  d: InterpolatedResult,
  barMetric: BarMetric,
  costType: CostType,
): number {
  switch (barMetric) {
    case 'power': {
      return getTpPerMwForType(d, costType);
    }
    case 'cost': {
      return getCostForType(d, costType);
    }
    default: {
      return getThroughputForType(d, costType);
    }
  }
}

export function getMetricLabel(
  barMetric: BarMetric,
  mode: CalculatorMode,
  costType: CostType,
): string {
  const tokenTypePrefix = costType === 'input' ? 'Input ' : costType === 'output' ? 'Output ' : '';
  switch (barMetric) {
    case 'power': {
      return `${tokenTypePrefix}Tokens per Provisioned All-in Megawatt (tok/s/MW)`;
    }
    case 'cost': {
      return `Cost ($${getCostTypeLabel(costType)})`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${tokenTypePrefix}Throughput per Chip (tok/s/chip)`
        : 'Interactivity (tok/s/user)';
    }
  }
}

export function getValueLabel(
  d: InterpolatedResult,
  barMetric: BarMetric,
  mode: CalculatorMode,
  costType: CostType,
): string {
  switch (barMetric) {
    case 'power': {
      return `${getTpPerMwForType(d, costType).toFixed(0)} tok/s/MW`;
    }
    case 'cost': {
      return `$${getCostForType(d, costType).toFixed(3)}${getCostTypeLabel(costType)}`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${getThroughputForType(d, costType).toFixed(1)} tok/s/chip`
        : `${getThroughputForType(d, costType).toFixed(1)} tok/s/user`;
    }
  }
}

export function getCostProviderLabel(provider: CostProvider): string {
  switch (provider) {
    case 'costh': {
      return 'Owning - Hyperscaler';
    }
    case 'costn': {
      return 'Owning - Neocloud';
    }
    case 'costr': {
      return 'Renting - 3yr Rental';
    }
  }
}

export function getChartTitle(
  barMetric: BarMetric,
  mode: CalculatorMode,
  targetValue: number,
  costType: CostType,
  costProvider?: CostProvider,
  interactivityPercentile?: string,
): string {
  const percentilePrefix = interactivityPercentile
    ? `${interactivityPercentile.toUpperCase()} `
    : '';
  const targetLabel =
    mode === 'interactivity_to_throughput'
      ? `${targetValue} tok/s/user ${percentilePrefix}Interactivity`
      : `${targetValue} tok/s/chip Throughput`;

  const tokenTypeLabel =
    costType === 'input' ? 'Input' : costType === 'output' ? 'Output' : 'Total';

  switch (barMetric) {
    case 'power': {
      return `${tokenTypeLabel} Tokens per Provisioned All-in Megawatt at ${targetLabel}`;
    }
    case 'cost': {
      const providerLabel = getCostProviderLabel(costProvider || 'costh');
      return `Cost per Million ${tokenTypeLabel} Tokens (${providerLabel}) at ${targetLabel}`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${tokenTypeLabel} Token Throughput per Chip at ${targetLabel}`
        : `Interactivity at ${targetLabel}`;
    }
  }
}

export function getSortedResults(
  results: InterpolatedResult[],
  barMetric: BarMetric,
  costType: CostType,
): InterpolatedResult[] {
  const sorted = [...results];
  switch (barMetric) {
    case 'power': {
      // Most efficient first (descending)
      sorted.sort((a, b) => getTpPerMwForType(b, costType) - getTpPerMwForType(a, costType));
      return sorted;
    }
    case 'cost': {
      // Cheapest first (ascending cost)
      sorted.sort((a, b) => getCostForType(a, costType) - getCostForType(b, costType));
      return sorted;
    }
    default: {
      // Highest throughput first (descending, using token-type-appropriate value)
      sorted.sort((a, b) => getThroughputForType(b, costType) - getThroughputForType(a, costType));
      return sorted;
    }
  }
}

export function getCostForType(d: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return d.costInput;
  if (costType === 'output') return d.costOutput;
  return d.cost;
}

export function getCostTypeLabel(costType: CostType): string {
  if (costType === 'input') return '/M input tok';
  if (costType === 'output') return '/M output tok';
  return '/M tok';
}

/**
 * Display label for a result: `B300`, `B300 (FP4)` when multiple precisions are
 * selected, and `B300 (✕ my-branch)` / `B300 (FP4 · ✕ my-branch)` for an
 * unofficial-run overlay bar.
 *
 * The suffix always stays inside one pair of parens so the y-axis customizer
 * `twoRowYAxisLabels({ split: 'parens' })` keeps splitting it into two rows.
 */
export function getResultLabel(d: InterpolatedResult, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[d.hwKey] || getHardwareConfig(d.hwKey);
  const baseName = config ? getDisplayLabel(config) : d.hwKey;
  const parts: string[] = [];
  if (d.precision) parts.push(d.precision.toUpperCase());
  if (d.isOverlay) parts.push(`✕ ${d.runLabel ?? 'unofficial'}`);
  return parts.length > 0 ? `${baseName} (${parts.join(' · ')})` : baseName;
}

export function generateTooltipHTML(
  d: InterpolatedResult,
  hardwareConfig: HardwareConfig,
  mode: CalculatorMode,
  barMetric: BarMetric,
  costType: CostType,
  runUrl?: string,
  isPinned?: boolean,
  overlayStrings: OverlayTooltipStrings = OVERLAY_STRINGS.en,
): string {
  // Everything interpolated below is escaped if it can carry text this codebase
  // did not author — today that is the overlay branch name and run URL, which
  // come from the GitHub API for whatever run id the user pasted.
  const label = escapeHtml(getResultLabel(d, hardwareConfig));
  const costLabel = getCostTypeLabel(costType);
  const costValue = getCostForType(d, costType);

  const tokenTypePrefix = costType === 'input' ? 'Input ' : costType === 'output' ? 'Output ' : '';
  const metricName =
    barMetric === 'power'
      ? 'tok/s/MW'
      : barMetric === 'cost'
        ? 'Cost'
        : mode === 'interactivity_to_throughput'
          ? `${tokenTypePrefix}Throughput`
          : 'Interactivity';
  const metricUnit =
    barMetric === 'power'
      ? 'tok/s/MW'
      : barMetric === 'cost'
        ? costLabel
        : mode === 'interactivity_to_throughput'
          ? 'tok/s/chip'
          : 'tok/s/user';
  const metricValue = getMetricValue(d, barMetric, costType);

  // Get parallelism info from nearest data points
  const nearest = d.nearestPoints[0];
  const tp = nearest?.tp ?? 0;
  const ep = nearest?.ep;
  const dpAttn = nearest?.dp_attention;
  const precision = nearest?.precision ?? '';
  const disagg = nearest?.disagg;

  let parallelismHtml: string;
  if (ep !== null && ep !== undefined && ep > 1 && tp === ep) {
    parallelismHtml = `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Parallelism:</strong> ${dpAttn ? 'DEP' : 'TEP'}${tp}</div>`;
  } else if (ep !== null && ep !== undefined && ep > 1) {
    parallelismHtml = `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>TP:</strong> ${tp}, <strong>EP:</strong> ${ep}${dpAttn ? ', <strong>DPA:</strong> True' : ''}</div>`;
  } else {
    parallelismHtml = `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>TP:</strong> ${tp}${dpAttn ? ', <strong>DPA:</strong> True' : ''}</div>`;
  }

  const metricDisplay =
    barMetric === 'cost'
      ? `$${metricValue.toFixed(3)}${metricUnit}`
      : `${metricValue.toFixed(barMetric === 'power' ? 0 : 1)} ${metricUnit}`;

  // Overlay bars link to their own workflow run, not the official run behind
  // the DB data — the two are unrelated.
  const effectiveRunUrl = d.isOverlay ? d.runUrl : runUrl;
  const runLinkLabel = d.isOverlay ? overlayStrings.viewRun : 'View raw result on GitHub';
  const runLinkHtml = effectiveRunUrl
    ? `<div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;"><a href="${escapeHtml(effectiveRunUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-size: 11px; text-decoration: underline; cursor: pointer;">${runLinkLabel} &#8599;</a></div>`
    : '';

  // The target can sit outside a given series' measured range — series ranges
  // differ, and a loaded unofficial run widens the slider to cover its own
  // operating points. Say so rather than letting a clamped edge value read as a
  // measurement at the current target.
  const clampedHtml = d.clamped
    ? `<div style="color: var(--muted-foreground); font-size: 10px; font-style: italic; margin-bottom: 4px;">${overlayStrings.clamped}</div>`
    : '';

  const overlayBranchHtml =
    d.isOverlay && d.runLabel
      ? `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${overlayStrings.branch}:</strong> ${escapeHtml(d.runLabel)}</div>`
      : '';
  const overlayHeaderHtml = d.isOverlay
    ? `<div style="color: var(--destructive, #ef4444); font-size: 11px; font-weight: 600; margin-bottom: 4px;">${overlayStrings.unofficialRun}</div>${overlayBranchHtml}`
    : '';

  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 320px; pointer-events: auto; user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      ${overlayHeaderHtml}
      <div style="color: var(--foreground); font-size: 13px; font-weight: 600; margin-bottom: 8px;">
        ${label}
      </div>
      ${clampedHtml}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${metricName}:</strong> ${metricDisplay}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Cost:</strong> $${costValue.toFixed(3)}${costLabel}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>tok/s/MW:</strong> ${getTpPerMwForType(d, costType).toFixed(0)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ~${d.concurrency}
      </div>
      ${precision ? `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Precision:</strong> ${escapeHtml(precision.toUpperCase())}</div>` : ''}
      ${parallelismHtml}
      ${disagg ? '<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>Disaggregated:</strong> Yes</div>' : ''}
      ${runLinkHtml}
    </div>
  `;
}

// ── Helpers at module scope for use in memos and layers ──

const getLabel = getResultLabel;

function getColor(): string {
  return 'var(--foreground)';
}

/** Position value + overlay labels together, flipping both when the longer one doesn't fit. */
function positionLabelPairs(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  chartWidth: number,
  barMetric: BarMetric,
  costType: CostType,
  getBarColor: (d: InterpolatedResult) => string,
) {
  const valueLabels = group.selectAll<SVGTextElement, InterpolatedResult>('.value-label');
  const overlayLabels = group.selectAll<SVGTextElement, InterpolatedResult>('.overlay-label');

  // Build a map of max text width per resultKey (pretext, no reflow)
  const maxWidths = new Map<string, number>();
  valueLabels.each(function (d) {
    const text = d3.select(this).text();
    maxWidths.set(d.resultKey, measureTextWidth(text, '600 12px sans-serif'));
  });
  overlayLabels.each(function (d) {
    const text = d3.select(this).text();
    const prev = maxWidths.get(d.resultKey) ?? 0;
    maxWidths.set(d.resultKey, Math.max(prev, measureTextWidth(text, '500 10px sans-serif')));
  });

  const apply = (sel: d3.Selection<SVGTextElement, InterpolatedResult, SVGGElement, unknown>) => {
    sel.each(function (d) {
      const barEnd = xScale(getMetricValue(d, barMetric, costType));
      const maxW = maxWidths.get(d.resultKey) ?? 0;
      const fitsInside = barEnd > maxW + 24;
      const fill = fitsInside ? contrastColors(getBarColor(d)) : 'var(--foreground)';
      d3.select(this)
        .attr('x', fitsInside ? barEnd - 10 : barEnd + 6)
        .attr('text-anchor', fitsInside ? 'end' : 'start')
        .style('fill', fill)
        .attr('stroke', null)
        .attr('visibility', barEnd < 0 || barEnd > chartWidth ? 'hidden' : 'visible');
    });
  };

  apply(valueLabels);
  apply(overlayLabels);
}

export default function ThroughputBarChart({
  results,
  hardwareConfig,
  mode,
  barMetric,
  costType,
  runUrl,
  selectedBars,
  onBarSelect,
  legendElement,
  caption,
  colorResolver,
}: ThroughputBarChartProps) {
  const chartRef = useRef<D3ChartHandle>(null);
  const locale = useLocale();

  // Color resolution: unofficial-run overlay bars take the run's palette color
  // (so they match the banner + legend swatch — see lib/overlay-run-style.ts);
  // official bars prefer the dynamic colorResolver, falling back to static config.
  const resolveBarColor = (d: InterpolatedResult) =>
    d.isOverlay
      ? overlayRunColor(d.runIndex ?? 0)
      : colorResolver
        ? colorResolver(d.hwKey)
        : getColor();

  // Stable refs to avoid re-running the D3 effect
  const hoveredBarXRef = useRef(0);
  const selectedBarsRef = useRef(selectedBars);
  selectedBarsRef.current = selectedBars;

  const onBarSelectRef = useRef(onBarSelect);
  onBarSelectRef.current = onBarSelect;

  const sortedResults = useMemo(
    () => getSortedResults(results, barMetric, costType),
    [results, barMetric, costType],
  );

  // Dynamic height based on bar count
  const dynamicHeight = useMemo(() => {
    const barCount = sortedResults.length || 1;
    return Math.max(600, barCount * 55 + 120);
  }, [sortedResults.length]);

  // Dynamic left margin: measure longest Y-axis label via pretext
  const dynamicMargin = useMemo(() => {
    if (sortedResults.length === 0) return { top: 20, right: 20, bottom: 60, left: 80 };
    const labels = sortedResults.map((r) => getLabel(r, hardwareConfig));
    return {
      top: 20,
      right: 20,
      bottom: 60,
      left: computeLeftMargin(labels, { split: 'parens', minMargin: 80, padding: 12 }),
    };
  }, [sortedResults, hardwareConfig]);

  // X domain
  const maxBarValue = useMemo(() => {
    const max = d3.max(sortedResults, (d) => getMetricValue(d, barMetric, costType)) || 1;
    return max * 1.15;
  }, [sortedResults, barMetric, costType]);

  // Y domain — reversed because useD3ChartRenderer builds band scale with range [height, 0]
  const yDomain = useMemo(
    () => [...sortedResults].toReversed().map((r) => r.resultKey),
    [sortedResults],
  );

  // ── Layers ──

  const layers = useMemo(() => {
    const barLayer: HorizontalBarLayerConfig<InterpolatedResult> = {
      type: 'horizontalBar',
      key: 'bars',
      data: sortedResults,
      config: {
        getY: (d) => d.resultKey,
        getX: (d) => getMetricValue(d, barMetric, costType),
        getColor: (d) => resolveBarColor(d),
        rx: 4,
        opacity: 0.85,
        keyFn: (d) => d.resultKey,
      },
    };

    // Combined label layer — value + overlay labels flip inside/outside together
    const labelLayer: CustomLayerConfig = {
      type: 'custom',
      key: 'bar-labels',
      render: (zoomGroup, ctx) => {
        const xScale = ctx.xScale as d3.ScaleLinear<number, number>;
        const yScale = ctx.yScale as d3.ScaleBand<string>;

        // Render value labels
        zoomGroup
          .selectAll<SVGTextElement, InterpolatedResult>('.value-label')
          .data(sortedResults, (d) => d.resultKey)
          .join('text')
          .attr('class', 'value-label')
          .attr('y', (d) => (yScale(d.resultKey) ?? 0) + yScale.bandwidth() / 2 - 6)
          .attr('dy', '0.35em')
          .attr('font-size', '12px')
          .attr('font-weight', '600')
          .style('fill', 'var(--foreground)')
          .style('pointer-events', 'none')
          .text((d) => getValueLabel(d, barMetric, mode, costType));

        // Render overlay labels
        zoomGroup
          .selectAll<SVGTextElement, InterpolatedResult>('.overlay-label')
          .data(sortedResults, (d) => d.resultKey)
          .join('text')
          .attr('class', 'overlay-label')
          .attr('y', (d) => (yScale(d.resultKey) ?? 0) + yScale.bandwidth() / 2 + 8)
          .attr('dy', '0.35em')
          .attr('font-size', '10px')
          .attr('font-weight', '500')
          .style('fill', 'var(--muted-foreground)')
          .style('pointer-events', 'none')
          .text((d) => {
            if (barMetric === 'cost') {
              return mode === 'interactivity_to_throughput'
                ? `${getThroughputForType(d, costType).toFixed(1)} tok/s/chip`
                : `${getThroughputForType(d, costType).toFixed(1)} tok/s/user`;
            }
            const costLbl = getCostTypeLabel(costType);
            return `$${getCostForType(d, costType).toFixed(3)}${costLbl}`;
          });

        // Position both labels together using the longer text width
        const barColor = (d: InterpolatedResult) => resolveBarColor(d);
        positionLabelPairs(zoomGroup, xScale, ctx.width, barMetric, costType, barColor);
      },
      onZoom: (zoomGroup, ctx) => {
        const newXScale = ctx.newXScale as d3.ScaleLinear<number, number>;
        const barColor = (d: InterpolatedResult) => resolveBarColor(d);
        positionLabelPairs(zoomGroup, newXScale, ctx.width, barMetric, costType, barColor);
      },
    };

    return [barLayer, labelLayer];
  }, [sortedResults, barMetric, costType, hardwareConfig, mode, colorResolver]);

  // ── Tooltip ──

  const tooltip = useMemo(
    () => ({
      rulerType: 'vertical' as const,
      content: (d: InterpolatedResult, isPinned: boolean) =>
        generateTooltipHTML(
          d,
          hardwareConfig,
          mode,
          barMetric,
          costType,
          runUrl,
          isPinned,
          OVERLAY_STRINGS[locale],
        ),
      getRulerX: () => hoveredBarXRef.current,
      onHoverStart: (sel: d3.Selection<any, InterpolatedResult, any, any>) => {
        hoveredBarXRef.current = parseFloat(sel.attr('width') || '0');
        const hasSelection = selectedBarsRef.current.size > 0;
        if (!hasSelection) {
          sel.attr('opacity', 1).attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
        }
      },
      onHoverEnd: (sel: d3.Selection<any, InterpolatedResult, any, any>, d: InterpolatedResult) => {
        const hasSelection = selectedBarsRef.current.size > 0;
        const isSelected = selectedBarsRef.current.has(d.resultKey);
        sel
          .attr('opacity', hasSelection ? (isSelected ? 0.95 : 0.15) : 0.85)
          .attr('stroke', 'none');
      },
      onPointClick: (d: InterpolatedResult) => {
        onBarSelectRef.current(d.resultKey);
        track('calculator_bar_selected', { gpu: d.hwKey, precision: d.precision });
      },
      attachToLayer: 0,
    }),
    [hardwareConfig, mode, barMetric, costType, runUrl, locale],
  );

  // ── Y axis customize: map resultKey → display label, then split into two-line GPU labels ──

  const yAxisConfig = useMemo(() => {
    const labelMap = new Map(sortedResults.map((r) => [r.resultKey, getLabel(r, hardwareConfig)]));
    return {
      tickFormat: (d: d3.AxisDomain) => labelMap.get(String(d)) ?? String(d),
      customize: twoRowYAxisLabels({ split: 'parens' }),
    };
  }, [sortedResults, hardwareConfig]);

  const xAxisConfig = useMemo(() => ({ tickCount: 6 }), []);

  // ── onRender: x-axis label + initial selection opacities ──

  const onRender = useMemo(
    () => (ctx: RenderContext) => {
      const { layout, width, height } = ctx;
      // X axis label
      let xLabelEl = layout.g.select<SVGTextElement>('.x-axis-label-calc');
      if (xLabelEl.empty()) {
        xLabelEl = layout.g.append('text').attr('class', 'x-axis-label-calc');
      }
      xLabelEl
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .style('fill', 'var(--muted-foreground)')
        .text(getMetricLabel(barMetric, mode, costType));

      // Apply initial selection opacities — use g (not zoomGroup) since clipContent=false
      const renderGroup = layout.g;
      applySelectionOpacities(renderGroup, selectedBarsRef.current);
    },
    [barMetric, mode, costType],
  );

  // React to selection changes without full re-render
  useEffect(() => {
    const svgEl = chartRef.current?.getSvgElement();
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    applySelectionOpacities(svg as any, selectedBars);
  }, [selectedBars]);

  if (results.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-64 text-muted-foreground"
        data-testid="calculator-no-data"
      >
        {locale === 'zh'
          ? '当前选择无可用数据。请尝试调整模型、序列长度或精度。'
          : 'No data available for the current selection. Try adjusting the model, sequence, or precision.'}
      </div>
    );
  }

  return (
    <D3Chart<InterpolatedResult>
      ref={chartRef}
      chartId="calculator-chart"
      data={sortedResults}
      height={dynamicHeight}
      margin={dynamicMargin}
      watermark={getChartWatermark()}
      testId="calculator-bar-chart"
      grabCursor
      clipContent={false}
      xScale={{ type: 'linear', domain: [0, maxBarValue] }}
      yScale={{ type: 'band', domain: yDomain, padding: 0.3 }}
      xAxis={xAxisConfig}
      yAxis={yAxisConfig}
      layers={layers}
      zoom={{
        enabled: true,
        axes: 'x',
        scaleExtent: [0.1, 1],
        rescaleX: (xScale, transform) =>
          xScale.copy().domain([0, maxBarValue / transform.k]) as ContinuousScale,
        customTransformStorage: (transform) => d3.zoomIdentity.scale(transform.k),
      }}
      instructions="Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a bar to select"
      tooltip={tooltip}
      onRender={onRender}
      legendElement={legendElement}
      caption={caption}
    />
  );
}

// ── Selection opacity helper ──

function applySelectionOpacities(
  group: d3.Selection<any, unknown, null, undefined>,
  selectedBars: Set<string>,
): void {
  const hasSelection = selectedBars.size > 0;

  group.selectAll<SVGRectElement, InterpolatedResult>('.bar').attr('opacity', (d) => {
    if (!hasSelection) return 0.85;
    return selectedBars.has(d.resultKey) ? 0.95 : 0.15;
  });

  group.selectAll<SVGTextElement, InterpolatedResult>('.value-label').attr('opacity', (d) => {
    if (!hasSelection) return 1;
    return selectedBars.has(d.resultKey) ? 1 : 0.25;
  });

  group.selectAll<SVGTextElement, InterpolatedResult>('.overlay-label').attr('opacity', (d) => {
    if (!hasSelection) return 1;
    return selectedBars.has(d.resultKey) ? 1 : 0.25;
  });
}
