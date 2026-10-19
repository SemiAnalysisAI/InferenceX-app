'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { scaleLinear } from 'd3';
import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';
import { useLocale } from '@/lib/i18n/use-locale';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { formatLargeNumber } from '@/lib/charts/chart-rendering';
import type { TrendChartProps } from './TrendChart';
import {
  buildImprovementWaterfall,
  matchingChanges,
  pullRequestLinks,
} from '../utils/improvement-waterfall';
const number = formatLargeNumber;

const STRINGS = {
  en: {
    series: 'Waterfall series',
    baseline: 'Baseline',
    gain: 'Gain',
    best: 'Best observed',
    noData: 'No measured history for the selected configurations.',
    noGain: 'No improvement after the baseline.',
    run: 'Run',
    noSource: 'Source unavailable',
    excluded: 'dates omitted: output throughput was not recorded for the full source curve.',
    noPr: 'No PR',
    loading: 'Loading PR links…',
    failed: 'PR links unavailable',
    aria: 'Performance improvement waterfall',
    method:
      'Record improvements at fixed interactivity. Regressions and recoveries are omitted. Links identify source-curve runs and matching changelogs, not isolated PR effects. Linear scale.',
  },
  zh: {
    series: '瀑布图配置',
    baseline: '基线',
    gain: '性能提升',
    best: '最佳观测值',
    noData: '所选配置暂无实测历史数据。',
    noGain: '基线之后暂无性能提升。',
    run: '运行',
    noSource: '无来源记录',
    excluded: '个日期已省略：源曲线缺少完整的输出吞吐量记录。',
    noPr: '无关联 PR',
    loading: '正在加载 PR 链接…',
    failed: 'PR 链接暂不可用',
    aria: '性能提升瀑布图',
    method:
      '展示固定交互速率下刷新最佳纪录的变化，不含性能回退及恢复。链接指向源曲线的运行记录及匹配的变更日志，不代表单个 PR 的独立效果。使用线性坐标。',
  },
} as const;

