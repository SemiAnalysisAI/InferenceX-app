'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';

import { GRADIENT_NUDGE_EVENT } from '@/components/gradient-label-nudge';
import { useInference } from '@/components/inference/InferenceContext';
import ChartLegend from '@/components/ui/chart-legend';
import { getModelSortIndex, HARDWARE_CONFIG } from '@/lib/constants';
import { generateGpuDateColors } from '@/lib/dynamic-colors';
import { formatNumber, getDisplayLabel, updateRepoUrl } from '@/lib/utils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  LayerConfig,
  RenderContext,
  ZoomContext,
} from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { applyHoverState, applyNormalState } from '@/lib/chart-rendering';
import { formatLargeNumber, logTickFormat } from '@/lib/chart-rendering';
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
  generateGPUGraphTooltipContent,
  getPointLabel,
} from '@/components/inference/utils/tooltipUtils';
import {
  type ParetoPointLabel,
  computeParetoPointLabels,
  computeGradientStops,
  PARETO_LABEL_COLORS,
  buildGradientColorMap,
  getParetoLabel,
} from '@/components/inference/utils/paretoLabels';

const CHART_MARGIN = { top: 24, right: 10, bottom: 60, left: 60 };

const GPUGraph = React.memo(
  ({ chartId, data, xLabel, yLabel, chartDefinition, caption }: ScatterGraphProps) => {
    const {
      hardwareConfig,
      selectedPrecisions,
      selectedYAxisMetric,
      selectedGPUs,
      selectedDateRange,
      selectedDates,
      toggleActiveDate,
      removeActiveDate,
      activeDates,
      hideNonOptimal,
      setHideNonOptimal,
      hidePointLabels,
      setHidePointLabels,
      logScale,
      setLogScale,
      isLegendExpanded,
      setIsLegendExpanded,
      useAdvancedLabels,
      setUseAdvancedLabels,
      highContrast,
      setHighContrast,
      showGradientLabels,
      setShowGradientLabels,
      showLineLabels,
      setShowLineLabels,
      selectAllActiveDates,
    } = useInference();
    const { resolvedTheme } = useTheme();
    const chartRef = useRef<D3ChartHandle>(null);

    // Shared date+GPU pairs
    const gpuDatePairs = useMemo(() => {
      const dates: string[] = [];
      if (selectedDateRange.startDate && selectedDateRange.endDate && selectedGPUs.length > 0) {
        dates.push(selectedDateRange.startDate, selectedDateRange.endDate);
      }
      dates.push(...selectedDates);
      dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const sortedGPUs = [...selectedGPUs].sort(
        (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
      );
      return { dates, sortedGPUs };
    }, [selectedDateRange, selectedDates, selectedGPUs]);

    const graphIdentifiers = useMemo(() => {
      const ids: string[] = [];
      gpuDatePairs.sortedGPUs.forEach((gpu) =>
        gpuDatePairs.dates.forEach((date) => ids.push(`${date}_${gpu}`)),
      );
      return ids;
    }, [gpuDatePairs]);

    const { resolveColor, getCssColor } = useThemeColors({
      highContrast,
      identifiers: graphIdentifiers,
    });

    // Dynamic GPU×date color map
    const gpuDateColorMap = useMemo(() => {
      const { dates, sortedGPUs } = gpuDatePairs;
      if (sortedGPUs.length === 0 || dates.length === 0) return {};
      const theme = resolvedTheme === 'dark' ? 'dark' : 'light';
      return generateGpuDateColors(sortedGPUs, dates.length, theme);
    }, [gpuDatePairs, resolvedTheme]);

    const allGraphs = useMemo(() => {
      const { dates, sortedGPUs } = gpuDatePairs;
      const result: { date: string; color: string; hwKey: string; id: string }[] = [];
      sortedGPUs.forEach((gpu) => {
        dates.forEach((date, dateIndex) => {
          const id = `${date}_${gpu}`;
          const dynamicColor = gpuDateColorMap[`${dateIndex}_${gpu}`];
          result.push({
            date,
            hwKey: gpu,
            id,
            color: highContrast
              ? getCssColor(resolveColor(id))
              : dynamicColor || 'var(--foreground)',
          });
        });
      });
      return result;
    }, [gpuDatePairs, gpuDateColorMap, highContrast, resolveColor, getCssColor]);

    const groupedData = useMemo(
      () =>
        data.reduce(
          (acc, point) => {
            if (!selectedPrecisions.includes(point.precision)) return acc;
            const key = `${point.date}_${point.hwKey}_${point.precision}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(point);
            return acc;
          },
          {} as Record<string, InferenceData[]>,
        ),
      [data, selectedPrecisions],
    );

    // Track which date+GPU combos have actual data points
    const idsWithData = useMemo(() => {
      const ids = new Set<string>();
      for (const key of Object.keys(groupedData)) {
        // key = "date_hwKey_precision" — strip last segment
        const lastUnderscore = key.lastIndexOf('_');
        ids.add(key.slice(0, lastUnderscore));
      }
      return ids;
    }, [groupedData]);

    const rooflines = useMemo(() => {
      const result: Record<string, InferenceData[]> = {};
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as
        | 'upper_right'
        | 'upper_left'
        | 'lower_left'
        | 'lower_right'
        | undefined;
      for (const key in groupedData) {
        result[key] =
          dir === 'upper_right'
            ? paretoFrontUpperRight(groupedData[key])
            : dir === 'upper_left'
              ? paretoFrontUpperLeft(groupedData[key])
              : dir === 'lower_left'
                ? paretoFrontLowerLeft(groupedData[key])
                : paretoFrontLowerRight(groupedData[key]);
      }
      return result;
    }, [groupedData, selectedYAxisMetric, chartDefinition]);

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

    // Point → gradient color lookup
    const gradientColorByPoint = useMemo(
      () => buildGradientColorMap(allPointLabelsByKey),
      [allPointLabelsByKey],
    );

    const optimalPointKeys = useMemo(() => {
      const keys = new Set<string>();
      Object.values(rooflines).forEach((pts) =>
        pts.forEach((p) => keys.add(`${p.date}_${p.hwKey}_${p.precision}-${p.x}-${p.y}`)),
      );
      return keys;
    }, [rooflines]);

    const filteredData = useMemo(() => {
      let pts = Object.values(groupedData)
        .flat()
        .filter((p) => activeDates.has(`${p.date}_${p.hwKey}`));
      if (hideNonOptimal)
        pts = pts.filter((p) =>
          optimalPointKeys.has(`${p.date}_${p.hwKey}_${p.precision}-${p.x}-${p.y}`),
        );
      return pts;
    }, [groupedData, activeDates, hideNonOptimal, optimalPointKeys]);

    // Compute scale domains
    const xExtent = useMemo(() => {
      if (filteredData.length === 0) return [0, 100] as [number, number];
      const ext = d3.extent(filteredData, (d) => d.x) as [number, number];
      return [0, ext[1] * 1.05] as [number, number];
    }, [filteredData]);

    const yDomain = useMemo(() => {
      if (filteredData.length === 0) return [0, 100] as [number, number];
      const yExtent = d3.extent(filteredData, (d) => d.y) as [number, number];
      const yRange = yExtent[1] - yExtent[0];
      let yMin: number;
      if (logScale) {
        const dataMin = yExtent[0];
        yMin =
          dataMin <= 0
            ? 0.1
            : dataMin < 1
              ? Math.pow(10, Math.floor(Math.log10(dataMin)))
              : dataMin * 0.95;
      } else {
        yMin = Math.max(0, yExtent[0] - yRange * 0.05);
      }
      return [yMin, yExtent[1] * 1.05] as [number, number];
    }, [filteredData, logScale]);

    // Color resolver for points/rooflines
    const getColor = useMemo(() => {
      return (d: InferenceData) => {
        if (showGradientLabels) {
          const gc = gradientColorByPoint.get(d);
          if (gc) return gc;
        }
        const graphIndex = allGraphs.findIndex(
          ({ date, hwKey }) => d.date === date && d.hwKey === hwKey,
        );
        return graphIndex >= 0 ? allGraphs[graphIndex].color : '#6b7280';
      };
    }, [allGraphs, showGradientLabels, gradientColorByPoint]);

    const getRooflineColor = useMemo(() => {
      return (key: string) => {
        const graphId = key.split('_').slice(0, -1).join('_');
        const graphIndex = allGraphs.findIndex((d) => d.id === graphId);
        return graphIndex >= 0 ? allGraphs[graphIndex].color : '#6b7280';
      };
    }, [allGraphs]);

    // Dismiss tooltip when pinned point's combo is hidden
    useEffect(() => {
      const pp = chartRef.current?.getPinnedPoint() as InferenceData | null;
      if (pp && !activeDates.has(`${pp.date}_${pp.hwKey}`)) chartRef.current?.dismissTooltip();
    }, [activeDates]);

    // Dismiss on filter changes
    useEffect(() => {
      chartRef.current?.dismissTooltip();
    }, [selectedPrecisions, selectedYAxisMetric, selectedGPUs, selectedDates, selectedDateRange]);

    const handleLegendHover = useCallback((seriesId: string) => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root
        .selectAll<SVGGElement, InferenceData>('.dot-group')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', (d) => (`${d.date}_${d.hwKey}` === seriesId ? 1 : 0.15));
      root
        .selectAll<SVGPathElement, unknown>('.roofline-path')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', function () {
          const key = (d3.select(this).datum() as { key: string } | null)?.key ?? '';
          const series = key.slice(0, key.lastIndexOf('_'));
          return series === seriesId ? null : '0.15';
        });
      root
        .selectAll<SVGGElement, unknown>('.parallelism-label, .line-label')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', function () {
          const series = (this as SVGGElement).getAttribute('data-series');
          if (!series) return 0;
          return series === seriesId ? 1 : 0;
        });
    }, []);

    const handleLegendHoverEnd = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root.selectAll('.dot-group').transition('legend-hover').duration(150).style('opacity', null);
      root
        .selectAll('.roofline-path')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', null);
      root
        .selectAll('.parallelism-label, .line-label')
        .transition('legend-hover')
        .duration(150)
        .style('opacity', null);
    }, []);

    // Helper: parse "date_hwKey_precision" → series id "date_hwKey"
    const parseSeriesId = (key: string) => {
      const lastUnderscore = key.lastIndexOf('_');
      return key.slice(0, lastUnderscore);
    };

    // --- Layers ---
    const gpuGraphLayers = useMemo((): LayerConfig<InferenceData>[] => {
      // ── Layer 0: Rooflines + gradient labels + line labels (custom) ──
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
            seriesId: string;
            precision: string;
            points: InferenceData[];
            stroke: string;
            visible: boolean;
          };
          const entries: Entry[] = [];
          const activeGradientIds = new Set<string>();

          Object.entries(rooflines).forEach(([key, pts]) => {
            if (pts.length <= 1) return;
            const seriesId = parseSeriesId(key);
            const precision = key.split('_').pop()!;
            const visible = activeDates.has(seriesId);
            let stroke = getRooflineColor(key);

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

            entries.push({ key, seriesId, precision, points: pts, stroke, visible });
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
            .attr('data-series', (d) => d.seriesId)
            .attr('fill', 'none')
            .attr('stroke', (d) => d.stroke)
            .attr('stroke-width', 2.5)
            .attr('d', (d) => lineGen(d.points))
            .style('transition', 'opacity 150ms ease')
            .style('opacity', (d) => (d.visible ? 1 : 0));

          // Parallelism labels
          type LabelSeg = {
            segKey: string;
            seriesId: string;
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
              const seriesId = parseSeriesId(key);
              const visible = activeDates.has(seriesId);

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
                  seriesId,
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
            .attr('data-series', (d) => d.seriesId)
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

          // ── Line labels (GPU+date name along each roofline) ──
          type LineLabel = {
            key: string;
            seriesId: string;
            label: string;
            color: string;
            x: number;
            y: number;
            visible: boolean;
          };
          const lineLabels: LineLabel[] = [];

          if (showLineLabels) {
            const LABEL_H = 18;
            const LABEL_W = 120;
            const placed: { x: number; y: number }[] = [];
            const collides = (cx: number, cy: number) =>
              placed.some((p) => Math.abs(p.y - cy) < LABEL_H && Math.abs(p.x - cx) < LABEL_W);

            // Pick the roofline with most points per seriesId
            const bestBySeries = new Map<string, (typeof entries)[0]>();
            for (const e of entries) {
              if (!e.visible || e.points.length < 2) continue;
              const prev = bestBySeries.get(e.seriesId);
              if (!prev || e.points.length > prev.points.length) bestBySeries.set(e.seriesId, e);
            }

            const sorted = [...bestBySeries.values()].sort((a, b) => {
              const ay = yScale(a.points[0].y);
              const by = yScale(b.points[0].y);
              return ay - by;
            });

            for (const entry of sorted) {
              const pts = entry.points;
              const candidates = [
                pts[Math.min(1, pts.length - 1)],
                pts[Math.floor(pts.length / 2)],
                pts[Math.max(0, Math.floor((pts.length * 2) / 3))],
                pts[pts.length - 1],
              ];

              const hwKey = entry.seriesId.split('_').slice(1).join('_');
              const hwConfig = HARDWARE_CONFIG[hwKey];
              const label = hwConfig
                ? `${getDisplayLabel(hwConfig)} ${entry.seriesId.split('_')[0]}`
                : entry.seriesId;
              let foundPlacement = false;
              for (const pt of candidates) {
                const px = xScale(pt.x);
                const py = yScale(pt.y);
                if (!collides(px, py)) {
                  lineLabels.push({
                    key: entry.key,
                    seriesId: entry.seriesId,
                    label,
                    color: entry.stroke.startsWith('url(')
                      ? getRooflineColor(entry.key)
                      : entry.stroke,
                    x: px,
                    y: py,
                    visible: true,
                  });
                  placed.push({ x: px, y: py });
                  foundPlacement = true;
                  break;
                }
              }
              if (!foundPlacement) {
                const pt = pts[0];
                lineLabels.push({
                  key: entry.key,
                  seriesId: entry.seriesId,
                  label,
                  color: entry.stroke.startsWith('url(')
                    ? getRooflineColor(entry.key)
                    : entry.stroke,
                  x: xScale(pt.x),
                  y: yScale(pt.y),
                  visible: false,
                });
              }
            }

            // Hidden entries for non-visible series
            const labeledSeries = new Set(lineLabels.map((l) => l.seriesId));
            for (const entry of entries) {
              if (entry.points.length >= 2 && !labeledSeries.has(entry.seriesId)) {
                const hwKey = entry.seriesId.split('_').slice(1).join('_');
                const hwConfig = HARDWARE_CONFIG[hwKey];
                const label = hwConfig
                  ? `${getDisplayLabel(hwConfig)} ${entry.seriesId.split('_')[0]}`
                  : entry.seriesId;
                lineLabels.push({
                  key: entry.key,
                  seriesId: entry.seriesId,
                  label,
                  color: entry.stroke.startsWith('url(')
                    ? getRooflineColor(entry.key)
                    : entry.stroke,
                  x: xScale(entry.points[0].x),
                  y: yScale(entry.points[0].y),
                  visible: false,
                });
                labeledSeries.add(entry.seriesId);
              }
            }
          }

          zoomGroup
            .selectAll<SVGGElement, LineLabel>('.line-label')
            .data(lineLabels, (d) => d.key)
            .join(
              (enter) => {
                const g = enter
                  .append('g')
                  .attr('class', 'line-label')
                  .style('pointer-events', 'none')
                  .attr('transform', (d) => `translate(${d.x},${d.y})`);
                g.append('rect')
                  .attr('class', 'll-bg')
                  .attr('rx', 4)
                  .attr('ry', 4)
                  .attr('opacity', 0.95);
                g.append('text')
                  .attr('class', 'll-text')
                  .attr('text-anchor', 'start')
                  .attr('dominant-baseline', 'central')
                  .attr('fill', 'white')
                  .attr('font-size', '10px')
                  .attr('font-weight', '600');
                return g;
              },
              (update) => update,
              (exit) => exit.remove(),
            )
            .attr('data-line-key', (d) => d.key)
            .attr('data-series', (d) => d.seriesId)
            .attr('transform', (d) => `translate(${d.x + 8},${d.y - 14})`)
            .style('opacity', (d) => (d.visible ? 1 : 0))
            .each(function (d) {
              const g = d3.select(this);
              const text = g.select<SVGTextElement>('.ll-text').text(d.label);
              const bbox = (text.node() as SVGTextElement).getBBox();
              const px = 5;
              const py = 3;
              g.select('.ll-bg')
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

          // Update line label positions on zoom
          if (showLineLabels) {
            const LABEL_H = 18;
            const LABEL_W = 120;
            const placed: { x: number; y: number }[] = [];
            const collides = (cx: number, cy: number) =>
              placed.some((p) => Math.abs(p.y - cy) < LABEL_H && Math.abs(p.x - cx) < LABEL_W);

            const bestBySeries = new Map<string, [string, InferenceData[]]>();
            for (const [key, pts] of Object.entries(rooflines)) {
              if (pts.length < 2) continue;
              const seriesId = parseSeriesId(key);
              if (!activeDates.has(seriesId)) continue;
              const prev = bestBySeries.get(seriesId);
              if (!prev || pts.length > prev[1].length) bestBySeries.set(seriesId, [key, pts]);
            }
            const visibleEntries = [...bestBySeries.values()].sort(
              ([, a], [, b]) => newYScale(a[0].y) - newYScale(b[0].y),
            );

            const zoomResults = new Map<string, { x: number; y: number; vis: boolean }>();
            for (const [key, pts] of visibleEntries) {
              const candidates = [
                pts[Math.min(1, pts.length - 1)],
                pts[Math.floor(pts.length / 2)],
                pts[Math.max(0, Math.floor((pts.length * 2) / 3))],
                pts[pts.length - 1],
              ];
              let found = false;
              for (const pt of candidates) {
                const px = newXScale(pt.x);
                const py = newYScale(pt.y);
                if (!collides(px, py)) {
                  zoomResults.set(key, { x: px, y: py, vis: true });
                  placed.push({ x: px, y: py });
                  found = true;
                  break;
                }
              }
              if (!found) {
                zoomResults.set(key, {
                  x: newXScale(pts[0].x),
                  y: newYScale(pts[0].y),
                  vis: false,
                });
              }
            }

            zoomGroup.selectAll<SVGGElement, unknown>('.line-label').each(function () {
              const el = d3.select(this);
              const k = el.attr('data-line-key');
              const zl = zoomResults.get(k);
              if (zl) {
                el.attr('transform', `translate(${zl.x + 8},${zl.y - 14})`);
                el.style('opacity', zl.vis ? 1 : 0);
              } else {
                el.style('opacity', 0);
              }
            });
          }
        },
      };

      // ── Layer 1: Scatter points ──
      const scatterLayer: LayerConfig<InferenceData> = {
        type: 'scatter',
        key: 'points',
        data: filteredData,
        config: {
          getColor,
          hideLabels: hidePointLabels || showGradientLabels,
          getLabelText: (d) => (useAdvancedLabels ? getPointLabel(d) : String(d.tp)),
          foreground: 'var(--foreground)',
          dataAttrs: {
            series: (d) => `${d.date}_${d.hwKey}`,
          },
        },
      };

      return [rooflineLayer, scatterLayer];
    }, [
      rooflines,
      allPointLabelsByKey,
      showGradientLabels,
      showLineLabels,
      activeDates,
      chartId,
      getRooflineColor,
      filteredData,
      getColor,
      hidePointLabels,
      useAdvancedLabels,
    ]);

    // --- Zoom config ---
    const gpuGraphZoom = useMemo(
      () => ({
        enabled: true,
        axes: 'both' as const,
        scaleExtent: [1, 20] as [number, number],
        resetEventName: `gpu_timeseries_zoom_reset_${chartId}`,
        onReset: () => {
          track('interactivity_zoom_reset');
        },
        onZoom: (_event: d3.D3ZoomEvent<SVGSVGElement, unknown>, ctx: ZoomContext) => {
          if (logScale) {
            const newYScale = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
            ctx.layout.yAxisGroup.call(
              d3.axisLeft(newYScale).ticks(10).tickFormat(logTickFormat(newYScale)) as any,
            );
          }
        },
      }),
      [chartId, logScale],
    );

    if (data.length === 0) {
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
        data={filteredData}
        margin={CHART_MARGIN}
        watermark="logo"
        testId="gpu-graph"
        grabCursor={true}
        caption={caption}
        xScale={{ type: 'linear', domain: xExtent, nice: true }}
        yScale={{ type: logScale ? 'log' : 'linear', domain: yDomain, nice: true }}
        xAxis={{
          label: xLabel,
          tickFormat: (d) => formatNumber(d as number),
          tickCount: 10,
        }}
        yAxis={{
          label: yLabel,
          tickFormat: logScale ? undefined : (d) => formatLargeNumber(d as number),
          tickCount: 10,
        }}
        layers={gpuGraphLayers}
        zoom={gpuGraphZoom}
        tooltip={{
          rulerType: 'crosshair',
          content: (d: InferenceData, isPinned: boolean) =>
            generateGPUGraphTooltipContent({
              data: d,
              isPinned,
              xLabel,
              yLabel,
              selectedYAxisMetric,
              hardwareConfig,
              runUrl: d.run_url ? updateRepoUrl(d.run_url) : undefined,
            }),
          getRulerX: (d, xScale) => (xScale as d3.ScaleLinear<number, number>)(d.x),
          getRulerY: (d, yScale) => (yScale as d3.ScaleLinear<number, number>)(d.y),
          onHoverStart: (sel, d) =>
            applyHoverState(sel.select('.visible-shape') as any, d.precision),
          onHoverEnd: (sel, d) =>
            applyNormalState(sel.select('.visible-shape') as any, d.precision),
          attachToLayer: 1,
        }}
        onRender={(ctx: RenderContext) => {
          // Apply log tick format on initial render (needs the built scale)
          if (logScale) {
            const yScale = ctx.yScale as d3.ScaleLogarithmic<number, number>;
            ctx.layout.yAxisGroup.call(
              d3.axisLeft(yScale).ticks(10).tickFormat(logTickFormat(yScale)) as any,
            );
          }
          // Set foreground color on scatter point labels
          ctx.layout.zoomGroup.selectAll('.point-label').style('fill', 'var(--foreground)');
        }}
        legendElement={
          <ChartLegend
            variant="sidebar"
            grouped={true}
            disableActiveSort={true}
            onItemHover={handleLegendHover}
            onItemHoverEnd={handleLegendHoverEnd}
            onItemRemove={removeActiveDate}
            legendItems={allGraphs
              .filter(({ id }) => idsWithData.has(id))
              .map(({ date, color, hwKey, id }) => ({
                name: `${hwKey} ${date}`,
                hw: id,
                label: date,
                color,
                title: HARDWARE_CONFIG[hwKey] ? getDisplayLabel(HARDWARE_CONFIG[hwKey]) : hwKey,
                isActive: activeDates.has(id),
                onClick: () => {
                  toggleActiveDate(id);
                  track('interactivity_date_toggled', { date, hw: hwKey });
                },
              }))}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('interactivity_legend_expanded', { expanded });
            }}
            switches={[
              {
                id: 'gpu-log-scale',
                label: 'Log Scale',
                checked: logScale,
                onCheckedChange: (c) => {
                  setLogScale(c);
                  track('interactivity_log_scale_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-high-contrast',
                label: 'High Contrast',
                checked: highContrast,
                onCheckedChange: (c) => {
                  setHighContrast(c);
                  track('interactivity_high_contrast_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-hide-non-optimal',
                label: 'Hide Non-Optimal',
                checked: hideNonOptimal,
                onCheckedChange: (c) => {
                  setHideNonOptimal(c);
                  track('interactivity_hide_non_optimal_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-hide-point-labels',
                label: 'Hide Labels',
                checked: hidePointLabels,
                onCheckedChange: (c) => {
                  setHidePointLabels(c);
                  track('interactivity_hide_point_labels_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-parallelism-labels',
                label: 'Parallelism Labels',
                checked: useAdvancedLabels,
                onCheckedChange: (c) => {
                  setUseAdvancedLabels(c);
                  track('interactivity_advanced_labels_toggled', { enabled: c });
                  if (c && !showGradientLabels) {
                    window.dispatchEvent(
                      new CustomEvent(GRADIENT_NUDGE_EVENT, {
                        detail: {
                          enableGradient: () => {
                            setShowGradientLabels(true);
                            setUseAdvancedLabels(false);
                            track('interactivity_gradient_labels_toggled', {
                              enabled: true,
                              source: 'nudge',
                            });
                          },
                        },
                      }),
                    );
                  }
                },
              },
              {
                id: 'gpu-gradient-labels',
                label: 'Gradient Labels',
                checked: showGradientLabels,
                onCheckedChange: (c) => {
                  setShowGradientLabels(c);
                  track('interactivity_gradient_labels_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-line-labels',
                label: 'Line Labels',
                checked: showLineLabels,
                onCheckedChange: (c) => {
                  setShowLineLabels(c);
                  track('interactivity_line_labels_toggled', { enabled: c });
                },
              },
            ]}
            actions={[
              {
                id: 'gpu-reset-filter',
                label: 'Reset filter',
                onClick: () => {
                  selectAllActiveDates();
                  track('gpu_timeseries_reset_filter');
                },
              },
            ]}
            showFpShapeIndicators={selectedPrecisions.length > 1}
          />
        }
      />
    );
  },
);

GPUGraph.displayName = 'GPUGraph';
export default GPUGraph;
