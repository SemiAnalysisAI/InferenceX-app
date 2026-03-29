'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';

import { useInference } from '@/components/inference/InferenceContext';
import ChartLegend from '@/components/ui/chart-legend';
import { getModelSortIndex, HARDWARE_CONFIG } from '@/lib/constants';
import { generateGpuDateColors } from '@/lib/dynamic-colors';
import { formatNumber, getDisplayLabel, updateRepoUrl } from '@/lib/utils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { D3ChartHandle, RenderContext, ZoomContext } from '@/lib/d3-chart/D3Chart/types';
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
        const graphIndex = allGraphs.findIndex(
          ({ date, hwKey }) => d.date === date && d.hwKey === hwKey,
        );
        return graphIndex >= 0 ? allGraphs[graphIndex].color : '#6b7280';
      };
    }, [allGraphs]);

    const getRooflineColor = useMemo(() => {
      return (key: string) => {
        const graphId = key.split('_').slice(0, -1).join('_');
        const graphIndex = allGraphs.findIndex((d) => d.id === graphId);
        return graphIndex >= 0 ? allGraphs[graphIndex].color : '#6b7280';
      };
    }, [allGraphs]);

    const isRooflineVisible = useMemo(() => {
      return (key: string) => {
        const graphId = key.split('_').slice(0, -1).join('_');
        return activeDates.has(graphId);
      };
    }, [activeDates]);

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
    }, []);

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
        layers={[
          {
            type: 'roofline',
            key: 'rooflines',
            rooflines: rooflines as Record<string, { x: number; y: number }[]>,
            config: {
              getColor: getRooflineColor,
              isVisible: isRooflineVisible,
            },
          },
          {
            type: 'scatter',
            key: 'points',
            data: filteredData,
            config: {
              getColor,
              hideLabels: hidePointLabels,
              getLabelText: (d) => (useAdvancedLabels ? getPointLabel(d) : String(d.tp)),
              foreground: 'var(--foreground)',
              dataAttrs: {
                series: (d) => `${d.date}_${d.hwKey}`,
              },
            },
          },
        ]}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [1, 20],
          resetEventName: `gpu_timeseries_zoom_reset_${chartId}`,
          onReset: () => {
            track('interactivity_zoom_reset');
          },
          onZoom: (_event, ctx: ZoomContext) => {
            if (logScale) {
              const newYScale = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
              ctx.layout.yAxisGroup.call(
                d3.axisLeft(newYScale).ticks(10).tickFormat(logTickFormat(newYScale)) as any,
              );
            }
          },
        }}
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
