'use client';

import { line, scaleLinear, scaleUtc, utcFormat } from 'd3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { useImageAgeHistory } from '@/hooks/api/use-image-age-history';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { track } from '@/lib/analytics/analytics';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { ImageAgePoint, ImageFilters } from './image-age';

export function ImageAgeChart({
  filters,
  summary,
  locale,
}: {
  filters: ImageFilters;
  summary: ImageAgePoint;
  locale: 'en' | 'zh';
}) {
  const zh = locale === 'zh';
  const { data, isLoading, error, refetch, isFetching } = useImageAgeHistory(
    filters,
    summary.date,
    true,
  );
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 250 });
  const [hovered, setHovered] = useState<number | null>(null);
  const points = data?.ageHistory ?? [];
  const width = Math.max(dimensions.width, 260);
  const x = scaleUtc()
    .domain(
      points.length > 0
        ? [new Date(`${points[0].date}T00:00:00Z`), new Date(`${points.at(-1)!.date}T00:00:00Z`)]
        : [new Date(0), new Date(1)],
    )
    .range([42, width - 16]);
  const y = scaleLinear()
    .domain([0, Math.max(1, ...points.map((p) => p.p90AgeDays ?? 0))])
    .nice()
    .range([212, 26]);
  const path = line<ImageAgePoint>()
    .defined((p) => p.p90AgeDays !== null)
    .x((p) => x(new Date(`${p.date}T00:00:00Z`)))
    .y((p) => y(p.p90AgeDays!))(points);
  const active = points[hovered ?? points.length - 1];
  const hasData = points.some((p) => p.p90AgeDays !== null);
  const dayLabel = (days: number | null) =>
    days === null ? (zh ? '暂无数据' : 'No data') : `${days}${zh ? ' 天' : 'd'}`;

  return (
    <section
      className="mb-6 rounded-lg border border-border p-4 md:p-6"
      aria-labelledby="image-age-title"
      data-testid="image-age-panel"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Heading as="h2" level="card" id="image-age-title">
          {zh ? 'P90 最旧镜像' : 'P90 oldest image'}
        </Heading>
        <p className="text-xl font-semibold tabular-nums" data-testid="image-age-p90">
          {dayLabel(summary.p90AgeDays)}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {zh
          ? `当前筛选下 ${summary.configurationCount} 个配置的提交年龄第 90 百分位，按最近秩法计算。年龄指距上次成功提交的天数，不是镜像构建时间。`
          : `90th-percentile submission age across ${summary.configurationCount} filtered configurations, using nearest rank. Age is days since the last successful submission, not the image build date.`}
      </p>
      <p className="mt-4 text-sm font-medium">{zh ? '过去 90 天 · UTC' : 'Past 90 days · UTC'}</p>
      <div ref={setContainerRef} className="min-w-0">
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground" role="status">
            {zh ? '正在加载历史数据……' : 'Loading history…'}
          </p>
        ) : error ? (
          <div className="py-10 text-center" data-testid="image-age-error">
            <p className="mb-3 text-sm text-destructive">
              {zh
                ? '历史数据加载失败，当前指标和镜像表仍可查看。'
                : 'History could not be loaded. The current metric and image table remain available.'}
            </p>
            <Button
              variant="outline"
              disabled={isFetching}
              onClick={() => {
                track('current_image_history_retry_clicked');
                void refetch();
              }}
            >
              {zh ? '重试' : 'Retry'}
            </Button>
          </div>
        ) : hasData ? (
          <>
            <svg
              width="100%"
              height="250"
              viewBox={`0 0 ${width} 250`}
              role="img"
              aria-label={
                zh
                  ? '过去 90 天的 P90 镜像提交年龄，横轴为日期，纵轴为天数。'
                  : 'P90 image submission age over the past 90 days. X-axis: date. Y-axis: days.'
              }
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                setHovered((previous) =>
                  Math.max(
                    0,
                    Math.min(
                      points.length - 1,
                      (previous ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1),
                    ),
                  ),
                );
              }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const position = ((event.clientX - rect.left) * width) / rect.width;
                setHovered(
                  Math.max(
                    0,
                    Math.min(
                      points.length - 1,
                      Math.round(((position - 42) / (width - 58)) * (points.length - 1)),
                    ),
                  ),
                );
              }}
              onPointerLeave={() => setHovered(null)}
            >
              <text x="0" y="14" fill="currentColor" fontSize={CHART_TYPE.axisLabel}>
                {zh ? '天' : 'Days'}
              </text>
              {y.ticks(4).map((value) => (
                <g key={value}>
                  <line
                    x1="42"
                    x2={width - 16}
                    y1={y(value)}
                    y2={y(value)}
                    className="stroke-border"
                  />
                  <text
                    x="34"
                    y={y(value) + 4}
                    textAnchor="end"
                    className="fill-muted-foreground"
                    fontSize={CHART_TYPE.axisLabel}
                  >
                    {value}
                  </text>
                </g>
              ))}
              {x.ticks(width < 500 ? 3 : 6).map((date) => (
                <text
                  key={date.toISOString()}
                  x={x(date)}
                  y="236"
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={CHART_TYPE.axisLabel}
                >
                  {utcFormat('%m/%d')(date)}
                </text>
              ))}
              <path d={path ?? ''} fill="none" className="stroke-primary" strokeWidth="2" />
              {points
                .filter((p) => p.p90AgeDays !== null)
                .map((p) => (
                  <circle
                    key={p.date}
                    cx={x(new Date(`${p.date}T00:00:00Z`))}
                    cy={y(p.p90AgeDays!)}
                    r="2"
                    className="fill-primary"
                  />
                ))}
              {active && active.p90AgeDays !== null && (
                <circle
                  cx={x(new Date(`${active.date}T00:00:00Z`))}
                  cy={y(active.p90AgeDays)}
                  r="4"
                  className="fill-primary stroke-background"
                  strokeWidth="2"
                />
              )}
            </svg>
            <p className="min-h-5 text-sm tabular-nums" data-testid="image-age-readout">
              {active
                ? `${active.date} · P90 ${dayLabel(active.p90AgeDays)} · ${active.configurationCount} ${zh ? '个配置' : 'configurations'}`
                : ''}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {zh
                ? '移动指针或聚焦图表后按左右方向键查看每日数值。'
                : 'Hover, or focus the chart and use the arrow keys to inspect each day.'}
            </p>
          </>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {zh
              ? '当前筛选下，过去 90 天没有历史记录。'
              : 'No historical observations for these filters in the past 90 days.'}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {zh
          ? '历史曲线按每日已知的最近成功提交重建，沿用当前的模型和场景停用规则。无新提交时年龄继续增加；新配置从首次提交当天起计入。'
          : 'History uses the latest successful submission known on each day and today’s model/scenario retirement rules. Ages increase on days without submissions; new configurations enter on their first submission date.'}
      </p>
    </section>
  );
}
