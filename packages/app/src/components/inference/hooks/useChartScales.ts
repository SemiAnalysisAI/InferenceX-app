/**
 * Shared auto-log scale-domain config for the inference charts.
 *
 * ScatterGraph (`xScaleConfigRaw` / `yScaleConfigRaw`) and GPUGraph (`xExtent`
 * / `yDomain`) computed their axis domains with ~60-80% identical code: the
 * extent-with-override-and-fallback, the y-min padding, and the log y-min
 * snapping are byte-for-byte the same. They diverge in two places only:
 *   - the x axis: scatter has auto-log detection (TTFT heuristic + `scaleType`
 *     override) and can float x-min off zero when log; GPU x is always linear
 *     pinned at zero.
 *   - the y "use log" predicate: scatter is `!isInputTputMetric && logScale`;
 *     GPU is plain `logScale`.
 *
 * The pure cores (`extentWithFallback`, `computeYDomain`, `computeXScaleConfig`)
 * are exported for unit testing; the components call the small hooks.
 */

import { useMemo } from 'react';
import * as d3 from 'd3';

import { useStableValue } from '@/hooks/useStableValue';
import type { InferenceData } from '@/components/inference/types';

export interface ScaleConfigValue {
  type: 'log' | 'linear';
  domain: [number, number];
  nice: boolean;
  _isLog?: boolean;
}

/**
 * Value-equality for scale configs. A legend / precision toggle usually leaves
 * the domain untouched, so comparing by value lets `useStableValue` keep the
 * previous config object and spare the chart a full teardown/rebuild for
 * identical scales. (Moved verbatim from ScatterGraph; also used by GPUGraph.)
 */
export const isSameScaleConfig = (a: ScaleConfigValue, b: ScaleConfigValue): boolean =>
  a.type === b.type &&
  a.nice === b.nice &&
  a._isLog === b._isLog &&
  a.domain[0] === b.domain[0] &&
  a.domain[1] === b.domain[1];

/**
 * `override ?? d3.extent(points, accessor)`, with the historical `[0, 100]`
 * fallback when there are no points. Shared by every axis-domain computation.
 */
export function extentWithFallback(
  points: InferenceData[],
  accessor: (d: InferenceData) => number,
  override?: [number, number],
): [number, number] {
  if (override) return override;
  return points.length > 0 ? (d3.extent(points, accessor) as [number, number]) : [0, 100];
}

/**
 * Y domain with the shared padding / log-min-snapping rules. Identical in both
 * charts:
 *   - linear: `[max(0, min - 5% range), max * 1.05]`
 *   - log:    snap the min to a sane power-of-ten floor, cap at `max * 1.05`.
 */
export function computeYDomain(ext: [number, number], useLog: boolean): [number, number] {
  const range = ext[1] - ext[0];
  let yMin: number;
  if (useLog) {
    const dataMin = ext[0];
    yMin =
      dataMin <= 0 ? 0.1 : dataMin < 1 ? 10 ** Math.floor(Math.log10(dataMin)) : dataMin * 0.95;
  } else {
    yMin = Math.max(0, ext[0] - range * 0.05);
  }
  return [yMin, ext[1] * 1.05];
}

interface XScaleConfigArgs {
  ext: [number, number];
  /** True only for the per-GPU input-tput metric, where x auto-log is allowed. */
  isInputTputMetric: boolean;
  xLabel: string;
  /** 'log' / 'linear' force overrides, or 'auto' for the TTFT heuristic. */
  scaleType: string;
  niceAxes: boolean;
}

/**
 * Scatter x-scale config: auto-log detection for the input-tput metric (TTFT
 * heuristic when `scaleType` is auto, honored `log`/`linear` overrides), and a
 * log domain that floats the min off zero. Verbatim port of ScatterGraph's
 * `xScaleConfigRaw` body.
 */