export default function ImprovementWaterfallChart({
  trendLines,
  lineConfigs,
  yLabel,
  chartId = 'historical-trend',
  caption,
  lowerIsBetter = false,
}: TrendChartProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(1000);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [selectedId, setSelectedId] = useState('');
  const config = lineConfigs.find((line) => line.id === selectedId) ?? lineConfigs[0];
  const excludedCount = (config ? (trendLines.get(config.id) ?? []) : []).filter(
    (point) => !point.synthetic && point.waterfallEligible === false,
  ).length;
  const steps = useMemo(
    () => buildImprovementWaterfall(config ? (trendLines.get(config.id) ?? []) : [], lowerIsBetter),
    [config, trendLines, lowerIsBetter],
  );
  const requests = useMemo(
    () => [
      ...new Map(
        steps
          .flatMap((step) => step.sources)
          .map((source) => [
            `${source.date}:${source.benchmarkType}`,
            { date: source.date, type: source.benchmarkType },
          ]),
      ).values(),
    ],
    [steps],
  );
  const queries = useQueries({
    queries: requests.map(({ date, type }) =>
      workflowInfoQueryOptions(date, type === 'agentic_traces' ? type : undefined),
    ),
  });
  const workflows = queries.flatMap((query) => (query.data ? [query.data] : []));
  const width = Math.max(plotWidth, 740, steps.length * 80 + 100);
  const height = 430;
  const left = 90;
  const right = 20;
  const bottom = 375;
  const slot = (width - left - right) / Math.max(steps.length, 1);
  const y = scaleLinear()
    .domain([0, Math.max(...steps.map((step) => Math.max(step.from, step.to)), 1) * 1.14])
    .nice()
    .range([bottom, 20]);
  const first = steps[0]?.to ?? 0;
  const best = steps.at(-1)?.to ?? 0;
  const ratio = first > 0 && best > 0 ? (lowerIsBetter ? first / best : best / first) : 1;

  return (
    <div id={chartId} className="min-w-0 p-4" data-testid="improvement-waterfall">
      <div className="max-h-0 overflow-hidden" aria-hidden="true">
        <div id={`${chartId}-export`} className="p-4" />
      </div>
      <figcaption className="mb-4">{caption}</figcaption>
      <div className="min-w-0">
        <div ref={plotRef} className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <label htmlFor={`${chartId}-series`}>{t.series}</label>
            <select
              id={`${chartId}-series`}
              data-testid="waterfall-series"
              className="max-w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={config?.id ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {lineConfigs.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.label}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground" title={t.method} tabIndex={0}>
              {t.baseline} → {t.best}
            </span>
          </div>
          {steps.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">{t.noData}</p>
          ) : (
            <div className="overflow-x-auto" data-chart-scroll tabIndex={0} aria-label={t.aria}>
              <div style={{ minWidth: width }}>
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  width="100%"
                  role="img"
                  aria-label={`${t.aria}: ${config?.label}. ${t.method}`}
                  data-testid="waterfall-chart-svg"
                  style={{ display: 'block' }}
                >
                  <title>{`${config?.label}: ${t.aria}`}</title>
                  <desc>{t.method}</desc>
                  {y.ticks(6).map((tick) => (
                    <g key={tick}>
                      <line
                        x1={left}
                        x2={width - right}
                        y1={y(tick)}
                        y2={y(tick)}
                        stroke="var(--border)"
                      />
                      <text
                        x={left - 10}
                        y={y(tick)}
                        dy="0.32em"
                        textAnchor="end"
                        fill="var(--muted-foreground)"
                        fontSize={CHART_TYPE.axisLabel}
                      >
                        {number(tick)}
                      </text>
                    </g>
                  ))}
                  <text
                    transform={`translate(18,${bottom / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize={CHART_TYPE.axisLabel}
                  >
                    {yLabel}
                  </text>
                  {steps.map((step, index) => {
                    const x = left + slot * index + slot * 0.15;
                    const barWidth = slot * 0.7;
                    const top = y(Math.max(step.from, step.to));
                    const color =
                      step.kind === 'baseline'
                        ? 'var(--muted-foreground)'
                        : step.kind === 'best'
                          ? 'var(--foreground)'
                          : (config?.color ?? 'var(--primary)');
                    return (
                      <g
                        key={`${step.kind}-${step.date}`}
                        data-testid="waterfall-step"
                        data-kind={step.kind}
                        data-from={step.from}
                        data-to={step.to}
                      >
                        {index < steps.length - 1 && (
                          <line
                            x1={x + barWidth}
                            x2={x + slot}
                            y1={y(step.to)}
                            y2={y(step.to)}
                            stroke="var(--muted-foreground)"
                            strokeWidth={1}
                          />
                        )}
                        <rect
                          x={x}
                          y={top}
                          width={barWidth}
                          height={Math.max(1, Math.abs(y(step.from) - y(step.to)))}
                          fill={color}
                        >
                          <title>{`${t[step.kind]} · ${step.date}: ${number(step.to)} (${step.delta >= 0 ? '+' : '−'}${number(Math.abs(step.delta))})`}</title>
                        </rect>
                        <text
                          x={x + barWidth / 2}
                          y={top - 10}
                          textAnchor="middle"
                          fill={color}
                          fontSize={CHART_TYPE.lineLabel}
                          fontWeight={600}
                        >
                          {step.kind === 'gain'
                            ? `${step.delta >= 0 ? '+' : '−'}${number(Math.abs(step.delta))}`
                            : number(step.to)}
                        </text>
                        {step.kind === 'best' && (
                          <text
                            x={x + barWidth / 2}
                            y={top - 28}
                            textAnchor="middle"
                            fill={color}
                            fontSize={CHART_TYPE.annotation}
                          >
                            {ratio.toFixed(2)}×
                          </text>
                        )}
                        <text
                          x={x + barWidth / 2}
                          y={bottom + 24}
                          textAnchor="middle"
                          fill="var(--foreground)"
                          fontSize={CHART_TYPE.axisLabel}
                        >
                          {new Date(`${step.date}T00:00:00Z`).toLocaleDateString(
                            locale === 'zh' ? 'zh-CN' : 'en-US',
                            { month: 'short', day: 'numeric', timeZone: 'UTC' },
                          )}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y={bottom + 40}
                          textAnchor="middle"
                          fill="var(--muted-foreground)"
                          fontSize={CHART_TYPE.annotation}
                        >
                          {step.date.slice(0, 4)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div
                  className="grid pb-3"
                  style={{
                    marginLeft: left,
                    marginRight: right,
                    gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                  }}
                >
                  {steps.map((step) => {
                    const changes = matchingChanges(step.sources, workflows);
                    const prs = pullRequestLinks(changes);
                    const runs = [
                      ...new Map(step.sources.map((source) => [source.runId, source])).values(),
                    ];
                    const relevantQueries = queries.filter((_, index) =>
                      step.sources.some(
                        (source) =>
                          source.date === requests[index].date &&
                          source.benchmarkType === requests[index].type,
                      ),
                    );
                    const description = changes.map((change) => change.description).join('\n');
                    return (
                      <div
                        key={`${step.kind}-${step.date}`}
                        className="flex min-w-0 flex-col items-center gap-1 overflow-hidden px-1 text-center text-xs"
                        data-testid="waterfall-sources"
                      >
                        <span
                          className="line-clamp-2 min-h-8 w-full overflow-hidden break-words font-medium"
                          title={description || t[step.kind]}
                        >
                          {step.kind === 'gain' && description ? description : t[step.kind]}
                        </span>
                        {prs.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
                            title={description}
                          >
                            PR #{url.split('/').filter(Boolean).at(-1)} ↗
                          </a>
                        ))}
                        {prs.length === 0 && (
                          <span className="text-muted-foreground">
                            {relevantQueries.some((query) => query.isPending)
                              ? t.loading
                              : relevantQueries.some((query) => query.isError)
                                ? t.failed
                                : t.noPr}
                          </span>
                        )}
                        {runs.map((source) => (
                          <a
                            key={source.runId}
                            href={source.runUrl}
                            title={`${t.run} ${source.runId}`}
                            aria-label={`${t.run} ${source.runId}, ${source.date}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          >
                            {t.run} ↗
                          </a>
                        ))}
                        {runs.length === 0 && (
                          <span className="text-muted-foreground">{t.noSource}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {steps.length === 2 && <p className="mt-2 text-sm text-muted-foreground">{t.noGain}</p>}
          {excludedCount > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {excludedCount} {t.excluded}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
