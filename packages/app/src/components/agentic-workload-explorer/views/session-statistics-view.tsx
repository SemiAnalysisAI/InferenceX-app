'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpandableChart } from '@/components/agentic-workload-explorer/expandable-chart';
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
  formatInteractivity,
  formatPrefillSpeed,
  computePrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import { type StatRow, buildStatRows } from '@/lib/agentic-workload-explorer/stat-rows';
import { computeSessionCacheHitRates } from '@/lib/agentic-workload-explorer/tokens-over-time';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

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
    tokens: 'Tokens',
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
    colPrefillSpeed: 'Prefill Speed',
    colTPOT: 'TPOT',
    colInteractivity: 'Interactivity',
    colDuration: 'Duration',
    colGap: 'Gap',
    ttft: 'TTFT',
    tpot: 'TPOT',
    interactivity: 'Interactivity',
    prefillSpeed: 'Prefill Speed',
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
    tokens: 'Token',
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
    colPrefillSpeed: 'Prefill 速度',
    colTPOT: 'TPOT',
    colInteractivity: '交互性',
    colDuration: '耗时',
    colGap: '间隔',
    ttft: 'TTFT',
    tpot: 'TPOT',
    interactivity: '交互性',
    prefillSpeed: 'Prefill 速度',
  },
};

