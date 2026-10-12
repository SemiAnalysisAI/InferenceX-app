'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpandableChart } from '@/components/agentic-workload-explorer/expandable-chart';
import {
  buildHistogram,
  DistributionHistogram,
  type HistogramEntry,
} from '@/components/agentic-workload-explorer/distribution-histogram';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/agentic-workload-explorer/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  formatNumber,
  formatDuration,
  formatInteractivityCompact,
  formatPrefillSpeedCompact,
  computePrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import {
  type StatRow,
  buildStatRows,
  flattenStatRowsChronologically,
} from '@/lib/agentic-workload-explorer/stat-rows';
import { computeSessionCacheHitRates } from '@/lib/agentic-workload-explorer/tokens-over-time';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    apiCacheHitRate: 'API Cache Hit Rate',
    apiCacheHitRateSub: 'As reported by the API across every request in this session',
    theoreticalCacheHitRate: 'Theoretical Upper Bound Cache Hit Rate',
    theoreticalCacheHitRateSub: 'Assuming Infinite Cache TTL & Infinitely Large Cache',
    cacheRead: 'Cache Read',
    cacheWrite: 'Cache Write',
    output: 'Output',
    distribution: 'Distribution',
    noData: 'No data',
    tokenStatistics: 'Token Statistics',
    requestsInRange: (n: number, min: string, max: string) =>
      `${n} request${n > 1 ? 's' : ''} in range ${min}–${max}`,
    turn: (n: number) => `turn ${n}`,
    main: 'Main',
    reqNum: (n: number) => `req #${n}`,
    total: 'Total',
    nReq: (n: number) => `${n} req`,
    childRequest: (n: number) => `└ request ${n}`,
    tokens: 'tokens',
    colTurn: 'Turn',
    colTimestamp: 'Timestamp (UTC)',
    colType: 'Type',
    colModel: 'Model',
    colInput: 'Input',
    colCacheRead: 'Cache Read',
    colCacheWrite: 'Cache Write',
    colOutput: 'Output',
    colCost: 'Cost',
    colTTFT: 'TTFT',
    colPrefillSpeed: 'Prefill (tok/s)',
    colTPOT: 'TPOT',
    colInteractivity: 'Interactivity (tok/s)',
    colDuration: 'Duration',
    colGap: 'Gap',
    ttft: 'TTFT',
    tpot: 'TPOT',
    interactivity: 'Interactivity',
    prefillSpeed: 'Prefill Speed',
    axisLabelTTFT: 'Time to first token',
    axisLabelTPOT: 'Time per output token (ms)',
    axisLabelInteractivity: 'Output tok/s/user',
    axisLabelPrefillSpeed: 'Input tok/s/query',
  },
  zh: {
    apiCacheHitRate: 'API 缓存命中率',
    apiCacheHitRateSub: '基于本会话所有请求的 API 报告值',
    theoreticalCacheHitRate: '理论缓存命中率上界',
    theoreticalCacheHitRateSub: '假设缓存 TTL 无限且缓存容量无限',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    output: '输出',
    distribution: '分布',
    noData: '暂无数据',
    tokenStatistics: 'Token 统计',
    requestsInRange: (n: number, min: string, max: string) => `范围 ${min}–${max} 内 ${n} 个请求`,
    turn: (n: number) => `轮次 ${n}`,
    main: '主智能体',
    reqNum: (n: number) => `请求 #${n}`,
    total: '合计',
    nReq: (n: number) => `${n} 个请求`,
    childRequest: (n: number) => `└ 请求 ${n}`,
    tokens: 'token',
    colTurn: '轮次',
    colTimestamp: '时间戳 (UTC)',
    colType: '类型',
    colModel: '模型',
    colInput: '输入',
    colCacheRead: '缓存读取',
    colCacheWrite: '缓存写入',
    colOutput: '输出',
    colCost: '成本',
    colTTFT: 'TTFT',
    colPrefillSpeed: 'Prefill (tok/s)',
    colTPOT: 'TPOT',
    colInteractivity: '交互性 (tok/s)',
    colDuration: '耗时',
    colGap: '间隔',
    ttft: 'TTFT',
    tpot: 'TPOT',
    interactivity: '交互性',
    prefillSpeed: 'Prefill 速度',
    axisLabelTTFT: '首 token 延迟',
    axisLabelTPOT: '每输出 token 时间 (ms)',
    axisLabelInteractivity: 'Output tok/s/user',
    axisLabelPrefillSpeed: 'Input tok/s/query',
  },
};

