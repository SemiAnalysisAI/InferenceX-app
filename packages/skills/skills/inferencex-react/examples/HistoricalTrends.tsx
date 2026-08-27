/**
 * HistoricalTrends — metric-over-time line chart per hardware config, at a fixed
 * target interactivity (API default: 35 tok/s/user).
 *
 * Complete single-file example. Dependencies: react, recharts, swr (via ./hooks).
 * Data: GET /api/v1/views/historical
 *       -> { metric, target, series: [{ hwKey, label, points: [{date, value, clamped}] }] }
 *
 * Usage: <HistoricalTrends model="DeepSeek-V4-Pro" metric="costh" target={35} />
 */

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHistoricalView } from './hooks';

const GPU_COLORS: Record<string, string> = {
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
const colorFor = (hwKey: string): string =>
  GPU_COLORS[hwKey.split('_')[0].toLowerCase()] ?? '#9e9e9e';

export interface HistoricalTrendsProps {
  model: string;
  metric?: string;
  sequence?: string;
  /** Target interactivity in tok/s/user (API default 35). */
  target?: number;
  /** Optional YYYY-MM-DD range bounds. */
  start?: string;
  end?: string;
  height?: number;
}

export function HistoricalTrends({
  model,
  metric = 'costh',
  sequence = '8k/1k',
  target = 35,
  start,
  end,
  height = 420,
}: HistoricalTrendsProps) {
  const { data, error, isLoading } = useHistoricalView({
    model,
    metric,
    sequence,
    target,
    start,
    end,
  });

  // Pivot [{date, value}] per series into one row per date: { date, [hwKey]: value }.
  const rows = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const s of data.series) {
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.hwKey] = p.value;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data]);

  if (isLoading) return <p>Loading InferenceX history…</p>;
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
        {String(data.params.model)} — {data.metric.label} @ {data.target} tok/s/user · generated{' '}
        {data.generatedAt}
      </figcaption>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 32, left: 48 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis
            dataKey="date"
            label={{ value: 'Snapshot date', position: 'insideBottom', offset: -16 }}
          />
          <YAxis
            type="number"
            domain={['auto', 'auto']}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -32 }}
          />
          <Tooltip
            formatter={(value: number) =>
              value.toLocaleString(undefined, { maximumSignificantDigits: 4 })
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {data.series.map((s) => (
            <Line
              key={s.hwKey}
              name={s.label}
              dataKey={s.hwKey}
              stroke={colorFor(s.hwKey)}
              strokeWidth={1.8}
              dot={{ r: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

export default HistoricalTrends;
