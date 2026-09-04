/**
 * InferenceScatter — cost vs interactivity scatter with Pareto frontier line.
 *
 * Complete single-file example. Dependencies: react, recharts, swr (via ./hooks).
 * Data: GET /api/v1/views/inference (each point carries a `frontier` boolean).
 *
 * Usage: <InferenceScatter model="DeepSeek-V4-Pro" metric="costh" sequence="8k/1k" />
 */

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useInferenceView } from './hooks';
import type { InferencePoint, InferenceSeries } from './types';

/** Consistent hardware colors, keyed by GPU base key (first hwKey segment). */
export const GPU_COLORS: Record<string, string> = {
  h100: '#8bc34a',
  h200: '#4caf50',
  b200: '#009688',
  b300: '#00bcd4',
  gb200: '#3f51b5',
  gb300: '#673ab7',
  vr200: '#2196f3',
  rtx6000pro: '#607d8b',
  mi300x: '#ff9800',
  mi325x: '#f44336',
  mi355x: '#e91e63',
  jalapeno: '#795548',
};
export const colorFor = (hwKey: string): string =>
  GPU_COLORS[hwKey.split('_')[0].toLowerCase()] ?? '#9e9e9e';

export interface InferenceScatterProps {
  model: string;
  /** Metric key, e.g. 'costh' (cost $/M tok, hyperscaler) or 'tokensPerDollarN' (API default). */
  metric?: string;
  /** '8k/1k' (API default), '1k/1k', '1k/8k', or 'agentic-traces'. */
  sequence?: string;
  percentile?: 'p75' | 'p90';
  height?: number;
}

export function InferenceScatter({
  model,
  metric = 'costh',
  sequence = '8k/1k',
  percentile = 'p90',
  height = 480,
}: InferenceScatterProps) {
  const { data, error, isLoading } = useInferenceView({ model, metric, sequence, percentile });

  const frontierLine = useMemo(() => {
    if (!data) return [];
    return data.series
      .flatMap((s: InferenceSeries) => s.points.filter((p: InferencePoint) => p.frontier))
      .sort((a: InferencePoint, b: InferencePoint) => a.x - b.x);
  }, [data]);

  if (isLoading) return <p>Loading InferenceX data…</p>;
  if (error) return <p role="alert">Failed to load: {String(error.message ?? error)}</p>;
  if (!data) return null;

  // Registry labels usually already end with their unit, e.g. "... ($)".
  const yLabel =
    data.metric.unit && !/\)\s*$/.test(data.metric.label)
      ? `${data.metric.label} (${data.metric.unit})`
      : data.metric.label;

  return (
    <figure>
      <figcaption>
        {String(data.params.model)} — {data.metric.label} vs {data.xAxis.label} · generated{' '}
        {data.generatedAt}
      </figcaption>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 8, right: 24, bottom: 32, left: 48 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis
            dataKey="x"
            type="number"
            scale="log"
            domain={['auto', 'auto']}
            name={data.xAxis.label}
            label={{ value: data.xAxis.label, position: 'insideBottom', offset: -16 }}
          />
          <YAxis
            dataKey="y"
            type="number"
            scale="log"
            domain={['auto', 'auto']}
            name={yLabel}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -32 }}
          />
          <Tooltip
            formatter={(value: number) =>
              value.toLocaleString(undefined, { maximumSignificantDigits: 4 })
            }
            labelFormatter={() => ''}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {data.series.map((s) => (
            <Scatter
              key={s.hwKey}
              name={s.label}
              data={s.points}
              fill={colorFor(s.hwKey)}
              fillOpacity={0.75}
              isAnimationActive={false}
            />
          ))}
          <Line
            name="Pareto frontier"
            data={frontierLine}
            dataKey="y"
            stroke="#212121"
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
            legendType="line"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

export default InferenceScatter;