export function computeXScaleConfig({
  ext,
  isInputTputMetric,
  xLabel,
  scaleType,
  niceAxes,
}: XScaleConfigArgs): ScaleConfigValue {
  let useLog = false;
  if (isInputTputMetric) {
    const isTTFT =
      xLabel.toLowerCase().includes('time to first token') || xLabel.toLowerCase().includes('ttft');
    if (scaleType === 'log') useLog = ext[0] > 0;
    else if (scaleType === 'linear') useLog = false;
    else useLog = isTTFT && ext[0] > 0 && ext[1] / ext[0] > 10;
  }

  const domain: [number, number] = useLog ? [ext[0] * 0.9, ext[1] * 1.05] : [0, ext[1] * 1.05];
  return {
    type: useLog ? 'log' : 'linear',
    domain,
    nice: niceAxes,
    _isLog: useLog,
  };
}

interface UseScatterScalesArgs {
  visiblePoints: InferenceData[];
  isInputTputMetric: boolean;
  xLabel: string;
  scaleType: string;
  logScale: boolean;
  niceAxes: boolean;
  xExtentOverride?: [number, number];
  yExtentOverride?: [number, number];
}

/**
 * ScatterGraph's x + y scale configs, value-stabilised so identical domains
 * keep their object identity across toggles. Dependency arrays mirror the
 * original inline memos exactly.
 */
export function useScatterScales({
  visiblePoints,
  isInputTputMetric,
  xLabel,
  scaleType,
  logScale,
  niceAxes,
  xExtentOverride,
  yExtentOverride,
}: UseScatterScalesArgs): { xScaleConfig: ScaleConfigValue; yScaleConfig: ScaleConfigValue } {
  const xScaleConfigRaw = useMemo(
    () =>
      computeXScaleConfig({
        ext: extentWithFallback(visiblePoints, (d) => d.x, xExtentOverride),
        isInputTputMetric,
        xLabel,
        scaleType,
        niceAxes,
      }),
    [visiblePoints, isInputTputMetric, xLabel, scaleType, niceAxes, xExtentOverride],
  );
  const xScaleConfig = useStableValue(xScaleConfigRaw, isSameScaleConfig);

  const yScaleConfigRaw = useMemo(() => {
    const ext = extentWithFallback(visiblePoints, (d) => d.y, yExtentOverride);
    const useLog = !isInputTputMetric && logScale;
    return {
      type: (useLog ? 'log' : 'linear') as 'log' | 'linear',
      domain: computeYDomain(ext, useLog),
      nice: niceAxes,
    };
  }, [visiblePoints, isInputTputMetric, logScale, niceAxes, yExtentOverride]);
  const yScaleConfig = useStableValue(yScaleConfigRaw, isSameScaleConfig);

  return { xScaleConfig, yScaleConfig };
}

interface UseGpuScalesArgs {
  filteredData: InferenceData[];
  logScale: boolean;
}

/**
 * GPUGraph's x extent (always linear, pinned at 0) + y domain (plain `logScale`
 * predicate). Shares `extentWithFallback` + `computeYDomain` with the scatter
 * path. No value-stabilisation wrapper — GPUGraph passed these straight into
 * `<D3Chart>` inline, so keeping the same memo granularity preserves behaviour.
 */
export function useGpuScales({ filteredData, logScale }: UseGpuScalesArgs): {
  xExtent: [number, number];
  yDomain: [number, number];
} {
  const xExtent = useMemo(() => {
    if (filteredData.length === 0) return [0, 100] as [number, number];
    const ext = d3.extent(filteredData, (d) => d.x) as [number, number];
    return [0, ext[1] * 1.05] as [number, number];
  }, [filteredData]);

  const yDomain = useMemo(() => {
    if (filteredData.length === 0) return [0, 100] as [number, number];
    const ext = d3.extent(filteredData, (d) => d.y) as [number, number];
    return computeYDomain(ext, logScale);
  }, [filteredData, logScale]);

  return { xExtent, yDomain };
}
