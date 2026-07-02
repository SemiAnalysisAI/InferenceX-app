'use client';

import { useMemo } from 'react';

import type { TimeSeriesPoint } from '@/hooks/api/use-trace-server-metrics';

import { ChartHover, type HoverItem } from './chart-hover';
import { CHART_PAD, ChartEmpty, fmtCount, fmtSeconds } from './chart-shared';
import { interpAt, type ChartSeries } from './time-series-math';

// Historical entry point: the pure data-shaping helpers lived in this module
// before being extracted; re-export them so both import paths stay valid.
export * from './time-series-math';

/** A constant horizontal reference line (e.g. a capacity ceiling). */
export interface ReferenceLine {
  value: number;
  label: string;
  /** Line + label color. Defaults to a muted emerald. */
  color?: string;
}

interface TimeSeriesChartProps {
  series: ChartSeries[];
  durationS: number;
  yMax?: number;
  yFmt?: (v: number) => string;
  yAxisLabel?: string;
  width?: number;
  height?: number;
  /**
   * Horizontal reference lines drawn across the plot. Their values are folded
   * into the auto y-max so the line stays on-chart even when it exceeds the
   * data (e.g. a KV-cache pool ceiling well above the working set).
   */
  refLines?: readonly ReferenceLine[];
}

const NO_REF_LINES: readonly ReferenceLine[] = [];

const PAD = CHART_PAD;