interface StatsEntry {
  request: number;
  requestId: string;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

function scrollToRow(turn: number) {
  const el = document.querySelector(`#turn-${turn}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-primary');
    setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 2000);
  }
}

export default function StatisticsPage() {
  const t = STRINGS[useLocale()];
  const { requests, loadUntil } = useSession();
  const params = useParams();
  const id = params.id as string;
  const rows = buildStatRows(requests);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [statsEntries, setStatsEntries] = useState<StatsEntry[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<{
    key: string;
    bucketIdx: number;
    entries: HistogramEntry[];
  } | null>(null);
  const [loadingRequest, setLoadingRequest] = useState<number | null>(null);
  const pendingScrollRef = useRef<HistogramEntry | null>(null);

  useEffect(() => {
    fetch(`/api/v1/agentic-workload-explorer/sessions/${id}/stats`)
      .then((r) => r.json())
      .then((data: { entries: StatsEntry[] }) => setStatsEntries(data.entries))
      .catch(console.error);
  }, [id]);

  // When requests update and we have a pending scroll target, try to scroll
  useEffect(() => {
    const target = pendingScrollRef.current;
    if (target === null) return;
    const info = findTurn(target.requestId, rows);
    if (info) {
      pendingScrollRef.current = null;
      setLoadingRequest(null);
      revealTurn(info);
    } else {
      // loadUntil fetches one page at a time; keep going until the request arrives.
      void loadUntil(target.request);
    }
  }, [requests.length, rows]);

  function revealTurn(info: TurnInfo) {
    if (info.kind === 'subagent_group') {
      setExpandedGroups((prev) => new Set(prev).add(info.turn));
    }
    // Wait for the DOM update
    requestAnimationFrame(() => scrollToRow(info.turn));
  }

  async function navigateToRequest(entry: HistogramEntry) {
    const info = findTurn(entry.requestId, rows);
    if (info) {
      revealTurn(info);
      return;
    }
    // Need to load more
    setLoadingRequest(entry.request);
    pendingScrollRef.current = entry;
    await loadUntil(entry.request);
  }

  function toggleGroup(turn: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      input: acc.input + r.input,
      cacheRead: acc.cacheRead + r.cacheRead,
      cacheWrite: acc.cacheWrite + r.cacheWrite,
      output: acc.output + r.output,
      cost: acc.cost + r.cost,
      durationMs: acc.durationMs + r.durationMs,
      ttftMs: acc.ttftMs + (r.ttftMs ?? 0),
      ttftCount: acc.ttftCount + (r.ttftMs === null ? 0 : 1),
      tpotWeightedMs:
        acc.tpotWeightedMs + (r.tpotMs !== null && r.output > 1 ? r.tpotMs * (r.output - 1) : 0),
      tpotTokenCount: acc.tpotTokenCount + (r.tpotMs !== null && r.output > 1 ? r.output - 1 : 0),
    }),
    {
      input: 0,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
      cost: 0,
      durationMs: 0,
      ttftMs: 0,
      ttftCount: 0,
      tpotWeightedMs: 0,
      tpotTokenCount: 0,
    },
  );

  const gaps = rows.map((row, idx) => {
    if (idx === 0) return null;
    const prev = rows[idx - 1];
    const diffMs = new Date(row.timestamp).getTime() - new Date(prev.timestamp).getTime();
    return diffMs / 1000;
  });

  const tokenCharts: { title: string; key: 'cacheRead' | 'cacheWrite' | 'output' }[] = [
    { title: t.cacheRead, key: 'cacheRead' },
    { title: t.cacheWrite, key: 'cacheWrite' },
    { title: t.output, key: 'output' },
  ];

  // Timing distributions are per request; group rows sum tokens across many
  // subagent requests but keep a single TTFT.
  const leaves = flattenStatRowsChronologically(rows).map((l) => l.row);
  const tpotRows = leaves.filter((r) => r.tpotMs !== null && r.tpotMs > 0);
  const timingCharts: {
    title: string;
    values: number[];
    format: (v: number) => string;
    axisLabel: string;
    sourceValues?: number[];
    sourceTransform?: (v: number) => number;
  }[] = [
    {
      title: t.ttft,
      values: leaves.filter((r) => r.ttftMs !== null).map((r) => r.ttftMs!),
      format: formatDuration,
      axisLabel: t.axisLabelTTFT,
    },
    {
      title: t.tpot,
      values: leaves.filter((r) => r.tpotMs !== null).map((r) => r.tpotMs!),
      format: (v) => `${v.toFixed(1)}ms`,
      axisLabel: t.axisLabelTPOT,
    },
    {
      title: t.interactivity,
      values: tpotRows.map((r) => 1000 / r.tpotMs!).filter((v) => v <= 200),
      format: (v) => v.toFixed(1),
      axisLabel: t.axisLabelInteractivity,
      sourceValues: tpotRows.map((r) => r.tpotMs!),
      sourceTransform: (v) => 1000 / v,
    },
    {
      title: t.prefillSpeed,
      values: leaves
        .filter(
          (r) => r.ttftMs !== null && r.ttftMs > 0 && (r.cacheRead ?? 0) + (r.cacheWrite ?? 0) > 0,
        )
        .map((r) => ((r.cacheRead ?? 0) + (r.cacheWrite ?? 0)) / (r.ttftMs! / 1000)),
      format: formatPrefillSpeedCompact,
      axisLabel: t.axisLabelPrefillSpeed,
    },
  ];

  // Whole-session cache hit rates — the API number alongside the trie-derived
  // upper bound. Mirrors the tiles on the Tokens Over Time chart but covers
  // every agent's request, not just the main agent's.
  const cacheHitRates = computeSessionCacheHitRates(requests);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CacheHitRateCard
          label={t.apiCacheHitRate}
          value={cacheHitRates.api}
          subLabel={t.apiCacheHitRateSub}
        />
        <CacheHitRateCard
          label={t.theoreticalCacheHitRate}
          value={cacheHitRates.hash}
          subLabel={t.theoreticalCacheHitRateSub}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {tokenCharts.map(({ title, key }) => {
          const indexed = statsEntries
            .map((e) => ({ request: e.request, requestId: e.requestId, value: e[key] }))
            .filter((e) => e.value > 0);
          if (indexed.length === 0) return <EmptyDistribution key={key} title={title} t={t} />;
          const buckets = buildHistogram(indexed, 50);
          const sorted = indexed.map((e) => e.value).toSorted((a, b) => a - b);
          const percentiles = ['p25', 'p50', 'p75', 'p90', 'p99'].map((label) => ({
            label,
            value: percentileOf(sorted, Number(label.slice(1))),
          }));
          const selectedIdx = selectedBucket?.key === key ? selectedBucket.bucketIdx : null;

          return (
            <ExpandableChart
              key={key}
              sharedZoom
              title={
                <>
                  {title} {t.distribution}{' '}
                  <span className="text-muted-foreground font-normal">(N={indexed.length})</span>
                </>
              }
            >
              {(expanded, close) => (
                <>
                  <DistributionHistogram
                    buckets={buckets}
                    percentiles={percentiles}
                    format={formatNumber}
                    axisLabel={`${title} ${t.tokens}`}
                    total={indexed.length}
                    expanded={expanded}
                    selectedIdx={selectedIdx}
                    onBucketClick={(bi) => {
                      track('agentic_workload_statistics_bucket_selected', {
                        key,
                        bucketIdx: bi,
                      });
                      setSelectedBucket(
                        selectedIdx === bi
                          ? null
                          : { key, bucketIdx: bi, entries: buckets[bi].entries },
                      );
                    }}
                  />
                  {selectedIdx !== null && selectedBucket && (
                    <div className="mt-3 border border-border rounded-md p-2 bg-muted/30 max-h-48 overflow-y-auto">
                      <p className="text-3xs text-muted-foreground mb-1.5 font-medium">
                        {t.requestsInRange(
                          selectedBucket.entries.length,
                          formatNumber(buckets[selectedIdx].min),
                          formatNumber(buckets[selectedIdx].max),
                        )}
                      </p>
                      <div className="space-y-0.5">
                        {selectedBucket.entries.map((e) => {
                          const turnInfo = findTurn(e.requestId, rows);
                          const isLoading = loadingRequest === e.request;
                          return (
                            <button
                              key={e.request}
                              disabled={isLoading}
                              className="w-full flex items-center justify-between text-xs px-1.5 py-1 rounded hover:bg-muted transition-colors text-left disabled:opacity-50"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                track('agentic_workload_statistics_request_navigated', {
                                  request: e.request,
                                });
                                // The table is behind the dialog.
                                close();
                                void navigateToRequest(e);
                              }}
                            >
                              <span className="font-mono flex items-center gap-1.5">
                                {isLoading && (
                                  <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                )}
                                {turnInfo ? (
                                  <>
                                    <span>{t.turn(turnInfo.turn)}</span>
                                    {turnInfo.kind === 'subagent_group' ? (
                                      <Badge
                                        variant="outline"
                                        className="text-3xs px-1 py-0 border-purple-500/30 text-purple-400"
                                      >
                                        {turnInfo.label}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">{t.main}</span>
                                    )}
                                  </>
                                ) : (
                                  <span>{t.reqNum(e.request)}</span>
                                )}
                              </span>
                              <span className="font-mono">{formatNumber(e.value)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </ExpandableChart>
          );
        })}
      </div>

      {/* TTFT / TPOT / Interactivity / Prefill Speed Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {timingCharts.map(({ title, values, format, axisLabel, sourceValues, sourceTransform }) => {
          if (values.length === 0) return <EmptyDistribution key={title} title={title} t={t} />;
          const buckets = buildHistogram(
            values.map((value, request) => ({ request, value })),
            30,
          );
          // Interactivity percentiles come from TPOT so p90 is the slow tail.
          const source = (sourceValues ?? values).toSorted((a, b) => a - b);
          const transform = sourceTransform ?? ((v: number) => v);
          const percentiles = ['p50', 'p75', 'p90', 'p95', 'p99'].map((label) => ({
            label,
            value: transform(percentileOf(source, Number(label.slice(1)))),
          }));

          return (
            <ExpandableChart
              key={title}
              sharedZoom
              title={
                <>
                  {title} {t.distribution}{' '}
                  <span className="text-muted-foreground font-normal">(N={values.length})</span>
                </>
              }
            >
              {(expanded) => (
                <DistributionHistogram
                  buckets={buckets}
                  percentiles={percentiles}
                  format={format}
                  axisLabel={axisLabel}
                  total={values.length}
                  expanded={expanded}
                />
              )}
            </ExpandableChart>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.tokenStatistics}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-16">{t.colTurn}</TableHead>
                <TableHead>{t.colTimestamp}</TableHead>
                <TableHead>{t.colType}</TableHead>
                <TableHead>{t.colModel}</TableHead>
                <TableHead className="text-right">{t.colInput}</TableHead>
                <TableHead className="text-right">{t.colCacheRead}</TableHead>
                <TableHead className="text-right">{t.colCacheWrite}</TableHead>
                <TableHead className="text-right">{t.colOutput}</TableHead>
                <TableHead className="text-right">{t.colCost}</TableHead>
                <TableHead className="text-right">{t.colTTFT}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t.colPrefillSpeed}</TableHead>
                <TableHead className="text-right">{t.colTPOT}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t.colInteractivity}</TableHead>
                <TableHead className="text-right">{t.colDuration}</TableHead>
                <TableHead className="text-right">{t.colGap}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIdx) => {
                const gap = gaps[rowIdx];
                const gapStr = gap === null ? '—' : `${gap.toFixed(1)}s`;
                if (row.kind === 'main') {
                  return (
                    <TableRow key={row.turn} id={`turn-${row.turn}`}>
                      <TableCell className="font-mono text-xs">{row.turn}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatUTC(row.timestamp)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{t.main}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.model || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.input)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cacheRead > 0 ? formatNumber(row.cacheRead) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cacheWrite > 0 ? formatNumber(row.cacheWrite) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.output)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cost > 0 ? `$${row.cost.toFixed(4)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.ttftMs === null ? '—' : formatDuration(row.ttftMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-sky-500">
                        {(() => {
                          const ps = computePrefillSpeed(row.cacheRead, row.cacheWrite, row.ttftMs);
                          return ps === null ? '—' : formatPrefillSpeedCompact(ps);
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatDuration(row.tpotMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatInteractivityCompact(row.tpotMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.durationMs > 0 ? formatDuration(row.durationMs) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{gapStr}</TableCell>
                    </TableRow>
                  );
                }

                const isExpanded = expandedGroups.has(row.turn);
                return (
                  <Fragment key={row.turn}>
                    <TableRow
                      id={`turn-${row.turn}`}
                      className="cursor-pointer bg-purple-500/5 hover:bg-purple-500/10"
                      onClick={() => {
                        track('agentic_workload_statistics_group_toggled', { turn: row.turn });
                        toggleGroup(row.turn);
                      }}
                    >
                      <TableCell className="font-mono text-xs">{row.turn}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatUTC(row.timestamp)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs border-purple-500/30 text-purple-400"
                          >
                            {row.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t.nReq(row.requestCount)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.model || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.input)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cacheRead > 0 ? formatNumber(row.cacheRead) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cacheWrite > 0 ? formatNumber(row.cacheWrite) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(row.output)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.cost > 0 ? `$${row.cost.toFixed(4)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.ttftMs === null ? '—' : formatDuration(row.ttftMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-sky-500">
                        {(() => {
                          const ps = computePrefillSpeed(row.cacheRead, row.cacheWrite, row.ttftMs);
                          return ps === null ? '—' : formatPrefillSpeedCompact(ps);
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatDuration(row.tpotMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatInteractivityCompact(row.tpotMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.durationMs > 0 ? formatDuration(row.durationMs) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{gapStr}</TableCell>
                    </TableRow>
                    {isExpanded &&
                      row.children.map((child, ci) => {
                        const prevTs = ci === 0 ? row.timestamp : row.children[ci - 1].timestamp;
                        const childGap =
                          (new Date(child.timestamp).getTime() - new Date(prevTs).getTime()) / 1000;
                        return (
                          <TableRow key={`${row.turn}-sub-${ci}`} className="bg-purple-500/5">
                            <TableCell />
                            <TableCell className="font-mono text-xs">
                              {formatUTC(child.timestamp)}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground pl-4">
                                {t.childRequest(ci + 1)}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {child.model || '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatNumber(child.input)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.cacheRead > 0 ? formatNumber(child.cacheRead) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.cacheWrite > 0 ? formatNumber(child.cacheWrite) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatNumber(child.output)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.cost > 0 ? `$${child.cost.toFixed(4)}` : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.ttftMs === null ? '—' : formatDuration(child.ttftMs)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-sky-500">
                              {(() => {
                                const ps = computePrefillSpeed(
                                  child.cacheRead,
                                  child.cacheWrite,
                                  child.ttftMs,
                                );
                                return ps === null ? '—' : formatPrefillSpeedCompact(ps);
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.tpotMs === null ? '—' : formatDuration(child.tpotMs)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.tpotMs === null
                                ? '—'
                                : formatInteractivityCompact(child.tpotMs)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.durationMs > 0 ? formatDuration(child.durationMs) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {childGap.toFixed(1)}s
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="font-medium">
                <TableCell />
                <TableCell />
                <TableCell className="text-xs">{t.total}</TableCell>
                <TableCell />
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(totals.input)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.cacheRead > 0 ? formatNumber(totals.cacheRead) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.cacheWrite > 0 ? formatNumber(totals.cacheWrite) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(totals.output)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  ${totals.cost.toFixed(4)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.ttftCount > 0 ? formatDuration(totals.ttftMs / totals.ttftCount) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-sky-500">
                  {(() => {
                    const avgTtft = totals.ttftCount > 0 ? totals.ttftMs / totals.ttftCount : null;
                    const ps = computePrefillSpeed(totals.cacheRead, totals.cacheWrite, avgTtft);
                    return ps === null ? '—' : formatPrefillSpeedCompact(ps);
                  })()}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.tpotTokenCount > 0
                    ? formatDuration(totals.tpotWeightedMs / totals.tpotTokenCount)
                    : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.tpotTokenCount > 0
                    ? formatInteractivityCompact(totals.tpotWeightedMs / totals.tpotTokenCount)
                    : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatDuration(totals.durationMs)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CacheHitRateCard({
  label,
  value,
  subLabel,
}: {
  label: string;
  value: number;
  subLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-mono font-bold tabular-nums text-foreground">
          {value.toFixed(1)}%
        </div>
        <div className="mt-1 text-3xs font-mono text-subtle">{subLabel}</div>
      </CardContent>
    </Card>
  );
}

function formatUTC(ts: string): string {
  const d = new Date(ts);
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/u, ' UTC');
}

function percentileOf(sorted: number[], p: number): number {
  return sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
}

function EmptyDistribution({ title, t }: { title: string; t: (typeof STRINGS)['en'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {title} {t.distribution}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{t.noData}</p>
      </CardContent>
    </Card>
  );
}

interface TurnInfo {
  turn: number;
  kind: 'main' | 'subagent_group';
  label?: string;
}

/** The table row holding a request: its own row, or the subagent group containing it. */
function findTurn(requestId: string | undefined, rows: StatRow[]): TurnInfo | null {
  for (const row of rows) {
    if (row.kind === 'main') {
      if (row.requestId === requestId) return { turn: row.turn, kind: 'main' };
    } else if (row.children.some((c) => c.requestId === requestId)) {
      return { turn: row.turn, kind: 'subagent_group', label: row.label };
    }
  }
  return null;
}