interface StatsEntry {
  request: number;
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
    entries: { request: number; value: number }[];
  } | null>(null);
  const [loadingRequest, setLoadingRequest] = useState<number | null>(null);
  const pendingScrollRef = useRef<number | null>(null);

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
    const turn = requestToTurn(target, rows);
    if (turn) {
      pendingScrollRef.current = null;
      setLoadingRequest(null);
      // Wait for DOM update
      requestAnimationFrame(() => scrollToRow(turn));
    }
  }, [requests.length, rows]);

  async function navigateToRequest(requestNum: number) {
    // Already loaded — scroll immediately
    const turn = requestToTurn(requestNum, rows);
    if (turn) {
      scrollToRow(turn);
      return;
    }
    // Need to load more
    setLoadingRequest(requestNum);
    pendingScrollRef.current = requestNum;
    await loadUntil(requestNum);
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

  const chartConfigs: {
    title: string;
    color: string;
    key: 'cacheRead' | 'cacheWrite' | 'output';
  }[] = [
    { title: t.cacheRead, color: 'bg-cyan-500', key: 'cacheRead' },
    { title: t.cacheWrite, color: 'bg-amber-500', key: 'cacheWrite' },
    { title: t.output, color: 'bg-emerald-500', key: 'output' },
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
        {chartConfigs.map(({ title, color, key }) => {
          const indexed = statsEntries
            .map((e) => ({ request: e.request, value: e[key] }))
            .filter((e) => e.value > 0);
          if (indexed.length === 0) {
            return (
              <Card key={key}>
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
          const buckets = buildHistogramWithEntries(indexed, 50);
          const maxCount = Math.max(...buckets.map((b) => b.entries.length), 1);
          const isSelected = selectedBucket?.key === key;
          const sortedVals = [...indexed].toSorted((a, b) => a.value - b.value).map((e) => e.value);
          const pct = (p: number) =>
            sortedVals[Math.min(Math.floor((p / 100) * sortedVals.length), sortedVals.length - 1)];
          const median = sortedVals[Math.floor(sortedVals.length / 2)];
          const percentiles = [
            { label: 'p25', value: pct(25) },
            { label: 'p50', value: pct(50) },
            { label: 'p75', value: pct(75) },
            { label: 'p90', value: pct(90) },
            { label: 'p99', value: pct(99) },
          ];

          const xMin = buckets[0].min;
          const xMax = buckets.at(-1)!.max;
          const yTicks = generateNiceTicks(0, maxCount, 5);
          const yMax = yTicks.at(-1) || maxCount;
          const xTicks = generateNiceTicks(xMin, xMax, 10);

          const CW = 460;
          const CH = 160;
          const M = { top: 6, right: 8, bottom: 30, left: 40 };
          const PW = CW - M.left - M.right;
          const PH = CH - M.top - M.bottom;

          const sx = (v: number) => M.left + ((v - xMin) / (xMax - xMin || 1)) * PW;
          const sy = (v: number) => M.top + PH - (v / yMax) * PH;

          return (
            <ExpandableChart
              key={key}
              title={
                <>
                  {title} {t.distribution}{' '}
                  <span className="text-muted-foreground font-normal">(N={indexed.length})</span>
                </>
              }
            >
              <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ maxHeight: 180 }}>
                {/* Y-axis grid */}
                {yTicks.map((tick) => (
                  <g key={`y-${tick}`}>
                    {tick > 0 && (
                      <line
                        x1={M.left}
                        y1={sy(tick)}
                        x2={M.left + PW}
                        y2={sy(tick)}
                        stroke="currentColor"
                        className="text-border"
                        strokeWidth={0.5}
                        strokeDasharray="3 3"
                      />
                    )}
                    <text
                      x={M.left - 4}
                      y={sy(tick) + 3}
                      textAnchor="end"
                      className="fill-muted-foreground"
                      style={{
                        fontSize: '8px',
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      }}
                    >
                      {fmtAxis(tick)}
                    </text>
                  </g>
                ))}

                {/* Axes */}
                <line
                  x1={M.left}
                  y1={M.top}
                  x2={M.left}
                  y2={M.top + PH}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={1}
                />
                <line
                  x1={M.left}
                  y1={M.top + PH}
                  x2={M.left + PW}
                  y2={M.top + PH}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={1}
                />

                {/* Bars */}
                {buckets.map((bucket, bi) => {
                  if (bucket.entries.length === 0) return null;
                  const x = sx(bucket.min);
                  const w = sx(bucket.max) - sx(bucket.min);
                  const h = (bucket.entries.length / yMax) * PH;
                  const active = isSelected && selectedBucket?.bucketIdx === bi;
                  return (
                    <rect
                      key={bi}
                      x={x}
                      y={sy(bucket.entries.length)}
                      width={Math.max(w - 0.5, 1)}
                      height={h}
                      fill={color}
                      opacity={active ? 1 : 0.75}
                      stroke={active ? 'white' : color}
                      strokeWidth={active ? 1.5 : 0.5}
                      className="cursor-pointer"
                      onClick={() => {
                        track('agentic_workload_statistics_bucket_selected', {
                          key,
                          bucketIdx: bi,
                        });
                        if (active) setSelectedBucket(null);
                        else setSelectedBucket({ key, bucketIdx: bi, entries: bucket.entries });
                      }}
                    />
                  );
                })}

                {/* Percentile lines */}
                {[
                  { val: pct(25), color: '#94a3b8', label: 'p25' },
                  { val: median, color: '#ef4444', label: 'p50' },
                  { val: pct(75), color: '#94a3b8', label: 'p75' },
                  { val: pct(90), color: '#f59e0b', label: 'p90' },
                ].map(({ val, color: c, label }) => {
                  const px = sx(val);
                  if (px < M.left || px > M.left + PW) return null;
                  return (
                    <g key={label}>
                      <line
                        x1={px}
                        y1={M.top}
                        x2={px}
                        y2={M.top + PH}
                        stroke={c}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      <text
                        x={px}
                        y={M.top - 2}
                        textAnchor="middle"
                        fill={c}
                        style={{ fontSize: '7px', fontFamily: 'var(--font-mono)' }}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

                {/* X-axis ticks */}
                {xTicks.map((tick) => {
                  const x = sx(tick);
                  if (x < M.left - 1 || x > M.left + PW + 1) return null;
                  return (
                    <g key={`x-${tick}`}>
                      <line
                        x1={x}
                        y1={M.top + PH}
                        x2={x}
                        y2={M.top + PH + 3}
                        stroke="currentColor"
                        className="text-muted-foreground"
                        strokeWidth={1}
                      />
                      <text
                        x={x}
                        y={M.top + PH + 12}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        style={{
                          fontSize: '8px',
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        }}
                      >
                        {formatNumber(tick)}
                      </text>
                    </g>
                  );
                })}

                {/* X-axis label */}
                <text
                  x={M.left + PW / 2}
                  y={CH - 2}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{
                    fontSize: '8px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {title} {t.tokens}
                </text>
              </svg>

              {/* Selected bucket detail */}
              {isSelected && selectedBucket && (
                <div className="mt-2 border border-border rounded-md p-2 bg-muted/30 max-h-48 overflow-y-auto">
                  <p className="text-3xs text-muted-foreground mb-1.5 font-medium">
                    {t.requestsInRange(
                      selectedBucket.entries.length,
                      formatNumber(buckets[selectedBucket.bucketIdx].min),
                      formatNumber(buckets[selectedBucket.bucketIdx].max),
                    )}
                  </p>
                  <div className="space-y-0.5">
                    {selectedBucket.entries.map((e) => {
                      const turnInfo = getTurnInfo(e.request, rows);
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
                            navigateToRequest(e.request);
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

              {/* Percentile stats */}
              <div className="grid grid-cols-5 gap-1 mt-3 pt-3 border-t border-border">
                {percentiles.map((p) => (
                  <div
                    key={p.label}
                    className="rounded-md border border-border bg-surface-hover px-1.5 py-1 text-center"
                  >
                    <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                      {p.label}
                    </div>
                    <div className="text-2xs font-mono font-bold tracking-tight mt-0.5">
                      {formatNumber(p.value)}
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableChart>
          );
        })}
      </div>

      {/* TTFT / TPOT / Interactivity / Prefill Speed Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {(() => {
          const timingCharts: {
            title: string;
            color: string;
            values: number[];
            format: (v: number) => string;

            sourceValues?: number[];
            sourceTransform?: (v: number) => number;
          }[] = [
            {
              title: t.ttft,
              color: 'bg-emerald-500',
              values: rows.filter((r) => r.ttftMs !== null).map((r) => r.ttftMs!),
              format: formatDuration,
            },
            {
              title: t.tpot,
              color: 'bg-violet-500',
              values: rows.filter((r) => r.tpotMs !== null).map((r) => r.tpotMs!),
              format: (v) => `${v.toFixed(1)}ms/tok`,
            },
            {
              title: t.interactivity,
              color: 'bg-amber-500',
              values: rows
                .filter((r) => r.tpotMs !== null && r.tpotMs > 0)
                .map((r) => 1000 / r.tpotMs!)
                .filter((v) => v <= 200),
              format: (v) => `${v.toFixed(1)} tok/s`,
              sourceValues: rows
                .filter((r) => r.tpotMs !== null && r.tpotMs > 0)
                .map((r) => r.tpotMs!),
              sourceTransform: (v: number) => 1000 / v,
            },
            {
              title: t.prefillSpeed,
              color: 'bg-sky-500',
              values: rows
                .filter(
                  (r) =>
                    r.ttftMs !== null &&
                    r.ttftMs > 0 &&
                    (r.cacheRead ?? 0) + (r.cacheWrite ?? 0) > 0,
                )
                .map((r) => ((r.cacheRead ?? 0) + (r.cacheWrite ?? 0)) / (r.ttftMs! / 1000)),
              format: formatPrefillSpeed,
            },
          ];

          return timingCharts.map(
            ({ title, color, values, format, sourceValues, sourceTransform }) => {
              if (values.length === 0) {
                return (
                  <Card key={title}>
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

              const indexed = values.map((v, i) => ({ request: i, value: v }));
              const buckets = buildHistogramWithEntries(indexed, 30);
              const maxCount = Math.max(...buckets.map((b) => b.entries.length), 1);
              const sortedVals = [...values].toSorted((a, b) => a - b);
              const srcSorted = sourceValues
                ? [...sourceValues].toSorted((a, b) => a - b)
                : sortedVals;
              const transform = sourceTransform || ((v: number) => v);
              const pct = (p: number) =>
                transform(
                  srcSorted[
                    Math.min(Math.floor((p / 100) * srcSorted.length), srcSorted.length - 1)
                  ],
                );
              const percentiles = [
                { label: 'p50', value: pct(50) },
                { label: 'p75', value: pct(75) },
                { label: 'p90', value: pct(90) },
                { label: 'p95', value: pct(95) },
                { label: 'p99', value: pct(99) },
              ];

              const xMin = buckets[0].min;
              const xMax = buckets.at(-1)!.max;
              const yTicks = generateNiceTicks(0, maxCount, 5);
              const yMax = yTicks.at(-1) || maxCount;

              const CW = 460;
              const CH = 160;
              const M = { top: 6, right: 8, bottom: 30, left: 40 };
              const PW = CW - M.left - M.right;
              const PH = CH - M.top - M.bottom;

              const sx = (v: number) => M.left + ((v - xMin) / (xMax - xMin || 1)) * PW;
              const sy = (v: number) => M.top + PH - (v / yMax) * PH;

              return (
                <ExpandableChart
                  key={title}
                  title={
                    <>
                      {title} {t.distribution}{' '}
                      <span className="text-muted-foreground font-normal">(N={values.length})</span>
                    </>
                  }
                >
                  <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ maxHeight: 180 }}>
                    {yTicks.map((tick) => (
                      <g key={`y-${tick}`}>
                        {tick > 0 && (
                          <line
                            x1={M.left}
                            y1={sy(tick)}
                            x2={CW - M.right}
                            y2={sy(tick)}
                            stroke="currentColor"
                            className="text-border"
                            strokeWidth={0.5}
                            strokeDasharray="3 3"
                          />
                        )}
                        <text
                          x={M.left - 4}
                          y={sy(tick) + 3}
                          textAnchor="end"
                          className="fill-muted-foreground"
                          style={{ fontSize: '7px', fontFamily: 'var(--font-mono)' }}
                        >
                          {tick}
                        </text>
                      </g>
                    ))}
                    <line
                      x1={M.left}
                      y1={M.top + PH}
                      x2={CW - M.right}
                      y2={M.top + PH}
                      stroke="currentColor"
                      className="text-border"
                      strokeWidth={0.5}
                    />
                    {buckets.map((b, i) => {
                      const barW = Math.max(0.5, PW / buckets.length - 0.5);
                      const x = M.left + (i / buckets.length) * PW;
                      const barH = (b.entries.length / yMax) * PH;
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={sy(b.entries.length)}
                          width={barW}
                          height={Math.max(barH, 0)}
                          className={color.replace('bg-', 'fill-')}
                          opacity={0.8}
                          rx={0.5}
                        >
                          <title>
                            {format(b.min)} – {format(b.max)}: {b.entries.length}
                          </title>
                        </rect>
                      );
                    })}
                    {/* Percentile lines */}
                    {[
                      { val: pct(50), color: '#ef4444', label: 'p50' },
                      { val: pct(75), color: '#94a3b8', label: 'p75' },
                      { val: pct(90), color: '#f59e0b', label: 'p90' },
                    ].map(({ val, color: c, label }) => {
                      const px = sx(val);
                      if (px < M.left || px > CW - M.right) return null;
                      return (
                        <g key={label}>
                          <line
                            x1={px}
                            y1={M.top}
                            x2={px}
                            y2={M.top + PH}
                            stroke={c}
                            strokeWidth={1}
                            strokeDasharray="4 3"
                          />
                          <text
                            x={px}
                            y={M.top - 2}
                            textAnchor="middle"
                            fill={c}
                            style={{ fontSize: '7px', fontFamily: 'var(--font-mono)' }}
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex justify-between text-3xs font-mono text-muted-foreground px-1 mt-1">
                    {percentiles.map(({ label, value: v }) => (
                      <span key={label}>
                        {label}: {format(v)}
                      </span>
                    ))}
                  </div>
                </ExpandableChart>
              );
            },
          );
        })()}
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
                <TableHead className="text-right">{t.colPrefillSpeed}</TableHead>
                <TableHead className="text-right">{t.colTPOT}</TableHead>
                <TableHead className="text-right">{t.colInteractivity}</TableHead>
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
                          return ps === null ? '—' : formatPrefillSpeed(ps);
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatDuration(row.tpotMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatInteractivity(row.tpotMs)}
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
                      key={row.turn}
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
                            {isExpanded ? '\u25B2' : '\u25BC'}
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
                          return ps === null ? '—' : formatPrefillSpeed(ps);
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatDuration(row.tpotMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.tpotMs === null ? '—' : formatInteractivity(row.tpotMs)}
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
                                return ps === null ? '—' : formatPrefillSpeed(ps);
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.tpotMs === null ? '—' : formatDuration(child.tpotMs)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {child.tpotMs === null ? '—' : formatInteractivity(child.tpotMs)}
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
                    return ps === null ? '—' : formatPrefillSpeed(ps);
                  })()}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.tpotTokenCount > 0
                    ? formatDuration(totals.tpotWeightedMs / totals.tpotTokenCount)
                    : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals.tpotTokenCount > 0
                    ? formatInteractivity(totals.tpotWeightedMs / totals.tpotTokenCount)
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

function buildHistogramWithEntries(
  indexed: { request: number; value: number }[],
  bucketCount: number,
) {
  if (indexed.length === 0) return [];
  const sorted = [...indexed].toSorted((a, b) => a.value - b.value);
  if (sorted[0].value === sorted.at(-1)!.value) {
    return [{ min: sorted[0].value, max: sorted[0].value, entries: sorted }];
  }
  const min = sorted[0].value;
  // Clip at p95 + 10% margin so outliers don't stretch the x-axis
  const p95Idx = Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1);
  const p95Val = sorted[p95Idx].value;
  const max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!.value;
  const step = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    entries: [] as typeof sorted,
  }));
  for (const entry of indexed) {
    if (entry.value > max) continue;
    let idx = Math.floor((entry.value - min) / step);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].entries.push(entry);
  }
  return buckets;
}

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

function generateNiceTicks(min: number, max: number, targetCount: number): number[] {
  if (max <= min) return [min];
  const range = niceNum(max - min, false);
  const spacing = niceNum(range / (targetCount - 1), true);
  const niceMin = Math.floor(min / spacing) * spacing;
  const ticks: number[] = [];
  for (let t = niceMin; t <= max + spacing * 0.5; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function requestToTurn(requestNum: number, rows: StatRow[]): number | null {
  const info = getTurnInfo(requestNum, rows);
  return info?.turn ?? null;
}

function getTurnInfo(
  requestNum: number,
  rows: StatRow[],
): { turn: number; kind: 'main' | 'subagent_group'; label?: string } | null {
  let reqCounter = 0;
  for (const row of rows) {
    if (row.kind === 'subagent_group') {
      const groupSize = row.children.length;
      if (requestNum > reqCounter && requestNum <= reqCounter + groupSize) {
        return { turn: row.turn, kind: 'subagent_group', label: row.label };
      }
      reqCounter += groupSize;
    } else {
      reqCounter++;
      if (reqCounter === requestNum) {
        return { turn: row.turn, kind: 'main' };
      }
    }
  }
  return null;
}
