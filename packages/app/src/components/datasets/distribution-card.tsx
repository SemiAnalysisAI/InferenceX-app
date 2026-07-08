'use client';

import { useMemo } from 'react';

import { Card } from '@/components/ui/card';
import { ChartHover, type HoverItem } from '@/components/inference/agentic-point/chart-hover';
import type { Distribution } from '@/hooks/api/use-datasets';
import { useLocale } from '@/lib/use-locale';
import { compact } from './format';

const STRINGS = {
  en: {
    noData: 'No data',
    logScale: 'log scale',
    range: 'Range',
    count: 'Count',
  },
  zh: {
    noData: '暂无数据',
    logScale: '对数刻度',
    range: '范围',
    count: '数量',
  },
} as const;

interface DistributionCardProps {
  title: string;
  subtitle?: string;
  unit: string;
  distribution?: Distribution;
  scale?: 'log' | 'linear';
  formatValue?: (v: number) => string;
}

const W = 720;
const H = 240;
const PAD = { top: 12, right: 16, bottom: 48, left: 52 };

export function DistributionCard({
  title,
  subtitle,
  unit,
  distribution,
  scale = 'linear',
  formatValue = compact,
}: DistributionCardProps) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const computed = useMemo(() => {
    const bins = distribution?.bins ?? [];
    if (bins.length === 0) return null;
    const maxCount = Math.max(1, ...bins.map((b) => b.count));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = bins.length;
    const barW = innerW / n;
    const valueToX = (v: number): number => {
      for (let i = 0; i < n; i++) {
        if (v >= bins[i].x0 && (v < bins[i].x1 || i === n - 1)) {
          return PAD.left + (i + 0.5) * barW;
        }
      }
      if (v <= bins[0].x0) return PAD.left + 0.5 * barW;
      return PAD.left + (n - 0.5) * barW;
    };
    return { bins, maxCount, innerW, innerH, n, barW, valueToX };
  }, [distribution]);

  if (!computed) {
    return (
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium text-foreground">{title}</div>
        <div className="grid h-[240px] place-items-center text-xs text-muted-foreground">
          {t.noData}
        </div>
      </Card>
    );
  }

  const { bins, maxCount, innerW, innerH, n, barW, valueToX } = computed;
  const stats = distribution?.stats;

  const guides: { label: string; value: number; color: string }[] = stats
    ? [
        { label: 'p50', value: stats.median, color: '#3b82f6' },
        ...(typeof stats.p75 === 'number'
          ? [{ label: 'p75', value: stats.p75, color: '#22c55e' }]
          : []),
        { label: 'p90', value: stats.p90, color: '#f59e0b' },
        ...(typeof stats.p95 === 'number'
          ? [{ label: 'p95', value: stats.p95, color: '#ef4444' }]
          : []),
      ]
    : [];

  const tickIdxs = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];

  const resolve = (fraction: number) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(fraction * n)));
    const b = bins[i];
    const items: HoverItem[] = [
      {
        color: 'currentColor',
        label: t.range,
        value: `${formatValue(b.x0)}–${formatValue(b.x1)} ${unit}`,
      },
      { color: 'currentColor', label: t.count, value: b.count.toLocaleString() },
    ];
    return { items };
  };

  return (
    <Card className="p-4">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {scale === 'log' && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t.logScale}
          </span>
        )}
      </div>
      {subtitle && <div className="mb-1 text-xs text-muted-foreground">{subtitle}</div>}
      {stats && (
        <div className="mb-2 text-xs text-muted-foreground">
          n={stats.count.toLocaleString()} · p50 {formatValue(stats.median)}
          {typeof stats.p75 === 'number' && <> · p75 {formatValue(stats.p75)}</>} · p90{' '}
          {formatValue(stats.p90)}
          {typeof stats.p95 === 'number' && <> · p95 {formatValue(stats.p95)}</>} · max{' '}
          {formatValue(stats.max)} {unit}
        </div>
      )}
      <div className="w-full text-muted-foreground">
        <ChartHover pad={PAD} width={W} height={H} resolve={resolve}>
          {/* bars */}
          {bins.map((b, i) => {
            const h = (b.count / maxCount) * innerH;
            const x = PAD.left + i * barW;
            const y = PAD.top + (innerH - h);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={Math.max(0, barW - 1)}
                height={h}
                className="fill-primary/55"
              />
            );
          })}

          {/* guide lines */}
          {guides.map((g) => {
            const x = valueToX(g.value);
            return (
              <line
                key={g.label}
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke={g.color}
                strokeWidth={2}
                strokeDasharray="5 3"
                opacity={0.95}
              />
            );
          })}

          {/* x axis */}
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={PAD.top + innerH}
            y2={PAD.top + innerH}
            stroke="currentColor"
            opacity={0.2}
          />
          {tickIdxs.map((i, k) => {
            const anchor = k === 0 ? 'start' : k === tickIdxs.length - 1 ? 'end' : 'middle';
            const x = PAD.left + (i + 0.5) * barW;
            return (
              <text
                key={i}
                x={x}
                y={PAD.top + innerH + 14}
                fontSize={11}
                fill="currentColor"
                opacity={0.7}
                textAnchor={anchor}
              >
                {formatValue(bins[i].x0)}
              </text>
            );
          })}
          <text
            x={W / 2}
            y={H - 16}
            fontSize={11}
            fill="currentColor"
            opacity={0.55}
            textAnchor="middle"
          >
            {unit}
          </text>

          {/* guide legend */}
          {guides.map((g, i) => (
            <g key={g.label} transform={`translate(${PAD.left + i * 110}, ${PAD.top})`}>
              <line
                x1={0}
                x2={12}
                y1={4}
                y2={4}
                stroke={g.color}
                strokeWidth={2}
                strokeDasharray="5 3"
              />
              <text x={16} y={7} fontSize={10} fill="currentColor" opacity={0.85}>
                {g.label} {formatValue(g.value)}
              </text>
            </g>
          ))}
        </ChartHover>
      </div>
    </Card>
  );
}
