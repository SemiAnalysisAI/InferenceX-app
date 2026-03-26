'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useInference } from '@/components/inference/InferenceContext';
import ChartLegend from '@/components/ui/chart-legend';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { computeToggle } from '@/hooks/useTogglableSet';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { formatNumber, getDisplayLabel } from '@/lib/utils';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  LayerConfig,
  RenderContext,
  ZoomContext,
} from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { computeTooltipPosition } from '@/lib/d3-chart/layers/scatter-points';
import {
  POINT_SIZE,
  HIT_AREA_RADIUS,
  formatLargeNumber,
  logTickFormat,
  applyHoverState,
  applyNormalState,
} from '@/lib/chart-rendering';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  paretoFrontLowerLeft,
  paretoFrontLowerRight,
  paretoFrontUpperLeft,
  paretoFrontUpperRight,
} from '@/lib/chart-utils';
import type {
  ChartDefinition,
  InferenceData,
  ScatterGraphProps,
} from '@/components/inference/types';
import {
  generateOverlayTooltipContent,
  generateTooltipContent,
  getPointLabel,
} from '@/components/inference/utils/tooltipUtils';
import {
  type ParetoPointLabel,
  getParetoLabel,
  computeParetoPointLabels,
  computeGradientStops,
  PARETO_LABEL_COLORS,
  buildGradientColorMap,
} from '@/components/inference/utils/paretoLabels';

// X-shape path for overlay (unofficial) data points
const X_SIZE = 5;
const X_HOVER_SIZE = 7;
const getXPath = (size: number) => {
  const s = size * 0.7;
  return `M ${-s} ${-s} L ${s} ${s} M ${s} ${-s} L ${-s} ${s}`;
};

const CHART_MARGIN = { top: 24, right: 10, bottom: 60, left: 60 };

// Derive a readable label from a hwKey using the HARDWARE_CONFIG source of truth
const parseHwKeyToLabel = (hwKey: string): { name: string; label: string } => {
  const config = getHardwareConfig(hwKey);
  return { name: config.label, label: getDisplayLabel(config) };
};

