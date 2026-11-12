'use client';

import { Suspense, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import {
  formatNumber,
  formatDuration,
  formatInteractivity,
  formatPrefillSpeed,
  formatPrefillSpeedCompact,
} from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type {
  GraphHistogram,
  ModelBreakdown,
  StreamingData,
} from '@/lib/agentic-workload-explorer/api-types';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import { DistributionHistogram } from '@/components/agentic-workload-explorer/distribution-histogram';
import {
  TrendsLineChart,
  formatAxisNumber,
  formatAxisPercent,
  formatDayLabel,
  type LineSeries,
} from '@/components/agentic-workload-explorer/trends-charts';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';

const STRINGS = {
  en: {
    yShareOfRequests: 'Share of requests',
    stats: 'Stats',
    streamingPct: 'Streaming %',
    nonStreamingPct: 'Non-streaming %',
    avgStreamingLatency: 'Avg streaming E2E latency',
    avgNonStreamingLatency: 'Avg non-streaming E2E latency',
    ttftP50: 'TTFT (p50)',
    tpotP50: 'TPOT (p50)',
    interactivityP50: 'Interactivity (p50)',
    prefillSpeedP50: 'Prefill speed (p50)',
    failedToLoad: 'Failed to load streaming data',
    streamingRatioOverTime: 'Streaming ratio over time',
    noDailyRatioData: 'No daily ratio data',
    streamingRatioDetail: 'Share of requests that stream, per day',
    noData: 'No data',
    e2eLatencyComparison: 'E2E latency comparison',
    streamingE2eLatency: 'Streaming E2E latency',
    nonStreamingE2eLatency: 'Non-streaming E2E latency',
    e2eLatencyAxis: 'E2E latency',
    ttftTpotPrefill: 'TTFT & TPOT & prefill speed',
    timeToFirstToken: 'Time to first token',
    ttftAxis: 'Time to first token',
    timePerOutputToken: 'Time per output token',
    tpotMsTok: 'TPOT (ms/tok)',
    interactivityLabel: 'Interactivity (output tok/s/user)',
    outputTokSUser: 'output tok/s/user',
    prefillSpeedLabel: 'Prefill speed (input tok/s/query)',
    inputTokSQuery: 'input tok/s/query',
    tokenThroughput: 'Token throughput',
    streamingRequestsOnly: 'Streaming requests only (tokens/sec)',
    tokensSec: 'Tokens/sec',
    streamingByModel: 'Streaming by model',
    model: 'Model',
    streaming: 'Streaming',
    nonStreaming: 'Non-streaming',
    avgStreamingE2e: 'Avg streaming E2E latency',
    avgNonStreamingE2e: 'Avg non-streaming E2E latency',
    samples: (n: string) => `${n} requests`,
  },
  zh: {
    yShareOfRequests: '请求占比',
    stats: '统计',
    streamingPct: '流式请求占比',
    nonStreamingPct: '非流式请求占比',
    avgStreamingLatency: '流式请求平均端到端延迟',
    avgNonStreamingLatency: '非流式请求平均端到端延迟',
    ttftP50: 'TTFT (p50)',
    tpotP50: 'TPOT (p50)',
    interactivityP50: '交互性 (p50)',
    prefillSpeedP50: 'Prefill 速度 (p50)',
    failedToLoad: '加载流式请求数据失败',
    streamingRatioOverTime: '流式请求占比趋势',
    noDailyRatioData: '暂无每日比例数据',
    streamingRatioDetail: '每日流式请求占全部请求的比例',
    noData: '暂无数据',
    e2eLatencyComparison: '端到端延迟对比',
    streamingE2eLatency: '流式请求端到端延迟',
    nonStreamingE2eLatency: '非流式请求端到端延迟',
    e2eLatencyAxis: '端到端延迟',
    ttftTpotPrefill: 'TTFT、TPOT 与 Prefill 速度',
    timeToFirstToken: '首 token 延迟',
    ttftAxis: '首 token 延迟',
    timePerOutputToken: '每输出 token 耗时',
    tpotMsTok: 'TPOT (ms/tok)',
    interactivityLabel: '交互性（output tok/s/user）',
    outputTokSUser: 'output tok/s/user',
    prefillSpeedLabel: 'Prefill 速度（input tok/s/query）',
    inputTokSQuery: 'input tok/s/query',
    tokenThroughput: 'Token 吞吐量',
    streamingRequestsOnly: '仅流式请求（token/s）',
    tokensSec: 'token/s',
    streamingByModel: '按模型的流式请求统计',
    model: '模型',
    streaming: '流式',
    nonStreaming: '非流式',
    avgStreamingE2e: '流式请求平均端到端延迟',
    avgNonStreamingE2e: '非流式请求平均端到端延迟',
    samples: (n: string) => `${n} 个请求`,
  },
};

const LATENCY_COLOR = CHART_COLORS[0];
const SPEED_COLOR = CHART_COLORS[2];

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

function formatTpot(v: number): string {
  return `${v.toFixed(1)}ms`;
}

function formatTokPerSec(v: number): string {
  return v.toFixed(1);
}

function StreamingHistogram({
  title,
  histogram,
  axisLabel,
  format,
  color,
  fileName,
}: {
  title: string;
  histogram: GraphHistogram;
  axisLabel: string;
  format: (v: number) => string;
  color: string;
  fileName: string;
}) {
  const t = STRINGS[useLocale()];
  return (
    <ExpandableChart
      sharedZoom
      title={title}
      subtitle={t.samples(formatNumber(histogram.n))}
      actions={
        <ChartActions
          fileName={fileName}
          onExportPng={() =>
            track('agentic_workload_streaming_histogram_export', {
              title,
              file_name: `${fileName}.png`,
            })
          }
        />
      }
    >
      {(expanded) =>
        histogram.buckets.length === 0 ? (
          <EmptyState bare className="py-8">
            {t.noData}
          </EmptyState>
        ) : (
          <DistributionHistogram
            buckets={histogram.buckets}
            percentiles={histogram.percentiles}
            format={format}
            axisLabel={axisLabel}
            total={histogram.n}
            color={color}
            expanded={expanded}
          />
        )
      }
    </ExpandableChart>
  );
}

function ModelTable({
  byModel,
  strings,
}: {
  byModel: ModelBreakdown[];
  strings: (typeof STRINGS)['en'];
}) {
  const sorted = useMemo(
    () =>
      [...byModel].toSorted(
        (a, b) => b.streamingCount + b.nonStreamingCount - (a.streamingCount + a.nonStreamingCount),
      ),
    [byModel],
  );

  return (
    <Card>
      <SectionHeader label={strings.streamingByModel} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/20 font-medium">
              <th className="py-1.5 pr-4">{strings.model}</th>
              <th className="py-1.5 pr-4 text-right">{strings.streaming}</th>
              <th className="py-1.5 pr-4 text-right">{strings.nonStreaming}</th>
              <th className="py-1.5 pr-4 text-right">{strings.streamingPct}</th>
              <th className="py-1.5 pr-4 text-right">{strings.avgStreamingE2e}</th>
              <th className="py-1.5 text-right">{strings.avgNonStreamingE2e}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const total = m.streamingCount + m.nonStreamingCount;
              const pct = total > 0 ? ((m.streamingCount / total) * 100).toFixed(1) : '0.0';
              return (
                <tr key={m.model} className="border-b border-border/20 hover:bg-surface-hover">
                  <td
                    className="py-1.5 pr-4 text-foreground truncate max-w-[200px]"
                    title={m.model}
                  >
                    {shortenModel(m.model)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-muted-foreground">
                    {formatNumber(m.streamingCount)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-muted-foreground">
                    {formatNumber(m.nonStreamingCount)}
                  </td>
                  <td className="py-1.5 pr-4 text-right">{pct}%</td>
                  <td className="py-1.5 pr-4 text-right text-muted-foreground">
                    {m.streamingAvgLatency === null ? '-' : formatDuration(m.streamingAvgLatency)}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {m.nonStreamingAvgLatency === null
                      ? '-'
                      : formatDuration(m.nonStreamingAvgLatency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function StreamingPage() {
  return (
    <Suspense>
      <StreamingPageContent />
    </Suspense>
  );
}

function StreamingPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { models, selectedModel, setSelectedModel, buildUrl } = useModelFilter();
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading } = useDashboardData<StreamingData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion(
          buildUrl('/api/v1/agentic-workload-explorer/streaming'),
          traceVersionParam,
        ),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: `${selectedModel ?? ''}-${traceVersionParam}`,
  });

  const ratioSeries = useMemo<LineSeries[]>(
    () => [
      {
        key: 'streaming',
        label: t.streamingPct,
        color: LATENCY_COLOR,
        points: (data?.dailyRatio ?? []).map((d) => ({
          day: d.day,
          value: d.totalCount > 0 ? (d.streamingCount / d.totalCount) * 100 : 0,
        })),
      },
    ],
    [data, t],
  );

  const streamingPct =
    data && data.stats.totalCount > 0
      ? ((data.stats.streamingCount / data.stats.totalCount) * 100).toFixed(1)
      : '0.0';
  const nonStreamingPct =
    data && data.stats.totalCount > 0
      ? ((data.stats.nonStreamingCount / data.stats.totalCount) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-5">
      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <ModelFilter
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      )}
      <div>
        <SectionHeader label={t.stats} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : data ? (
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat
              boxed
              label={t.streamingPct}
              value={`${streamingPct}%`}
              detail={`${formatNumber(data.stats.streamingCount)} of ${formatNumber(data.stats.totalCount)}`}
            />
            <Stat
              boxed
              label={t.nonStreamingPct}
              value={`${nonStreamingPct}%`}
              detail={`${formatNumber(data.stats.nonStreamingCount)} of ${formatNumber(data.stats.totalCount)}`}
            />
            <Stat
              boxed
              label={t.avgStreamingLatency}
              value={formatDuration(data.stats.streamingAvgLatency)}
            />
            <Stat
              boxed
              label={t.avgNonStreamingLatency}
              value={formatDuration(data.stats.nonStreamingAvgLatency)}
            />
            <Stat
              boxed
              label={t.ttftP50}
              value={data.ttftStats.count > 0 ? formatDuration(data.ttftStats.p50) : '---'}
              detail={
                data.ttftStats.count > 0 ? `p95 ${formatDuration(data.ttftStats.p95)}` : undefined
              }
            />
            <Stat
              boxed
              label={t.tpotP50}
              valueClassName="whitespace-normal"
              value={data.tpotStats.count > 0 ? `${data.tpotStats.p50.toFixed(1)}ms/tok` : '---'}
              detail={
                data.tpotStats.count > 0 ? `p95 ${data.tpotStats.p95.toFixed(1)}ms/tok` : undefined
              }
            />
            <Stat
              boxed
              label={t.interactivityP50}
              valueClassName="whitespace-normal"
              value={data.tpotStats.count > 0 ? formatInteractivity(data.tpotStats.p50) : '---'}
              detail={
                data.tpotStats.count > 0
                  ? `p95 ${formatInteractivity(data.tpotStats.p95)}`
                  : undefined
              }
            />
            <Stat
              boxed
              label={t.prefillSpeedP50}
              valueClassName="whitespace-normal"
              value={
                data.prefillSpeedStats.count > 0
                  ? formatPrefillSpeed(data.prefillSpeedStats.p50)
                  : '---'
              }
              detail={
                data.prefillSpeedStats.count > 0
                  ? `p95 ${formatPrefillSpeed(data.prefillSpeedStats.p95)}`
                  : undefined
              }
            />
          </dl>
        ) : (
          <EmptyState>{t.failedToLoad}</EmptyState>
        )}
      </div>

      {data && (
        <>
          <TrendsLineChart
            title={t.streamingRatioOverTime}
            subtext={t.streamingRatioDetail}
            series={ratioSeries}
            yFormatter={formatAxisPercent}
            yCeiling={100}
            yLabel={t.yShareOfRequests}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="streaming-ratio"
            emptyLabel={t.noDailyRatioData}
          />

          <div>
            <SectionHeader label={t.e2eLatencyComparison} />
            <div className="grid lg:grid-cols-2 gap-4">
              <StreamingHistogram
                title={t.streamingE2eLatency}
                histogram={data.streamingLatencyDistribution}
                axisLabel={t.e2eLatencyAxis}
                format={formatDuration}
                color={LATENCY_COLOR}
                fileName="streaming-latency"
              />
              <StreamingHistogram
                title={t.nonStreamingE2eLatency}
                histogram={data.nonStreamingLatencyDistribution}
                axisLabel={t.e2eLatencyAxis}
                format={formatDuration}
                color={LATENCY_COLOR}
                fileName="non-streaming-latency"
              />
            </div>
          </div>

          <div>
            <SectionHeader label={t.ttftTpotPrefill} />
            <div className="grid lg:grid-cols-2 gap-4">
              <StreamingHistogram
                title={t.timeToFirstToken}
                histogram={data.ttftDistribution}
                axisLabel={t.ttftAxis}
                format={formatDuration}
                color={LATENCY_COLOR}
                fileName="ttft"
              />
              <StreamingHistogram
                title={t.timePerOutputToken}
                histogram={data.tpotDistribution}
                axisLabel={t.tpotMsTok}
                format={formatTpot}
                color={LATENCY_COLOR}
                fileName="tpot"
              />
              <StreamingHistogram
                title={t.interactivityLabel}
                histogram={data.interactivityDistribution}
                axisLabel={t.outputTokSUser}
                format={formatTokPerSec}
                color={SPEED_COLOR}
                fileName="interactivity"
              />
              <StreamingHistogram
                title={t.prefillSpeedLabel}
                histogram={data.prefillSpeedDistribution}
                axisLabel={t.inputTokSQuery}
                format={formatPrefillSpeedCompact}
                color={SPEED_COLOR}
                fileName="prefill-speed"
              />
            </div>
          </div>

          <div>
            <SectionHeader label={t.tokenThroughput} />
            <StreamingHistogram
              title={t.streamingRequestsOnly}
              histogram={data.throughputDistribution}
              axisLabel={t.tokensSec}
              format={formatAxisNumber}
              color={SPEED_COLOR}
              fileName="throughput"
            />
          </div>

          {data.byModel.length > 0 && <ModelTable byModel={data.byModel} strings={t} />}
        </>
      )}
    </div>
  );
}