export function TimeSeriesChart({
  series,
  durationS,
  yMax: yMaxOpt,
  yFmt = fmtCount,
  yAxisLabel,
  width = 720,
  height = 260,
  refLines = NO_REF_LINES,
}: TimeSeriesChartProps) {
  const W = width;
  const H = height;

  const layout = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xMax = Math.max(durationS, 1);
    // Fold reference-line values into the auto max so a ceiling above the data
    // (e.g. KV-cache pool >> working set) still renders inside the plot.
    const refMax = refLines.length > 0 ? Math.max(...refLines.map((r) => r.value)) : 0;
    const yMax =
      yMaxOpt ?? Math.max(1e-9, refMax, ...series.flatMap((s) => s.data.map((d) => d.value)));
    const xScale = (t: number) => PAD.left + (t / xMax) * innerW;
    const yScale = (v: number) => PAD.top + (1 - v / yMax) * innerH;
    return { innerW, innerH, xMax, yMax, xScale, yScale };
  }, [series, durationS, yMaxOpt, refLines, W, H]);

  const { innerW, innerH, xMax, yMax, xScale, yScale } = layout;

  const subsample = (arr: TimeSeriesPoint[]) => {
    if (arr.length === 0) return arr;
    const stride = Math.max(1, Math.floor(arr.length / innerW));
    return stride > 1 ? arr.filter((_, i) => i % stride === 0) : arr;
  };

  // Pre-format axis ticks.
  const xTickVals = Array.from({ length: 5 }, (_, i) => (xMax * i) / 4);
  const yTickVals = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);

  const resolve = (fraction: number) => {
    const t = fraction * xMax;
    const items: HoverItem[] = [];
    for (const s of series) {
      if (s.hideFromHover) continue;
      const v = interpAt(s.data, t);
      if (v === null || !Number.isFinite(v)) continue;
      items.push({ color: s.color, label: s.name, value: yFmt(v) });
    }
    if (items.length === 0) return null;
    return { items, title: fmtSeconds(t) };
  };

  if (series.every((s) => s.data.length === 0)) {
    return <ChartEmpty />;
  }

  return (
    <ChartHover pad={PAD} width={W} height={H} resolve={resolve}>
      {/* y-axis gridlines + labels */}
      {yTickVals.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={`y${i}`}>
            <line
              x1={PAD.left - 4}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="currentColor"
              opacity={0.08}
            />
            <text
              x={PAD.left - 8}
              y={y + 3}
              fontSize={10}
              fill="currentColor"
              opacity={0.55}
              textAnchor="end"
            >
              {yFmt(v)}
            </text>
          </g>
        );
      })}

      {/* Raw scatter underlay */}
      {series
        .filter((s) => s.rawData && s.rawData.length > 0)
        .map((s, si) =>
          subsample(s.rawData!).map((d, i) => (
            <circle
              key={`r${si}-${i}`}
              cx={xScale(d.t)}
              cy={yScale(d.value)}
              r={1.5}
              fill={s.color}
              opacity={0.2}
            />
          )),
        )}

      {/* Lines */}
      {series.map((s, si) => {
        if (s.data.length === 0) return null;
        const sampled = subsample(s.data);
        const path = sampled
          .map(
            (d, i) =>
              `${i === 0 ? 'M' : 'L'}${xScale(d.t).toFixed(2)},${yScale(d.value).toFixed(2)}`,
          )
          .join(' ');
        return (
          <path
            key={`l${si}`}
            d={path}
            fill="none"
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 1.8}
            strokeOpacity={s.strokeOpacity ?? 1}
          />
        );
      })}

      {/* Horizontal reference lines (e.g. KV-cache pool ceiling). Drawn on top
          of the data lines, with a label pinned to the right edge. */}
      {refLines.map((ref, i) => {
        if (!Number.isFinite(ref.value) || ref.value < 0 || ref.value > yMax) return null;
        const y = yScale(ref.value);
        const color = ref.color ?? '#16a34a';
        return (
          <g key={`ref${i}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.85}
            />
            <text
              x={PAD.left + innerW - 4}
              y={y - 4}
              fontSize={10}
              fill={color}
              opacity={0.95}
              textAnchor="end"
            >
              {ref.label}
            </text>
          </g>
        );
      })}

      {/* X-axis */}
      <line
        x1={PAD.left}
        x2={PAD.left + innerW}
        y1={PAD.top + innerH}
        y2={PAD.top + innerH}
        stroke="currentColor"
        opacity={0.2}
      />
      {xTickVals.map((v, i) => {
        const x = xScale(v);
        const anchor = i === 0 ? 'start' : i === xTickVals.length - 1 ? 'end' : 'middle';
        return (
          <text
            key={`x${i}`}
            x={x}
            y={PAD.top + innerH + 14}
            fontSize={11}
            fill="currentColor"
            opacity={0.7}
            textAnchor={anchor}
          >
            {fmtSeconds(v)}
          </text>
        );
      })}
      <text
        x={W / 2}
        y={H - 22}
        fontSize={11}
        fill="currentColor"
        opacity={0.55}
        textAnchor="middle"
      >
        time
      </text>

      {yAxisLabel && (
        <text
          x={10}
          y={H / 2}
          fontSize={11}
          fill="currentColor"
          opacity={0.55}
          textAnchor="middle"
          transform={`rotate(-90 10 ${H / 2})`}
        >
          {yAxisLabel}
        </text>
      )}

      {/* Legend — skip series flagged hideFromHover so per-engine
          underlays don't clutter the chip row. */}
      {(() => {
        const visible = series.filter((s) => !s.hideFromHover);
        const chipY = H - 8;
        const chipW = innerW / Math.max(1, visible.length);
        return visible.map((s, i) => {
          const x = PAD.left + i * chipW;
          return (
            <g key={`leg${i}`}>
              <line
                x1={x + 2}
                x2={x + 14}
                y1={chipY - 4}
                y2={chipY - 4}
                stroke={s.color}
                strokeWidth={s.strokeWidth ?? 2}
              />
              <text x={x + 18} y={chipY} fontSize={11} fill="currentColor" opacity={0.9}>
                {s.name}
              </text>
            </g>
          );
        });
      })()}
    </ChartHover>
  );
}

// Fixed colors for the token-source names the chart-series builder emits
// (vLLM names first, then the SGLang names compute-chart-series produces).
const KNOWN_SOURCE_COLORS: Record<string, string> = {
  local_compute: '#f97316',
  local_cache_hit: '#3b82f6',
  external_kv_transfer: '#22c55e',
  miss: '#f97316',
  'cache hit (HBM)': '#3b82f6',
  'cache hit (CPU offload)': '#22c55e',
  'cache hit': '#3b82f6',
  'compute (miss)': '#f97316',
};

const SOURCE_LABELS: Record<string, string> = {
  local_compute: 'Prefill',
  local_cache_hit: 'HBM Cache Hit',
  external_kv_transfer: 'Offload Cache Hit',
  miss: 'Miss',
};

// Fallback palette for any source name not in KNOWN_SOURCE_COLORS so we never
// emit two layers in the same shade. Cycles by stack (insertion) order.
const FALLBACK_PALETTE = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#f59e0b',
  '#ec4899',
];

/** Stacked-area chart for token-source share over time. */
export function StackedAreaChart({
  sourceSeries,
  durationS,
  width = 720,
  height = 260,
}: {
  sourceSeries: Record<string, TimeSeriesPoint[]>;
  durationS: number;
  width?: number;
  height?: number;
}) {
  const W = width;
  const H = height;

  const computed = useMemo(() => {
    const entries = Object.entries(sourceSeries).filter(([, v]) => v.length > 0);
    if (entries.length === 0) return null;

    // Different sources can land on different scrape timestamps
    // (SGLang's hits/misses fire on alternating ticks), so we MUST
    // align across all sources before computing shares — otherwise the
    // share calculation indexes into each source's own time axis and
    // mixes values from different moments.
    //
    // Approach: union all timestamps across sources, then for each
    // unique timestamp carry forward the cumulative sum for every
    // source (a source that didn't report at time t holds its previous
    // cumulative value rather than dropping to 0).
    const tValues = [...new Set(entries.flatMap(([, arr]) => arr.map((p) => p.t)))].toSorted(
      (a, b) => a - b,
    );

    // For each source, walk its (sorted) array and produce a parallel
    // cumulative-sum array indexed against `tValues` via carry-forward.
    const cum: Record<string, number[]> = {};
    for (const [name, arr] of entries) {
      const valByT = new Map(arr.map((p) => [p.t, p.value]));
      const out: number[] = Array.from({ length: tValues.length });
      let acc = 0;
      for (let i = 0; i < tValues.length; i++) {
        const v = valByT.get(tValues[i]!);
        if (v !== undefined) acc += v;
        out[i] = acc;
      }
      cum[name] = out;
    }

    const shares: Record<string, number[]> = {};
    for (const name of Object.keys(cum)) shares[name] = [];
    for (let i = 0; i < tValues.length; i++) {
      const total = entries.reduce((s, [name]) => s + (cum[name]?.[i] ?? 0), 0);
      for (const [name] of entries) {
        shares[name]!.push(total > 0 ? (cum[name]?.[i] ?? 0) / total : 0);
      }
    }
    return { tValues, shares };
  }, [sourceSeries]);

  if (!computed) {
    return <ChartEmpty />;
  }
  const { tValues, shares } = computed;

  const stackOrder = Object.keys(shares);

  // Assign colors once per render in stack order so the layers and the hover
  // tooltip always agree, including for unknown source names on the fallback
  // palette.
  const colorByName = new Map<string, string>();
  let fallbackIdx = 0;
  for (const name of stackOrder) {
    const known = KNOWN_SOURCE_COLORS[name];
    colorByName.set(name, known ?? FALLBACK_PALETTE[fallbackIdx++ % FALLBACK_PALETTE.length]!);
  }
  const colorFor = (name: string): string => colorByName.get(name) ?? FALLBACK_PALETTE[0]!;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xMax = Math.max(durationS, 1);
  const xScale = (t: number) => PAD.left + (t / xMax) * innerW;
  const yScale = (v: number) => PAD.top + (1 - v) * innerH;

  const lower: number[] = Array.from({ length: tValues.length }, () => 0);
  const layers = stackOrder.map((name) => {
    const upper = shares[name]!.map((v, i) => lower[i]! + v);
    const top = upper.map((v, i) => [xScale(tValues[i]!), yScale(v)] as [number, number]);
    const bottom = lower.map((v, i) => [xScale(tValues[i]!), yScale(v)] as [number, number]);
    const d = `${top
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ')} ${[...bottom]
      .toReversed()
      .map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ')} Z`;
    const color = colorFor(name);
    for (let i = 0; i < tValues.length; i++) lower[i] = upper[i]!;
    return { name, color, d };
  });

  const resolve = (fraction: number) => {
    const t = fraction * xMax;
    // Find the closest tValue index.
    let idx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < tValues.length; i++) {
      const d = Math.abs(tValues[i]! - t);
      if (d < bestDist) {
        bestDist = d;
        idx = i;
      }
    }
    const items: HoverItem[] = stackOrder.map((name) => ({
      color: colorFor(name),
      label: SOURCE_LABELS[name] ?? name,
      value: `${((shares[name]?.[idx] ?? 0) * 100).toFixed(1)}%`,
    }));
    return { items, title: fmtSeconds(t) };
  };

  const xTickVals = Array.from({ length: 5 }, (_, i) => (xMax * i) / 4);
  const yTickVals = [0, 0.25, 0.5, 0.75, 1];

  return (
    <ChartHover pad={PAD} width={W} height={H} resolve={resolve}>
      {yTickVals.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={`y${i}`}>
            <line
              x1={PAD.left - 4}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="currentColor"
              opacity={0.08}
            />
            <text
              x={PAD.left - 8}
              y={y + 3}
              fontSize={10}
              fill="currentColor"
              opacity={0.55}
              textAnchor="end"
            >
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
      {layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.color} opacity={0.75} />
      ))}
      <line
        x1={PAD.left}
        x2={PAD.left + innerW}
        y1={PAD.top + innerH}
        y2={PAD.top + innerH}
        stroke="currentColor"
        opacity={0.2}
      />
      {xTickVals.map((v, i) => {
        const x = xScale(v);
        const anchor = i === 0 ? 'start' : i === xTickVals.length - 1 ? 'end' : 'middle';
        return (
          <text
            key={`x${i}`}
            x={x}
            y={PAD.top + innerH + 14}
            fontSize={11}
            fill="currentColor"
            opacity={0.7}
            textAnchor={anchor}
          >
            {fmtSeconds(v)}
          </text>
        );
      })}
      <text
        x={W / 2}
        y={H - 22}
        fontSize={11}
        fill="currentColor"
        opacity={0.55}
        textAnchor="middle"
      >
        time
      </text>
      <text
        x={10}
        y={H / 2}
        fontSize={11}
        fill="currentColor"
        opacity={0.55}
        textAnchor="middle"
        transform={`rotate(-90 10 ${H / 2})`}
      >
        % of prefill tokens
      </text>
      {(() => {
        const chipY = H - 8;
        const chipW = innerW / Math.max(1, layers.length);
        return layers.map((l, i) => {
          const x = PAD.left + i * chipW;
          return (
            <g key={`leg${i}`}>
              <rect x={x + 2} y={chipY - 9} width={12} height={8} fill={l.color} opacity={0.75} />
              <text x={x + 18} y={chipY} fontSize={11} fill="currentColor" opacity={0.9}>
                {SOURCE_LABELS[l.name] ?? l.name}
              </text>
            </g>
          );
        });
      })()}
    </ChartHover>
  );
}