const ScatterGraph = React.memo(
  ({
    chartId,
    data,
    xLabel,
    yLabel,
    chartDefinition,
    caption,
    showAllHardwareTypes = false,
    hardwareConfigOverride,
    overlayData,
  }: ScatterGraphProps) => {
    const {
      activeHwTypes,
      hardwareConfig: contextHardwareConfig,
      toggleHwType,
      removeHwType,
      hwTypesWithData,
      selectedPrecisions,
      selectedYAxisMetric,
      availableRuns,
      selectedRunId,
      hideNonOptimal,
      setHideNonOptimal,
      hidePointLabels,
      setHidePointLabels,
      selectAllHwTypes,
      highContrast,
      setHighContrast,
      colorShuffleSeed,
      shuffleColors,
      logScale,
      setLogScale,
      scaleType,
      isLegendExpanded,
      setIsLegendExpanded,
      useAdvancedLabels,
      setUseAdvancedLabels,
      showGradientLabels,
      setShowGradientLabels,
      trackedConfigs,
      addTrackedConfig,
      removeTrackedConfig,
    } = useInference();

    const {
      isUnofficialRun,
      activeOverlayHwTypes,
      setActiveOverlayHwTypes,
      allOverlayHwTypes,
      toggleOverlayHwType: _toggleOverlayHwType,
      resetOverlayHwTypes,
      localOfficialOverride,
      setLocalOfficialOverride,
    } = useUnofficialRun();
    const chartRef = useRef<D3ChartHandle>(null);

    // Effective active hw types for rendering — shared override when present, else global
    const effectiveOfficialHwTypes = localOfficialOverride ?? activeHwTypes;

    // Unified toggle across official + overlay items (shared via context)
    const allUnifiedHwTypes = useMemo(() => {
      const all = new Set<string>();
      hwTypesWithData.forEach((k) => all.add(k));
      allOverlayHwTypes.forEach((k) => all.add(`overlay:${k}`));
      return all;
    }, [hwTypesWithData, allOverlayHwTypes]);

    const unifiedToggle = useCallback(
      (key: string, isOverlay: boolean) => {
        const prefixedKey = isOverlay ? `overlay:${key}` : key;
        const prev = new Set<string>();
        effectiveOfficialHwTypes.forEach((k) => prev.add(k));
        activeOverlayHwTypes.forEach((k) => prev.add(`overlay:${k}`));
        const next = computeToggle(prev, prefixedKey, allUnifiedHwTypes);
        const nextOfficial = new Set<string>();
        const nextOverlay = new Set<string>();
        for (const k of next) {
          if (k.startsWith('overlay:')) nextOverlay.add(k.slice(8));
          else nextOfficial.add(k);
        }
        setLocalOfficialOverride(nextOfficial);
        setActiveOverlayHwTypes(nextOverlay);
      },
      [
        effectiveOfficialHwTypes,
        activeOverlayHwTypes,
        allUnifiedHwTypes,
        setLocalOfficialOverride,
        setActiveOverlayHwTypes,
      ],
    );

    // When no overlay data, delegate to context's toggleHwType (preserves setActivePresetId)
    const handleToggleHwType = useCallback(
      (key: string) => (overlayData ? unifiedToggle(key, false) : toggleHwType(key)),
      [overlayData, unifiedToggle, toggleHwType],
    );

    // --- Theme ---
    const hardwareConfig = hardwareConfigOverride || contextHardwareConfig;
    const activeHwKeys = useMemo(() => {
      const keys = [...effectiveOfficialHwTypes];
      activeOverlayHwTypes.forEach((k) => keys.push(`overlay:${k}`));
      return keys;
    }, [effectiveOfficialHwTypes, activeOverlayHwTypes]);
    const activeOfficialKeys = useMemo(
      () => [...effectiveOfficialHwTypes],
      [effectiveOfficialHwTypes],
    );
    const { resolveColor, getCssColor } = useThemeColors({
      highContrast,
      identifiers: activeHwKeys,
      colorShuffleSeed,
      activeKeys: activeOfficialKeys,
    });

    // --- Changelog ---
    const changelog = availableRuns ? availableRuns[selectedRunId]?.changelog || null : null;
    const formatChangelogDescription = (desc: string | string[]): React.JSX.Element => {
      if (typeof desc === 'string') {
        return (
          <div className="font-normal">
            {desc
              .split('- ')
              .filter((item) => item.trim() !== '')
              .map((item, index) => (
                <div key={index}>{item}</div>
              ))}
          </div>
        );
      }
      return (
        <div className="font-normal">
          {desc.map((item, index) => (
            <div key={index}>{item}</div>
          ))}
        </div>
      );
    };
    const highlightConfigSuffixes = useMemo(() => {
      if (availableRuns) {
        const cl = availableRuns[selectedRunId]?.changelog;
        if (cl) {
          const suffixes = cl.entries.flatMap((entry: any) =>
            (entry.config_keys ?? entry['config-keys'] ?? [])
              .filter((key: string) => selectedPrecisions.includes(key.split('-')[1]))
              .map((key: string) => key.split('-').slice(2).join('-')),
          );
          return new Set(suffixes);
        }
      }
      return new Set<string>();
    }, [availableRuns, selectedRunId, selectedPrecisions]);

    // --- Data Processing ---
    const groupedData = useMemo(
      () =>
        data.reduce(
          (acc, point) => {
            const key = `${point.hwKey}_${point.precision}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(point);
            return acc;
          },
          {} as Record<string, InferenceData[]>,
        ),
      [data],
    );

    const rooflines = useMemo(() => {
      const result: Record<string, InferenceData[]> = {};
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as
        | 'upper_right'
        | 'upper_left'
        | 'lower_left'
        | 'lower_right'
        | undefined;
      for (const hw in groupedData) {
        const front =
          dir === 'upper_right'
            ? paretoFrontUpperRight(groupedData[hw])
            : dir === 'upper_left'
              ? paretoFrontUpperLeft(groupedData[hw])
              : dir === 'lower_left'
                ? paretoFrontLowerLeft(groupedData[hw])
                : paretoFrontLowerRight(groupedData[hw]);
        front.sort((a, b) => a.x - b.x);
        result[hw] = front;
      }
      return result;
    }, [groupedData, selectedYAxisMetric, chartDefinition]);

    const optimalPointKeys = useMemo(() => {
      const keys = new Set<string>();
      Object.values(rooflines).forEach((pts) =>
        pts.forEach((p) => keys.add(`${p.hwKey}_${p.precision}-${p.x}-${p.y}`)),
      );
      return keys;
    }, [rooflines]);

    const effectiveActiveHwTypes = useMemo(() => {
      if (showAllHardwareTypes) {
        const types = new Set<string>();
        Object.values(groupedData)
          .flat()
          .forEach((p) => {
            if (p.hwKey) types.add(p.hwKey as string);
          });
        return types;
      }
      return effectiveOfficialHwTypes;
    }, [showAllHardwareTypes, groupedData, effectiveOfficialHwTypes]);

    const trackedConfigIds = useMemo(() => {
      const ids = new Set<string>();
      for (const config of trackedConfigs) ids.add(config.id);
      return ids;
    }, [trackedConfigs]);

    const buildPointConfigId = useCallback((point: InferenceData): string => {
      let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}|${point.decode_ep ?? 0}|${point.prefill_tp ?? 0}|${point.prefill_ep ?? 0}`;
      if (point.disagg) key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
      return key;
    }, []);

    // filteredData: visible points only (for scale domain calculation)
    const filteredData = useMemo(() => {
      return Object.values(groupedData)
        .flat()
        .filter(
          (p) =>
            selectedPrecisions.includes(p.precision) &&
            effectiveActiveHwTypes.has(p.hwKey as string),
        );
    }, [groupedData, selectedPrecisions, effectiveActiveHwTypes]);

    const processedOverlayData = useMemo(() => {
      if (!overlayData?.data) return [];
      return overlayData.data.filter((p) => selectedPrecisions.includes(p.precision));
    }, [overlayData, selectedPrecisions]);

    // Combined data for D3 scale domain (includes overlay so scales fit both datasets)
    const chartScaleData = useMemo(() => {
      if (processedOverlayData.length === 0) return filteredData;
      return [...filteredData, ...processedOverlayData];
    }, [filteredData, processedOverlayData]);

    const overlayRooflines = useMemo(() => {
      if (!processedOverlayData.length) return {};
      const grouped = processedOverlayData.reduce(
        (acc, p) => {
          const key = `${p.hwKey}_${p.precision}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(p);
          return acc;
        },
        {} as Record<string, InferenceData[]>,
      );
      const result: Record<string, InferenceData[]> = {};
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as
        | 'upper_right'
        | 'upper_left'
        | 'lower_left'
        | 'lower_right'
        | undefined;
      for (const hw in grouped) {
        const front =
          dir === 'upper_right'
            ? paretoFrontUpperRight(grouped[hw])
            : dir === 'upper_left'
              ? paretoFrontUpperLeft(grouped[hw])
              : dir === 'lower_left'
                ? paretoFrontLowerLeft(grouped[hw])
                : paretoFrontLowerRight(grouped[hw]);
        front.sort((a, b) => a.x - b.x);
        result[hw] = front;
      }
      return result;
    }, [processedOverlayData, selectedYAxisMetric, chartDefinition]);

    // All official points for rendering (unfiltered — visibility via opacity)
    const pointsData = useMemo(() => Object.values(groupedData).flat(), [groupedData]);

    // Gradient label data
    const allPointLabelsByKey = useMemo(() => {
      const globalLabelColorMap = new Map<string, string>();
      let globalColorIdx = 0;
      const result: Record<string, ParetoPointLabel[]> = {};
      Object.entries(rooflines).forEach(([key, rooflinePoints]) => {
        if (rooflinePoints.length < 2) return;
        rooflinePoints.forEach((pt) => {
          const label = getParetoLabel(pt);
          if (!globalLabelColorMap.has(label)) {
            globalLabelColorMap.set(
              label,
              PARETO_LABEL_COLORS[globalColorIdx % PARETO_LABEL_COLORS.length],
            );
            globalColorIdx++;
          }
        });
        result[key] = computeParetoPointLabels(rooflinePoints, globalLabelColorMap);
      });
      return result;
    }, [rooflines]);

    // Point → gradient color lookup (for coloring points by parallelism strategy)
    const gradientColorByPoint = useMemo(
      () => buildGradientColorMap(allPointLabelsByKey),
      [allPointLabelsByKey],
    );

    // Ref for trackedConfigIds (needs to be current at event time inside D3 handlers)
    const trackedConfigIdsRef = useRef(trackedConfigIds);
    trackedConfigIdsRef.current = trackedConfigIds;

    // --- Scale Domains ---
    // When hideNonOptimal is active, compute scale domains from optimal points only
    // so the axis fits the visible data (especially important for TTFT where non-optimal
    // outliers can have wildly different x values).
    const visiblePoints = useMemo(() => {
      let pts = filteredData;
      if (hideNonOptimal) {
        pts = pts.filter((d) => optimalPointKeys.has(`${d.hwKey}_${d.precision}-${d.x}-${d.y}`));
      }
      return processedOverlayData.length > 0 ? [...pts, ...processedOverlayData] : pts;
    }, [filteredData, processedOverlayData, hideNonOptimal, optimalPointKeys]);

    const isInputTputMetric = selectedYAxisMetric === 'y_inputTputPerGpu';

    const xScaleConfig = useMemo(() => {
      const ext =
        visiblePoints.length > 0
          ? (d3.extent(visiblePoints, (d) => d.x) as [number, number])
          : ([0, 100] as [number, number]);

      let useLog = false;
      if (isInputTputMetric) {
        const isTTFT =
          xLabel.toLowerCase().includes('time to first token') ||
          xLabel.toLowerCase().includes('ttft');
        if (scaleType === 'log') useLog = ext[0] > 0;
        else if (scaleType === 'linear') useLog = false;
        else useLog = isTTFT && ext[0] > 0 && ext[1] / ext[0] > 10;
      }

      const domain: [number, number] = useLog ? [ext[0] * 0.9, ext[1] * 1.05] : [0, ext[1] * 1.05];
      return {
        type: (useLog ? 'log' : 'linear') as 'log' | 'linear',
        domain,
        nice: true,
        _isLog: useLog,
      };
    }, [visiblePoints, isInputTputMetric, xLabel, scaleType]);

    const yScaleConfig = useMemo(() => {
      const ext =
        visiblePoints.length > 0
          ? (d3.extent(visiblePoints, (d) => d.y) as [number, number])
          : ([0, 100] as [number, number]);
      const range = ext[1] - ext[0];
      const useLog = !isInputTputMetric && logScale;

      let yMin: number;
      if (useLog) {
        const dataMin = ext[0];
        yMin =
          dataMin <= 0
            ? 0.1
            : dataMin < 1
              ? Math.pow(10, Math.floor(Math.log10(dataMin)))
              : dataMin * 0.95;
      } else {
        yMin = Math.max(0, ext[0] - range * 0.05);
      }

      return {
        type: (useLog ? 'log' : 'linear') as 'log' | 'linear',
        domain: [yMin, ext[1] * 1.05] as [number, number],
        nice: true,
      };
    }, [visiblePoints, isInputTputMetric, logScale]);

    // --- Axis configs ---
    const xAxisConfig = useMemo(
      () => ({
        label: xLabel,
        tickFormat: xScaleConfig._isLog
          ? undefined
          : (d: d3.AxisDomain) => formatNumber(d as number),
        tickCount: 10,
      }),
      [xLabel, xScaleConfig._isLog],
    );

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat:
          yScaleConfig.type === 'log'
            ? undefined
            : (d: d3.AxisDomain) => formatLargeNumber(d as number),
        tickCount: 10,
      }),
      [yLabel, yScaleConfig.type],
    );

    // --- Point visibility ---
    const isPointVisible = useCallback(
      (d: InferenceData) =>
        effectiveActiveHwTypes.has(d.hwKey as string) &&
        selectedPrecisions.includes(d.precision) &&
        (!hideNonOptimal || optimalPointKeys.has(`${d.hwKey}_${d.precision}-${d.x}-${d.y}`)),
      [effectiveActiveHwTypes, selectedPrecisions, hideNonOptimal, optimalPointKeys],
    );

    // --- Legend hover highlight ---
    const isRooflineVisible = useCallback(
      (el: SVGPathElement) => {
        const hw = el.getAttribute('data-hw-key');
        const prec = el.getAttribute('data-precision');
        return (
          !!hw && effectiveActiveHwTypes.has(hw) && !!prec && selectedPrecisions.includes(prec)
        );
      },
      [effectiveActiveHwTypes, selectedPrecisions],
    );

    const handleLegendHover = useCallback(
      (hwKey: string) => {
        const svg = chartRef.current?.getSvgElement?.();
        if (!svg) return;
        const root = d3.select(svg);
        root
          .selectAll<SVGGElement, InferenceData>('.dot-group')
          .transition('legend-hover')
          .duration(150)
          .style('opacity', (d) => (!isPointVisible(d) ? 0 : String(d.hwKey) === hwKey ? 1 : 0.15));
        root
          .selectAll<SVGPathElement, unknown>('.roofline-path')
          .transition('legend-hover')
          .duration(150)
          .style('opacity', function () {
            if (!isRooflineVisible(this)) return 0;
            return this.getAttribute('data-hw-key') === hwKey ? null : '0.15';
          });
      },
      [isPointVisible, isRooflineVisible],
    );

    const handleLegendHoverEnd = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root
        .selectAll<SVGGElement, InferenceData>('.dot-group')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', (d) => (isPointVisible(d) ? 1 : 0));
      root
        .selectAll<SVGPathElement, unknown>('.roofline-path')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', function () {
          return isRooflineVisible(this) ? 1 : 0;
        });
    }, [isPointVisible, isRooflineVisible]);

    // --- Zoom config ---
    const eventPrefix = chartDefinition.chartType === 'e2e' ? 'latency' : 'interactivity';
    const zoomResetEventName = `${eventPrefix}_zoom_reset_${chartId}`;

    const zoomConfig = useMemo(
      () => ({
        enabled: true,
        axes: 'both' as const,
        scaleExtent: [0.7, 20] as [number, number],
        resetEventName: zoomResetEventName,
        onReset: () => {
          track(`${eventPrefix}_zoom_reset`);
        },
        constrain: (transform: d3.ZoomTransform, extent: [[number, number], [number, number]]) => {
          const width = extent[1][0];
          const height = extent[1][1];
          let tx = transform.x;
          let ty = transform.y;
          const k = transform.k;
          const maxTx = 0;
          const minTx = Math.min(0, width - width * k);
          const minTy = height * (1 - k);
          const maxTy = Math.max(minTy, 0);
          tx = Math.max(minTx, Math.min(maxTx, tx));
          ty = Math.max(minTy, Math.min(maxTy, ty));
          return d3.zoomIdentity.translate(tx, ty).scale(k);
        },
        onZoom: (_event: d3.D3ZoomEvent<SVGSVGElement, unknown>, ctx: ZoomContext) => {
          if (xScaleConfig._isLog) {
            const newXS = ctx.newXScale as d3.ScaleLogarithmic<number, number>;
            ctx.layout.xAxisGroup.call(
              d3.axisBottom(newXS).ticks(10).tickFormat(logTickFormat(newXS)) as any,
            );
          }
          if (yScaleConfig.type === 'log') {
            const newYS = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
            ctx.layout.yAxisGroup.call(
              d3.axisLeft(newYS).ticks(10).tickFormat(logTickFormat(newYS)) as any,
            );
          }
        },
      }),
      [zoomResetEventName, eventPrefix, xScaleConfig._isLog, yScaleConfig.type],
    );

    // --- Tooltip config ---
    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'crosshair' as const,
        content: (d: InferenceData, isPinned: boolean) =>
          generateTooltipContent({
            data: d,
            isPinned,
            xLabel,
            yLabel,
            selectedYAxisMetric,
            hardwareConfig,
            isTracked: trackedConfigIdsRef.current.has(buildPointConfigId(d)),
          }),
        getRulerX: (d: InferenceData, xScale: any) => (xScale as ContinuousScale)(d.x),
        getRulerY: (d: InferenceData, yScale: any) => (yScale as ContinuousScale)(d.y),
        onHoverStart: (sel: d3.Selection<any, InferenceData, any, any>, d: InferenceData) =>
          applyHoverState(sel.select('.visible-shape') as any, d.precision),
        onHoverEnd: (sel: d3.Selection<any, InferenceData, any, any>, d: InferenceData) =>
          applyNormalState(sel.select('.visible-shape') as any, d.precision),
        onPointClick: (d: InferenceData) => {
          track('latency_data_point_clicked', { hw: String(d.hwKey), x: d.x, y: d.y });
          // Attach track-over-time button handler in the tooltip
          const tooltipEl = chartRef.current?.getTooltipElement();
          if (tooltipEl) {
            const btn = tooltipEl.querySelector('[data-action="track-over-time"]');
            if (btn) {
              btn.addEventListener('click', (btnEvent) => {
                btnEvent.stopPropagation();
                const configId = buildPointConfigId(d);
                if (trackedConfigIdsRef.current.has(configId)) removeTrackedConfig(configId);
                else addTrackedConfig(d, chartDefinition.chartType);
                chartRef.current?.dismissTooltip();
                chartRef.current?.hideTooltip();
                track('latency_point_tracked_via_tooltip', {
                  hwKey: String(d.hwKey),
                  tp: d.tp,
                  conc: d.conc,
                  precision: d.precision,
                });
              });
            }
          }
        },
        attachToLayer: 1, // scatter layer is index 1 (after rooflines at 0)
      }),
      [
        xLabel,
        yLabel,
        selectedYAxisMetric,
        hardwareConfig,
        buildPointConfigId,
        addTrackedConfig,
        removeTrackedConfig,
        chartDefinition.chartType,
      ],
    );

    // --- Layers ---
    const layers = useMemo((): LayerConfig<InferenceData>[] => {
      // ── Layer 0: Rooflines + gradient labels (custom) ──
      const rooflineLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'rooflines',
        render: (zoomGroup, ctx) => {
          const xScale = ctx.xScale as ContinuousScale;
          const yScale = ctx.yScale as ContinuousScale;
          const { defs } = ctx.layout;

          const lineGen = d3
            .line<InferenceData>()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y))
            .curve(d3.curveMonotoneX);

          // Ensure rooflines layer exists before dot-groups
          let rooflinesLayer = zoomGroup.select<SVGGElement>('.rooflines-layer');
          if (rooflinesLayer.empty()) {
            const firstDotGroup = zoomGroup.select('.dot-group').node() as SVGGElement | null;
            const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            node.setAttribute('class', 'rooflines-layer');
            const parent = zoomGroup.node()!;
            if (firstDotGroup) parent.insertBefore(node, firstDotGroup);
            else parent.appendChild(node);
            rooflinesLayer = d3.select<SVGGElement, unknown>(node);
          }

          // Build roofline entries with gradient or solid stroke
          type Entry = {
            key: string;
            hw: string;
            precision: string;
            points: InferenceData[];
            stroke: string;
            visible: boolean;
          };
          const entries: Entry[] = [];
          const activeGradientIds = new Set<string>();

          Object.entries(rooflines).forEach(([key, pts]) => {
            if (pts.length <= 1) return;
            const hw = key.split('_').slice(0, -1).join('_');
            const precision = key.split('_').pop()!;
            const visible =
              effectiveActiveHwTypes.has(hw) && selectedPrecisions.includes(precision);
            let stroke = getCssColor(resolveColor(hw));

            if (showGradientLabels) {
              const pointLabels = allPointLabelsByKey[key];
              if (pointLabels) {
                const stops = computeGradientStops(pointLabels, xScale);
                if (stops) {
                  const gid = `roofline-gradient-${chartId}-${key}`;
                  activeGradientIds.add(gid);
                  let gradient = defs.select<SVGLinearGradientElement>(`#${CSS.escape(gid)}`);
                  if (gradient.empty()) gradient = defs.append('linearGradient').attr('id', gid);
                  gradient
                    .attr('gradientUnits', 'userSpaceOnUse')
                    .attr('x1', xScale(pts[0].x))
                    .attr('y1', 0)
                    .attr('x2', xScale(pts[pts.length - 1].x))
                    .attr('y2', 0);
                  gradient
                    .selectAll('stop')
                    .data(stops)
                    .join('stop')
                    .attr('offset', (s) => `${(s.offset * 100).toFixed(2)}%`)
                    .attr('stop-color', (s) => s.color);
                  stroke = `url(#${gid})`;
                }
              }
            }

            entries.push({ key, hw, precision, points: pts, stroke, visible });
          });

          // Remove stale gradients
          defs.selectAll('linearGradient').each(function () {
            const id = (this as SVGLinearGradientElement).id;
            if (id.startsWith(`roofline-gradient-${chartId}-`) && !activeGradientIds.has(id)) {
              d3.select(this).remove();
            }
          });

          // Data join for roofline paths
          rooflinesLayer
            .selectAll<SVGPathElement, Entry>('.roofline-path')
            .data(entries, (d) => d.key)
            .join('path')
            .attr('class', (d) => `roofline-path roofline-${d.key}`)
            .attr('data-hw-key', (d) => d.hw)
            .attr('data-precision', (d) => d.precision)
            .attr('fill', 'none')
            .attr('stroke', (d) => d.stroke)
            .attr('stroke-width', 2.5)
            .attr('d', (d) => lineGen(d.points))
            .style('transition', 'opacity 150ms ease')
            .style('opacity', (d) => (d.visible ? 1 : 0));

          // Parallelism labels
          type LabelSeg = {
            segKey: string;
            hw: string;
            precision: string;
            label: string;
            color: string;
            x: number;
            y: number;
            visible: boolean;
          };
          const labelSegments: LabelSeg[] = [];

          if (showGradientLabels) {
            Object.entries(allPointLabelsByKey).forEach(([key, pointLabels]) => {
              if (pointLabels.length < 2) return;
              const hw = key.split('_').slice(0, -1).join('_');
              const precision = key.split('_').pop()!;
              const visible =
                effectiveActiveHwTypes.has(hw) && selectedPrecisions.includes(precision);

              const segments: { label: string; color: string; points: InferenceData[] }[] = [];
              let cur = {
                label: pointLabels[0].label,
                color: pointLabels[0].color,
                points: [pointLabels[0].point],
              };
              for (let i = 1; i < pointLabels.length; i++) {
                if (pointLabels[i].label === cur.label) {
                  cur.points.push(pointLabels[i].point);
                } else {
                  segments.push(cur);
                  cur = {
                    label: pointLabels[i].label,
                    color: pointLabels[i].color,
                    points: [pointLabels[i].point],
                  };
                }
              }
              segments.push(cur);

              segments.forEach((seg, idx) => {
                const midPt = seg.points[Math.floor(seg.points.length / 2)];
                labelSegments.push({
                  segKey: `${key}-${idx}`,
                  hw,
                  precision,
                  label: seg.label,
                  color: seg.color,
                  x: xScale(midPt.x),
                  y: yScale(midPt.y) - 14,
                  visible,
                });
              });
            });
          }

          zoomGroup
            .selectAll<SVGGElement, LabelSeg>('.parallelism-label')
            .data(labelSegments, (d) => d.segKey)
            .join(
              (enter) => {
                const g = enter
                  .append('g')
                  .attr('class', 'parallelism-label')
                  .style('pointer-events', 'none')
                  .attr('transform', (d) => `translate(${d.x},${d.y})`);
                g.append('rect')
                  .attr('class', 'pl-bg')
                  .attr('rx', 4)
                  .attr('ry', 4)
                  .attr('opacity', 0.9);
                g.append('text')
                  .attr('class', 'pl-text')
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'central')
                  .attr('fill', 'white')
                  .attr('font-size', '9px')
                  .attr('font-weight', '600');
                return g;
              },
              (update) => update,
              (exit) => exit.remove(),
            )
            .attr('data-seg-key', (d) => d.segKey)
            .attr('data-hw-key', (d) => d.hw)
            .attr('data-precision', (d) => d.precision)
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
            .style('opacity', (d) => (d.visible ? 1 : 0))
            .each(function (d) {
              const g = d3.select(this);
              const text = g.select<SVGTextElement>('.pl-text').text(d.label);
              const bbox = (text.node() as SVGTextElement).getBBox();
              const px = 4;
              const py = 2;
              g.select('.pl-bg')
                .attr('x', bbox.x - px)
                .attr('y', bbox.y - py)
                .attr('width', bbox.width + px * 2)
                .attr('height', bbox.height + py * 2)
                .attr('fill', d.color);
            });
        },
        onZoom: (zoomGroup, ctx) => {
          const newXScale = ctx.newXScale as ContinuousScale;
          const newYScale = ctx.newYScale as ContinuousScale;
          const { defs } = ctx.layout;

          const lineGen = d3
            .line<InferenceData>()
            .x((d) => newXScale(d.x))
            .y((d) => newYScale(d.y))
            .curve(d3.curveMonotoneX);

          // Update roofline paths
          Object.entries(rooflines).forEach(([key, pts]) => {
            if (pts.length < 2) return;
            const sel = zoomGroup.select<SVGPathElement>(`.roofline-${key}`);
            if (!sel.empty()) sel.attr('d', lineGen(pts) as string);
          });

          // Update gradient coordinates
          if (showGradientLabels) {
            Object.entries(allPointLabelsByKey).forEach(([key, pointLabels]) => {
              if (pointLabels.length < 2) return;
              const gid = `roofline-gradient-${chartId}-${key}`;
              const gradientEl = defs.select(`#${CSS.escape(gid)}`);
              if (!gradientEl.empty()) {
                const newStops = computeGradientStops(pointLabels, newXScale);
                if (newStops) {
                  gradientEl
                    .attr('x1', newXScale(pointLabels[0].point.x))
                    .attr('x2', newXScale(pointLabels[pointLabels.length - 1].point.x));
                  gradientEl
                    .selectAll('stop')
                    .data(newStops)
                    .join('stop')
                    .attr('offset', (s) => `${(s.offset * 100).toFixed(2)}%`)
                    .attr('stop-color', (s) => s.color);
                }
              }

              // Update parallelism label positions
              const segments: { points: InferenceData[] }[] = [];
              let cur = { points: [pointLabels[0].point] };
              for (let i = 1; i < pointLabels.length; i++) {
                if (pointLabels[i].label === pointLabels[i - 1].label) {
                  cur.points.push(pointLabels[i].point);
                } else {
                  segments.push(cur);
                  cur = { points: [pointLabels[i].point] };
                }
              }
              segments.push(cur);

              segments.forEach((seg, idx) => {
                const segKey = `${key}-${idx}`;
                const labelGroup = zoomGroup.select<SVGGElement>(
                  `.parallelism-label[data-seg-key="${segKey}"]`,
                );
                if (!labelGroup.empty()) {
                  const midPt = seg.points[Math.floor(seg.points.length / 2)];
                  labelGroup.attr(
                    'transform',
                    `translate(${newXScale(midPt.x)},${newYScale(midPt.y) - 14})`,
                  );
                }
              });
            });
          }
        },
      };

      // ── Layer 1: Official scatter points ──
      const scatterLayer: LayerConfig<InferenceData> = {
        type: 'scatter',
        key: 'points',
        data: pointsData,
        config: {
          getColor: (d) =>
            (showGradientLabels && gradientColorByPoint.get(d)) ||
            getCssColor(resolveColor(d.hwKey as string)),
          getOpacity: (d) => (isPointVisible(d) ? 1 : 0),
          getPointerEvents: (d) => (isPointVisible(d) ? 'auto' : 'none'),
          hideLabels: hidePointLabels || showGradientLabels,
          getLabelText: (d) => (useAdvancedLabels ? getPointLabel(d) : String(d.tp)),
          foreground: 'var(--foreground)',
          dataAttrs: {
            'hw-key': (d) => String(d.hwKey),
            precision: (d) => d.precision,
          },
        },
        keyFn: buildPointConfigId,
      };

      // ── Layer 2: Overlay (rooflines + X-shape points) ──
      const overlayLayer: CustomLayerConfig | null = overlayData
        ? {
            type: 'custom',
            key: 'overlay',
            render: (zoomGroup, ctx) => {
              const xScale = ctx.xScale as ContinuousScale;
              const yScale = ctx.yScale as ContinuousScale;

              // Overlay rooflines
              const lineGen = d3
                .line<InferenceData>()
                .x((d) => xScale(d.x))
                .y((d) => yScale(d.y))
                .curve(d3.curveMonotoneX);

              type OvEntry = {
                key: string;
                points: InferenceData[];
                stroke: string;
              };
              const ovEntries: OvEntry[] = [];
              Object.entries(overlayRooflines).forEach(([key, pts]) => {
                const hw = key.split('_').slice(0, -1).join('_');
                const hwCfg = overlayData.hardwareConfig[hw];
                if (hwCfg && pts.length > 1) {
                  ovEntries.push({
                    key,
                    points: pts,
                    stroke: getCssColor(resolveColor(hw)),
                  });
                }
              });

              let rooflinesLayer = zoomGroup.select<SVGGElement>('.rooflines-layer');
              if (rooflinesLayer.empty()) {
                rooflinesLayer = zoomGroup.append('g').attr('class', 'rooflines-layer');
              }
              rooflinesLayer
                .selectAll<SVGPathElement, OvEntry>('.overlay-roofline-path')
                .data(ovEntries, (d) => d.key)
                .join('path')
                .attr('class', (d) => `overlay-roofline-path overlay-roofline-${d.key}`)
                .attr('fill', 'none')
                .attr('stroke', (d) => d.stroke)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '6 3')
                .attr('d', (d) => lineGen(d.points));

              // Overlay X-shape points — index-keyed so every point renders
              const overlayPoints = zoomGroup
                .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
                .data(processedOverlayData, (_d, i) => String(i))
                .join((enter) => {
                  const g = enter.append('g').attr('class', 'unofficial-overlay-pt');
                  g.append('circle')
                    .attr('r', HIT_AREA_RADIUS)
                    .attr('fill', 'transparent')
                    .attr('cursor', 'pointer');
                  g.each(function (d) {
                    const hwCfg = overlayData.hardwareConfig[d.hwKey];
                    if (hwCfg) {
                      d3.select(this)
                        .append('path')
                        .attr('class', 'visible-shape overlay-x')
                        .attr('d', getXPath(X_SIZE))
                        .attr('fill', 'none')
                        .attr('stroke-width', 2.5)
                        .attr('stroke-linecap', 'round')
                        .attr('cursor', 'pointer');
                    }
                  });
                  return g;
                });

              overlayPoints.attr('transform', (d) => `translate(${xScale(d.x)},${yScale(d.y)})`);
              overlayPoints
                .select('.overlay-x')
                .attr('stroke', (d) => getCssColor(resolveColor(d.hwKey as string)));

              // Labels
              const showLabels = !hidePointLabels && !showGradientLabels;
              overlayPoints.each(function (d) {
                d3.select(this)
                  .selectAll<SVGTextElement, boolean>('.overlay-label')
                  .data(showLabels ? [true] : [])
                  .join('text')
                  .attr('class', 'overlay-label')
                  .attr('dy', -10)
                  .attr('text-anchor', 'middle')
                  .style('fill', 'var(--foreground)')
                  .attr('font-size', '10px')
                  .attr('pointer-events', 'none')
                  .text(useAdvancedLabels ? getPointLabel(d) : String(d.tp));
              });

              // Overlay tooltip handlers
              const svgNode = ctx.layout.svg.node()!;
              const container = svgNode.parentElement as HTMLDivElement;
              const tooltipDiv = svgNode.nextElementSibling as HTMLDivElement;
              const tooltip = d3.select(tooltipDiv);

              const createOverlayConfig = (d: InferenceData, pinned: boolean) => ({
                data: d,
                isPinned: pinned,
                xLabel,
                yLabel,
                selectedYAxisMetric,
                hardwareConfig: overlayData.hardwareConfig,
                overlayData,
              });

              overlayPoints
                .on('mouseenter', function (_event, d) {
                  if (chartRef.current?.isPinned()) return;
                  const shape = d3.select(this).select('.overlay-x');
                  shape.attr('d', getXPath(X_HOVER_SIZE)).attr('stroke-width', 3.5);
                  tooltip
                    .style('opacity', 1)
                    .style('display', 'block')
                    .style('pointer-events', 'none');

                  // Position rulers
                  const rulerGroup = zoomGroup.select('.ruler-group');
                  const vRuler = zoomGroup.select('.vertical-ruler');
                  const hRuler = zoomGroup.select('.horizontal-ruler');
                  const ct = d3.zoomTransform(svgNode);
                  const curX = ct.rescaleX(xScale);
                  const curY = ct.rescaleY(yScale);
                  rulerGroup.style('display', 'block');
                  vRuler.attr('x1', curX(d.x)).attr('x2', curX(d.x));
                  hRuler.attr('y1', curY(d.y)).attr('y2', curY(d.y));

                  tooltip.html(generateOverlayTooltipContent(createOverlayConfig(d, false)));
                })
                .on('mousemove', function (event) {
                  if (chartRef.current?.isPinned()) return;
                  const [mx, my] = d3.pointer(event, container);
                  const pos = computeTooltipPosition(mx, my, tooltip, container);
                  tooltip.style('left', `${pos.left}px`).style('top', `${pos.top}px`);
                })
                .on('mouseleave', function () {
                  if (chartRef.current?.isPinned()) return;
                  const shape = d3.select(this).select('.overlay-x');
                  shape.attr('d', getXPath(X_SIZE)).attr('stroke-width', 2.5);
                  tooltip.style('opacity', 0).style('display', 'none');
                  zoomGroup.select('.ruler-group').style('display', 'none');
                })
                .on('click', function (event, d) {
                  event.stopPropagation();
                  const [mx, my] = d3.pointer(event, container);
                  tooltip.html(generateOverlayTooltipContent(createOverlayConfig(d, true)));
                  const pos = computeTooltipPosition(mx, my, tooltip, container);
                  tooltip
                    .style('left', `${pos.left}px`)
                    .style('top', `${pos.top}px`)
                    .style('opacity', 1)
                    .style('display', 'block')
                    .style('pointer-events', 'auto');

                  // Position rulers at clicked point
                  const ct = d3.zoomTransform(svgNode);
                  const curX = ct.rescaleX(xScale);
                  const curY = ct.rescaleY(yScale);
                  zoomGroup.select('.ruler-group').style('display', 'block');
                  zoomGroup.select('.vertical-ruler').attr('x1', curX(d.x)).attr('x2', curX(d.x));
                  zoomGroup.select('.horizontal-ruler').attr('y1', curY(d.y)).attr('y2', curY(d.y));

                  chartRef.current?.pinTooltip(d, true);
                  track('latency_data_point_clicked', {
                    hw: String(d.hwKey),
                    x: d.x,
                    y: d.y,
                    overlay: true,
                  });
                });
            },
            onZoom: (zoomGroup, ctx) => {
              const newXScale = ctx.newXScale as ContinuousScale;
              const newYScale = ctx.newYScale as ContinuousScale;

              // Update overlay rooflines
              const lineGen = d3
                .line<InferenceData>()
                .x((d) => newXScale(d.x))
                .y((d) => newYScale(d.y))
                .curve(d3.curveMonotoneX);

              Object.entries(overlayRooflines).forEach(([key, pts]) => {
                if (pts.length < 2) return;
                const sel = zoomGroup.select<SVGPathElement>(`.overlay-roofline-${key}`);
                if (!sel.empty()) sel.attr('d', lineGen(pts) as string);
              });

              // Update overlay points
              zoomGroup
                .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
                .attr('transform', (d) => `translate(${newXScale(d.x)},${newYScale(d.y)})`);
            },
          }
        : null;

      const result: LayerConfig<InferenceData>[] = [rooflineLayer, scatterLayer];
      if (overlayLayer) result.push(overlayLayer);
      return result;
    }, [
      rooflines,
      allPointLabelsByKey,
      showGradientLabels,
      gradientColorByPoint,
      chartId,
      effectiveActiveHwTypes,
      selectedPrecisions,
      getCssColor,
      resolveColor,
      pointsData,
      isPointVisible,
      hidePointLabels,
      useAdvancedLabels,
      buildPointConfigId,
      overlayData,
      processedOverlayData,
      overlayRooflines,
      hardwareConfig,
      xLabel,
      yLabel,
      selectedYAxisMetric,
    ]);

    // --- onRender: tracked rings, CSS transitions, log tick formatting, dblclick ---
    const onRender = useCallback(
      (ctx: RenderContext) => {
        const { zoomGroup } = ctx.layout;

        // CSS transitions for smooth opacity animation on hw toggle
        zoomGroup.selectAll('.dot-group').style('transition', 'opacity 150ms ease');

        // Tracked ring highlights
        zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (d) {
          const isTracked = trackedConfigIdsRef.current.has(buildPointConfigId(d));
          d3.select(this)
            .selectAll<SVGCircleElement, boolean>('.tracked-ring')
            .data(isTracked ? [true] : [])
            .join('circle')
            .attr('class', 'tracked-ring')
            .attr('r', POINT_SIZE + 5)
            .attr('fill', 'none')
            .attr('stroke', getCssColor(resolveColor(d.hwKey)))
            .attr('stroke-width', 2)
            .attr('opacity', 0.7)
            .attr('pointer-events', 'none');
        });

        // Double-click to track/untrack
        zoomGroup
          .selectAll<SVGGElement, InferenceData>('.dot-group')
          .on('dblclick', function (event, d) {
            event.stopPropagation();
            event.preventDefault();
            const configId = buildPointConfigId(d);
            const wasTracked = trackedConfigIdsRef.current.has(configId);
            if (wasTracked) removeTrackedConfig(configId);
            else addTrackedConfig(d, chartDefinition.chartType);

            // Update ring DOM immediately (onRender only runs inside the D3 effect)
            const group = d3.select(this);
            group
              .selectAll<SVGCircleElement, boolean>('.tracked-ring')
              .data(wasTracked ? [] : [true])
              .join('circle')
              .attr('class', 'tracked-ring')
              .attr('r', POINT_SIZE + 5)
              .attr('fill', 'none')
              .attr('stroke', getCssColor(resolveColor(d.hwKey)))
              .attr('stroke-width', 2)
              .attr('opacity', 0.7)
              .attr('pointer-events', 'none');

            track('latency_point_tracked', {
              hwKey: String(d.hwKey),
              tp: d.tp,
              conc: d.conc,
              precision: d.precision,
            });
          });

        // Log tick formatting on initial render
        if (xScaleConfig._isLog) {
          const xScale = ctx.xScale as d3.ScaleLogarithmic<number, number>;
          ctx.layout.xAxisGroup.call(
            d3.axisBottom(xScale).ticks(10).tickFormat(logTickFormat(xScale)) as any,
          );
        }
        if (yScaleConfig.type === 'log') {
          const yScale = ctx.yScale as d3.ScaleLogarithmic<number, number>;
          ctx.layout.yAxisGroup.call(
            d3.axisLeft(yScale).ticks(10).tickFormat(logTickFormat(yScale)) as any,
          );
        }
      },
      [
        buildPointConfigId,
        hardwareConfig,
        addTrackedConfig,
        removeTrackedConfig,
        chartDefinition.chartType,
        xScaleConfig._isLog,
        yScaleConfig.type,
      ],
    );

    // --- Side effects ---

    // Dismiss tooltip on filter changes
    useEffect(() => {
      chartRef.current?.dismissTooltip();
    }, [selectedPrecisions, selectedYAxisMetric, hideNonOptimal, overlayData, chartId]);

    // Dismiss when pinned point's hardware becomes hidden
    useEffect(() => {
      const pp = chartRef.current?.getPinnedPoint() as InferenceData | null;
      if (!pp) return;
      const isOverlay = chartRef.current?.getPinnedPointIsOverlay();
      if (isOverlay) {
        if (!activeOverlayHwTypes.has(pp.hwKey as string)) chartRef.current?.dismissTooltip();
      } else {
        if (
          !effectiveActiveHwTypes.has(pp.hwKey as string) ||
          !selectedPrecisions.includes(pp.precision)
        ) {
          chartRef.current?.dismissTooltip();
        }
      }
    }, [effectiveActiveHwTypes, selectedPrecisions, activeOverlayHwTypes]);

    // --- Empty state ---
    if (data.length === 0 && !overlayData?.data?.length) {
      return (
        <div className="relative w-full p-3">
          <div className="flex flex-col items-center justify-center min-h-100 text-center">
            <div className="text-muted-foreground">
              <svg
                className="mx-auto h-12 w-12 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-sm font-medium mb-1">No data available</h3>
              <p className="text-xs">
                Please change the model, sequence, precision, date range or GPU selection.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <D3Chart<InferenceData>
        ref={chartRef}
        chartId={chartId}
        data={chartScaleData}
        margin={CHART_MARGIN}
        watermark={isUnofficialRun ? 'unofficial' : 'logo'}
        testId="scatter-graph"
        grabCursor={true}
        caption={caption}
        xScale={xScaleConfig}
        yScale={yScaleConfig}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        zoom={zoomConfig}
        tooltip={tooltipConfig}
        transitionDuration={750}
        onRender={onRender}
        noDataOverlay={
          filteredData.length === 0 && processedOverlayData.length === 0 ? (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 100 }}
            >
              <div className="text-muted-foreground text-center bg-background/80 px-4 py-2 rounded-md">
                <p className="text-sm font-medium">No data available</p>
                <p className="text-xs mt-1">
                  Please change the model, sequence, precision, date range or GPU selection.
                </p>
              </div>
            </div>
          ) : undefined
        }
        legendElement={
          <ChartLegend
            variant="sidebar"
            onItemHover={handleLegendHover}
            onItemHoverEnd={handleLegendHoverEnd}
            onItemRemove={showAllHardwareTypes ? undefined : removeHwType}
            legendItems={[
              ...(overlayData
                ? Object.entries(overlayData.hardwareConfig)
                    .filter(([key]) =>
                      overlayData.data.some(
                        (d) => d.hwKey === key && selectedPrecisions.includes(d.precision),
                      ),
                    )
                    .map(([key, hwConfig]) => {
                      const parsed = parseHwKeyToLabel(key);
                      return {
                        name: `✕ ${key}`,
                        label: `✕ ${parsed.label}`,
                        color: resolveColor(key),
                        title: `UNOFFICIAL: ${hwConfig.framework || parsed.label}`,
                        isHighlighted: true,
                        hw: `overlay-${key}`,
                        isActive: true,
                        onClick: () => {},
                        tooltip: (
                          <div className="font-normal text-xs">
                            <div className="text-red-500 font-semibold">UNOFFICIAL RUN</div>
                            <div>Branch: {overlayData.label}</div>
                            <div>Hardware: {parsed.label}</div>
                            {overlayData.runUrl && (
                              <a
                                href={overlayData.runUrl}
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
                : []),
              ...Object.entries(hardwareConfig)
                .filter(([key]) =>
                  showAllHardwareTypes ? effectiveActiveHwTypes.has(key) : hwTypesWithData.has(key),
                )
                .sort(
                  ([a], [b]) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
                )
                .map(([key, hwConfig]: [string, any]) => ({
                  name: hwConfig.name,
                  label: getDisplayLabel(hwConfig),
                  color: resolveColor(key),
                  title: hwConfig.gpu,
                  isHighlighted: highlightConfigSuffixes.has(key.replace(/_/g, '-')),
                  hw: key,
                  isActive: showAllHardwareTypes ? true : effectiveOfficialHwTypes.has(key),
                  onClick: showAllHardwareTypes
                    ? () => {}
                    : () => {
                        handleToggleHwType(key);
                        track('latency_hw_type_toggled', { hw: key });
                      },
                  tooltip: changelog
                    ? formatChangelogDescription(changelog.entries[0].description)
                    : null,
                })),
            ]}
            disableActiveSort={false}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('latency_legend_expanded', { expanded });
            }}
            switches={[
              ...(selectedYAxisMetric !== 'y_inputTputPerGpu'
                ? [
                    {
                      id: 'scatter-log-scale',
                      label: 'Log Scale',
                      checked: logScale,
                      onCheckedChange: (checked: boolean) => {
                        setLogScale(checked);
                        track('latency_log_scale_toggled', { enabled: checked });
                      },
                    },
                  ]
                : []),
              {
                id: 'scatter-hide-non-optimal',
                label: 'Hide Non-Optimal',
                checked: hideNonOptimal,
                onCheckedChange: (checked: boolean) => {
                  setHideNonOptimal(checked);
                  track('latency_hide_non_optimal_toggled', { enabled: checked });
                },
              },
              {
                id: 'scatter-hide-point-labels',
                label: 'Hide Labels',
                checked: hidePointLabels,
                onCheckedChange: (checked: boolean) => {
                  setHidePointLabels(checked);
                  track('latency_hide_point_labels_toggled', { enabled: checked });
                },
              },
              {
                id: 'scatter-high-contrast',
                label: 'High Contrast',
                checked: highContrast,
                onCheckedChange: (checked: boolean) => {
                  setHighContrast(checked);
                  track('latency_high_contrast_toggled', { enabled: checked });
                },
              },
              {
                id: 'scatter-parallelism-labels',
                label: 'Parallelism Labels',
                checked: useAdvancedLabels,
                onCheckedChange: (checked: boolean) => {
                  setUseAdvancedLabels(checked);
                  track('latency_advanced_labels_toggled', { enabled: checked });
                },
              },
              {
                id: 'scatter-gradient-labels',
                label: 'Gradient Labels',
                checked: showGradientLabels,
                onCheckedChange: (checked: boolean) => {
                  setShowGradientLabels(checked);
                  track('latency_gradient_labels_toggled', { enabled: checked });
                },
              },
            ]}
            actions={[
              ...(highContrast
                ? [
                    {
                      id: 'scatter-shuffle-colors',
                      label: 'Shuffle Colors',
                      onClick: () => {
                        shuffleColors();
                        track(`${eventPrefix}_shuffle_colors`);
                      },
                    },
                  ]
                : []),
              ...(effectiveOfficialHwTypes.size < hwTypesWithData.size ||
              activeOverlayHwTypes.size < allOverlayHwTypes.size
                ? [
                    {
                      id: 'scatter-reset-filter',
                      label: 'Reset filter',
                      onClick: () => {
                        selectAllHwTypes();
                        setLocalOfficialOverride(null);
                        resetOverlayHwTypes();
                        track('latency_legend_filter_reset');
                      },
                    },
                  ]
                : []),
            ]}
            showFpShapeIndicators={selectedPrecisions.length > 1}
            enableTooltips={true}
          />
        }
      />
    );
  },
);

ScatterGraph.displayName = 'ScatterGraph';

export default ScatterGraph;
