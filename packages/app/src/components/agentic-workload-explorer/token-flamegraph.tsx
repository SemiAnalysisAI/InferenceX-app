'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  formatDuration,
  formatInteractivity,
  formatNumber,
  formatPrefillSpeed,
  computePrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import {
  flattenStatRowsChronologically,
  type StatLeafRow,
  type StatRow,
} from '@/lib/agentic-workload-explorer/stat-rows';
import { buildHashMetrics, type HashSourceRow } from '@/lib/agentic-workload-explorer/hash-metrics';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const COLORS = {
  input: '#0ea5e9', // sky-500
  cacheRead: '#10b981', // emerald-500
  cacheWrite: '#f59e0b', // amber-500
  output: '#8b5cf6', // violet-500
} as const;

// Ratio-mode color bands. Emerald = hash chain length (after padding) matches
// provider billing within 10%; amber = noticeable drift; rose = significant
// drift, usually a sign that calibration or padding is off for that model.
const RATIO_COLORS = {
  good: '#10b981', // emerald-500
  warn: '#f59e0b', // amber-500
  bad: '#f43f5e', // rose-500
} as const;

const STRINGS = {
  en: {
    sectionTitle: 'Token Flamegraph',
    noData: 'No request data available',
    apiCache: 'API Cache',
    hashBlocks: 'Hash Blocks',
    hashProvider: 'Hash / Provider',
    hashProviderTooltip:
      'Hash chain token count / provider-reported input tokens. 1.0 means the padded chain matches billing.',
    chronological: 'Chronological',
    grouped: 'Grouped',
    classifierLike: 'Classifier-like',
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
    classifierLikeSignature: 'Classifier-like response signature',
    noHashChain: 'No hash chain recorded for this request',
    hashProviderLabel: 'Hash / Provider:',
    hashTokens: 'Hash Tokens:',
    providerInput: 'Provider Input:',
    providerInputDetail: '(input + cache_read + cache_write)',
    hashBlocksLabel: 'Hash Blocks:',
    cachedSuffix: 'cached',
    output: 'Output:',
    total: 'Total:',
    apiLegend: {
      input: 'Input',
      cacheRead: 'Cache Read',
      cacheWrite: 'Cache Write',
      output: 'Output',
    },
    hashLegend: {
      input: 'Input',
      cacheRead: 'Cached Prefix',
      cacheWrite: 'Uncached Suffix',
      output: 'Output',
    },
    ratioLegend: {
      good: '±10%',
      warn: '±25%',
      bad: '>25%',
    },
    turnLabel: (n: number) => `Turn ${n}`,
    classifier: 'classifier',
    subagent: 'subagent',
    reqLabel: (n: number) => `req ${n}`,
  },
  zh: {
    sectionTitle: 'Token 火焰图',
    noData: '暂无请求数据',
    apiCache: 'API Cache',
    hashBlocks: 'Hash Blocks',
    hashProvider: 'Hash / Provider',
    hashProviderTooltip:
      'Hash chain token 数 / provider 上报的 input token 数。1.0 表示填充后的 chain 与计费一致。',
    chronological: '时间顺序',
    grouped: '分组',
    classifierLike: '类分类器',
    expandAll: '全部展开',
    collapseAll: '全部折叠',
    classifierLikeSignature: '类分类器响应特征',
    noHashChain: '此请求未记录 hash chain',
    hashProviderLabel: 'Hash / Provider:',
    hashTokens: 'Hash Tokens:',
    providerInput: 'Provider Input:',
    providerInputDetail: '(input + cache_read + cache_write)',
    hashBlocksLabel: 'Hash Blocks:',
    cachedSuffix: '已缓存',
    output: 'Output:',
    total: '合计:',
    apiLegend: {
      input: '输入',
      cacheRead: '缓存读取',
      cacheWrite: '缓存写入',
      output: '输出',
    },
    hashLegend: {
      input: '输入',
      cacheRead: '已缓存前缀',
      cacheWrite: '未缓存后缀',
      output: '输出',
    },
    ratioLegend: {
      good: '±10%',
      warn: '±25%',
      bad: '>25%',
    },
    turnLabel: (n: number) => `轮次 ${n}`,
    classifier: '分类器',
    subagent: '子智能体',
    reqLabel: (n: number) => `请求 ${n}`,
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function buildLegendItems(t: Strings) {
  return {
    api: [
      { key: 'input', label: t.apiLegend.input, color: COLORS.input },
      { key: 'cacheRead', label: t.apiLegend.cacheRead, color: COLORS.cacheRead },
      { key: 'cacheWrite', label: t.apiLegend.cacheWrite, color: COLORS.cacheWrite },
      { key: 'output', label: t.apiLegend.output, color: COLORS.output },
    ],
    hash: [
      { key: 'input', label: t.hashLegend.input, color: COLORS.input },
      { key: 'cacheRead', label: t.hashLegend.cacheRead, color: COLORS.cacheRead },
      { key: 'cacheWrite', label: t.hashLegend.cacheWrite, color: COLORS.cacheWrite },
      { key: 'output', label: t.hashLegend.output, color: COLORS.output },
    ],
    ratio: [
      { key: 'good', label: t.ratioLegend.good, color: RATIO_COLORS.good },
      { key: 'warn', label: t.ratioLegend.warn, color: RATIO_COLORS.warn },
      { key: 'bad', label: t.ratioLegend.bad, color: RATIO_COLORS.bad },
    ],
  } as const;
}

function ratioColor(ratio: number): string {
  const drift = Math.abs(ratio - 1);
  if (drift <= 0.1) return RATIO_COLORS.good;
  if (drift <= 0.25) return RATIO_COLORS.warn;
  return RATIO_COLORS.bad;
}

const ROW_HEIGHT = 28;
const ROW_GAP = 2;
const LABEL_WIDTH = 180;
const COST_WIDTH = 70;
const BAR_LEFT = LABEL_WIDTH + 8;
const CLASSIFIER_COLOR = '#f97316'; // orange-500

type FlamegraphMode = 'api' | 'hash' | 'ratio';
type FlamegraphLayout = 'chronological' | 'grouped';

interface TooltipData {
  x: number;
  y: number;
  mode: FlamegraphMode;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  total: number;
  cost: number;
  ttftMs: number | null;
  tpotMs: number | null;
  label: string;
  cachedHashBlocks: number | null;
  hashBlocks: number | null;
  hashTokenCount: number | null;
  providerInputTotal: number | null;
  ratio: number | null;
  isClassifierLike: boolean;
}

function getTotal(row: { input: number; cacheRead: number; cacheWrite: number; output: number }) {
  return row.input + row.cacheRead + row.cacheWrite + row.output;
}

function iterStatLeafRows(rows: StatRow[]): HashSourceRow[] {
  const out: HashSourceRow[] = [];
  for (const row of rows) {
    if (row.kind === 'main') {
      out.push(row);
    } else {
      out.push(...row.children);
    }
  }
  return out;
}

export function TokenFlamegraph({ rows, sessionId }: { rows: StatRow[]; sessionId: string }) {
  const t = STRINGS[useLocale()];
  const explorerHref = useExplorerHref();
  const router = useRouter();
  const [mode, setMode] = useState<FlamegraphMode>('api');
  const [layout, setLayout] = useState<FlamegraphLayout>('chronological');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(() => {
    const all = new Set<number>();
    for (const row of rows) {
      if (row.kind === 'subagent_group') all.add(row.turn);
    }
    return all;
  });
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleGroup = useCallback((turn: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  }, []);

  const subagentGroupTurns = useMemo(() => {
    const turns: number[] = [];
    for (const row of rows) {
      if (row.kind === 'subagent_group') turns.push(row.turn);
    }
    return turns;
  }, [rows]);

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(subagentGroupTurns));
  }, [subagentGroupTurns]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const hashMetrics = useMemo(() => buildHashMetrics(iterStatLeafRows(rows)), [rows]);
  const allLegends = useMemo(() => buildLegendItems(t), [t]);
  const legendItems = allLegends[mode];

  // Build flat list of visible rows with nesting info
  const visibleRows = useMemo(() => {
    const result: {
      key: string;
      label: string;
      requestId: string;
      input: number;
      cacheRead: number;
      cacheWrite: number;
      output: number;
      cost: number;
      ttftMs: number | null;
      tpotMs: number | null;
      cachedHashBlocks: number | null;
      hashBlocks: number | null;
      hashTokenCount: number | null;
      providerInputTotal: number | null;
      ratio: number | null;
      indent: number;
      isGroup: boolean;
      isExpanded: boolean;
      turn: number;
      isClassifierLike: boolean;
    }[] = [];

    function computeRatio(
      input: number,
      cacheRead: number,
      cacheWrite: number,
      hashTokenCount: number | null,
    ): { providerInputTotal: number | null; ratio: number | null } {
      const provider = input + cacheRead + cacheWrite;
      if (provider <= 0 || hashTokenCount === null || hashTokenCount <= 0) {
        return { providerInputTotal: provider > 0 ? provider : null, ratio: null };
      }
      return { providerInputTotal: provider, ratio: hashTokenCount / provider };
    }

    function pushLeaf(leaf: StatLeafRow, key: string, label: string, indent: number, turn: number) {
      const metric = hashMetrics.byRequestId.get(leaf.requestId);
      const hashTokenCount = metric?.hashTokenCount ?? leaf.hashTokenCount ?? null;
      const { providerInputTotal, ratio } = computeRatio(
        leaf.input,
        leaf.cacheRead,
        leaf.cacheWrite,
        hashTokenCount,
      );
      result.push({
        key,
        label,
        requestId: leaf.requestId,
        input: mode === 'api' ? leaf.input : 0,
        cacheRead: mode === 'hash' ? (metric?.cacheRead ?? 0) : mode === 'api' ? leaf.cacheRead : 0,
        cacheWrite:
          mode === 'hash' ? (metric?.cacheWrite ?? 0) : mode === 'api' ? leaf.cacheWrite : 0,
        output: mode === 'ratio' ? 0 : leaf.output,
        cost: leaf.cost,
        ttftMs: leaf.ttftMs,
        tpotMs: leaf.tpotMs,
        cachedHashBlocks: mode === 'api' ? null : (metric?.cachedBlocks ?? null),
        hashBlocks: mode === 'api' ? null : (metric?.hashBlocks ?? leaf.hashIds?.length ?? null),
        hashTokenCount: mode === 'api' ? null : hashTokenCount,
        providerInputTotal,
        ratio,
        indent,
        isGroup: false,
        isExpanded: false,
        turn,
        isClassifierLike: leaf.isClassifierLike,
      });
    }

    if (layout === 'chronological') {
      flattenStatRowsChronologically(rows).forEach(({ row, isSubagent }, index) => {
        const turn = index + 1;
        const suffix = row.isClassifierLike
          ? ` · ${t.classifier}`
          : isSubagent
            ? ` · ${t.subagent}`
            : '';
        pushLeaf(
          row,
          `chronological-${row.requestId}`,
          `${t.turnLabel(turn)}${suffix}`,
          isSubagent ? 1 : 0,
          turn,
        );
      });
      return result;
    }

    for (const row of rows) {
      if (row.kind === 'main') {
        pushLeaf(
          row,
          `main-${row.turn}`,
          `${t.turnLabel(row.turn)}${row.isClassifierLike ? ` · ${t.classifier}` : ''}`,
          0,
          row.turn,
        );
      } else {
        const isExpanded = expandedGroups.has(row.turn);
        result.push({
          key: `group-${row.turn}`,
          label: `${row.label} (${row.requestCount})${
            row.classifierLikeCount > 0 ? ` · ${row.classifierLikeCount} ${t.classifier}` : ''
          }`,
          requestId: row.requestId,
          input: mode === 'api' ? row.input : 0,
          cacheRead: mode === 'api' ? row.cacheRead : 0,
          cacheWrite: mode === 'api' ? row.cacheWrite : 0,
          output: mode === 'ratio' ? 0 : row.output,
          cost: row.cost,
          ttftMs: row.ttftMs,
          tpotMs: row.tpotMs,
          cachedHashBlocks: null,
          hashBlocks: null,
          hashTokenCount: null,
          providerInputTotal: null,
          ratio: null,
          indent: 0,
          isGroup: true,
          isExpanded,
          turn: row.turn,
          isClassifierLike: row.classifierLikeCount > 0,
        });
        if (isExpanded) {
          row.children.forEach((child, ci) => {
            pushLeaf(
              child,
              `group-${row.turn}-child-${ci}`,
              `${t.reqLabel(ci + 1)}${child.isClassifierLike ? ` · ${t.classifier}` : ''}`,
              1,
              row.turn,
            );
          });
        }
      }
    }
    return result;
  }, [rows, expandedGroups, hashMetrics, mode, layout, t]);

  const maxTokens = useMemo(
    () => Math.max(1, ...visibleRows.filter((r) => !r.isGroup).map((r) => getTotal(r))),
    [visibleRows],
  );

  // Ratio-mode x-axis domain. Anchor at [0, 2] so 1.0 sits at the midpoint
  // of the bar track — undercounted bars come up short of center, overcounted
  // bars extend past it. Extend past 2 if any outlier (e.g. Web Search Agent
  // on Haiku 4.5) actually reaches further; we don't clip, so the magnitude
  // of an overshoot stays readable.
  const maxRatio = useMemo(() => {
    let observed = 0;
    for (const r of visibleRows) {
      if (!r.isGroup && r.ratio !== null && r.ratio > observed) observed = r.ratio;
    }
    return Math.max(2, observed * 1.05);
  }, [visibleRows]);

  const barWidth = containerWidth - BAR_LEFT - COST_WIDTH - 16;
  const svgHeight = visibleRows.length * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;
  const ratioReferenceX = BAR_LEFT + (barWidth > 0 ? barWidth / maxRatio : 0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, row: (typeof visibleRows)[number]) => {
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        mode,
        input: row.input,
        cacheRead: row.cacheRead,
        cacheWrite: row.cacheWrite,
        output: row.output,
        total: getTotal(row),
        cost: row.cost,
        ttftMs: row.ttftMs,
        tpotMs: row.tpotMs,
        label: row.label,
        cachedHashBlocks: row.cachedHashBlocks,
        hashBlocks: row.hashBlocks,
        hashTokenCount: row.hashTokenCount,
        providerInputTotal: row.providerInputTotal,
        ratio: row.ratio,
        isClassifierLike: row.isClassifierLike,
      });
    },
    [mode],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground font-mono text-xs">
        {t.noData}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header — sticks to the top of the viewport while the chart
          scrolls beneath. The dashboard <main> has `py-5` (top padding 1.25rem),
          so we use a negative `top` so the bar lands flush against the global
          header instead of 20px below it. */}
      <div className="sticky -top-5 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-2 px-2 pt-5 pb-2 space-y-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.sectionTitle}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Legend + group controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setMode('api');
                track('agentic_workload_flamegraph_mode_changed', { mode: 'api' });
              }}
              className={`text-3xs font-mono px-2 py-1 transition-colors ${
                mode === 'api'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-subtle hover:text-foreground'
              }`}
            >
              {t.apiCache}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('hash');
                track('agentic_workload_flamegraph_mode_changed', { mode: 'hash' });
              }}
              className={`text-3xs font-mono px-2 py-1 border-l border-border transition-colors ${
                mode === 'hash'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-subtle hover:text-foreground'
              }`}
            >
              {t.hashBlocks}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('ratio');
                track('agentic_workload_flamegraph_mode_changed', { mode: 'ratio' });
              }}
              title={t.hashProviderTooltip}
              className={`text-3xs font-mono px-2 py-1 border-l border-border transition-colors ${
                mode === 'ratio'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-subtle hover:text-foreground'
              }`}
            >
              {t.hashProvider}
            </button>
          </div>
          {subagentGroupTurns.length > 0 && (
            <div className="flex items-center border border-border rounded overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setLayout('chronological');
                  track('agentic_workload_flamegraph_layout_changed', { layout: 'chronological' });
                }}
                className={`text-3xs font-mono px-2 py-1 transition-colors ${
                  layout === 'chronological'
                    ? 'bg-surface-hover text-foreground'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                {t.chronological}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLayout('grouped');
                  track('agentic_workload_flamegraph_layout_changed', { layout: 'grouped' });
                }}
                className={`text-3xs font-mono px-2 py-1 border-l border-border transition-colors ${
                  layout === 'grouped'
                    ? 'bg-surface-hover text-foreground'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                {t.grouped}
              </button>
            </div>
          )}
          {legendItems.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-3xs font-mono text-muted-foreground">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5" title="Inferred from the response stop marker">
            <div
              className="w-2.5 h-2.5 rotate-45 rounded-[1px]"
              style={{ backgroundColor: CLASSIFIER_COLOR }}
            />
            <span className="text-3xs font-mono text-muted-foreground">{t.classifierLike}</span>
          </div>
          {subagentGroupTurns.length > 0 && layout === 'grouped' && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={() => {
                  expandAll();
                  track('agentic_workload_flamegraph_expand_all');
                }}
                className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
              >
                {t.expandAll}
              </button>
              <button
                type="button"
                onClick={() => {
                  collapseAll();
                  track('agentic_workload_flamegraph_collapse_all');
                }}
                className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
              >
                {t.collapseAll}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="bg-surface border border-border rounded-md p-4 overflow-x-auto relative"
      >
        <svg width={containerWidth - 32} height={svgHeight} className="block">
          {/* Ratio-mode reference line at 1.0 — spans the full chart height so
              it's easy to scan whether bars over- or under-shoot the target. */}
          {mode === 'ratio' && barWidth > 0 && (
            <>
              <line
                x1={ratioReferenceX}
                y1={0}
                x2={ratioReferenceX}
                y2={svgHeight}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 3"
                className="text-muted-foreground"
                opacity={0.6}
              />
              <text
                x={ratioReferenceX + 4}
                y={10}
                className="fill-current text-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                1.0
              </text>
            </>
          )}
          {visibleRows.map((row, idx) => {
            const y = idx * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;
            const total = getTotal(row);
            const scale = barWidth > 0 ? barWidth / maxTokens : 0;

            const inputW = row.input * scale;
            const cacheReadW = row.cacheRead * scale;
            const cacheWriteW = row.cacheWrite * scale;
            const outputW = row.output * scale;

            const barX = BAR_LEFT;
            const segments = [
              { x: barX, w: inputW, color: COLORS.input },
              { x: barX + inputW, w: cacheReadW, color: COLORS.cacheRead },
              { x: barX + inputW + cacheReadW, w: cacheWriteW, color: COLORS.cacheWrite },
              { x: barX + inputW + cacheReadW + cacheWriteW, w: outputW, color: COLORS.output },
            ];

            const ratioScale = barWidth > 0 ? barWidth / maxRatio : 0;
            const ratioW = row.ratio === null ? 0 : row.ratio * ratioScale;
            const ratioFill = row.ratio === null ? RATIO_COLORS.bad : ratioColor(row.ratio);

            const labelX = row.indent === 1 ? 20 : 0;

            function navigateToConversation() {
              router.push(explorerHref(`/sessions/${sessionId}/conversation#req-${row.requestId}`));
            }

            return (
              <g
                key={row.key}
                className="cursor-pointer"
                onClick={row.isGroup ? undefined : navigateToConversation}
                onMouseMove={(e) => handleMouseMove(e, row)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Indented purple border line for child rows */}
                {row.indent === 1 && (
                  <line
                    x1={8}
                    y1={y}
                    x2={8}
                    y2={y + ROW_HEIGHT}
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeOpacity={0.5}
                  />
                )}

                {/* Row label — for groups: triangle toggles expand, label text navigates */}
                {row.isGroup && (
                  <text
                    x={labelX + 4}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    className="fill-current text-muted-foreground cursor-pointer"
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroup(row.turn);
                    }}
                  >
                    {row.isExpanded ? '\u25BC' : '\u25B6'}
                  </text>
                )}
                <text
                  x={labelX + (row.isGroup ? 16 : 4)}
                  y={y + ROW_HEIGHT / 2}
                  dominantBaseline="central"
                  className={`fill-current hover:underline ${
                    row.isClassifierLike ? 'text-orange-500' : 'text-muted-foreground'
                  }`}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToConversation();
                  }}
                >
                  {row.label}
                </text>

                {/* Background track */}
                <rect
                  x={barX}
                  y={y + 2}
                  width={Math.max(0, barWidth)}
                  height={ROW_HEIGHT - 4}
                  rx={3}
                  className="fill-current"
                  style={{ color: 'var(--color-border)', opacity: 0.3 }}
                />

                {/* Token segments — hidden for group header rows (summed bar is misleading) */}
                {!row.isGroup &&
                  mode !== 'ratio' &&
                  segments.map((seg, si) =>
                    seg.w > 0 ? (
                      <rect
                        key={si}
                        x={seg.x}
                        y={y + 2}
                        width={seg.w}
                        height={ROW_HEIGHT - 4}
                        rx={
                          si === 0 && total > 0
                            ? 3
                            : si === segments.length - 1 ||
                                segments.slice(si + 1).every((s) => s.w === 0)
                              ? 3
                              : 0
                        }
                        fill={seg.color}
                        opacity={0.85}
                      >
                        <title>
                          {(legendItems as readonly { label: string }[])[si]?.label}:{' '}
                          {formatNumber(
                            si === 0
                              ? row.input
                              : si === 1
                                ? row.cacheRead
                                : si === 2
                                  ? row.cacheWrite
                                  : row.output,
                          )}
                        </title>
                      </rect>
                    ) : null,
                  )}

                {/* Ratio bar — single bar from 0 to ratio. 1.0 lands at the
                    dashed reference line (rendered above the row map). Bars
                    past the line are overcounts; bars short of it are
                    undercounts. */}
                {!row.isGroup && mode === 'ratio' && row.ratio !== null && ratioW > 0 && (
                  <rect
                    x={barX}
                    y={y + 2}
                    width={ratioW}
                    height={ROW_HEIGHT - 4}
                    rx={3}
                    fill={ratioFill}
                    opacity={0.85}
                  >
                    <title>
                      ratio {row.ratio.toFixed(2)} = hash {formatNumber(row.hashTokenCount ?? 0)} /
                      provider {formatNumber(row.providerInputTotal ?? 0)}
                    </title>
                  </rect>
                )}

                {/* Cost label */}
                <text
                  x={barX + barWidth + 8}
                  y={y + ROW_HEIGHT / 2}
                  dominantBaseline="central"
                  className="fill-current text-subtle"
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {row.isGroup
                    ? ''
                    : mode === 'ratio'
                      ? row.ratio === null
                        ? '\u2014'
                        : row.ratio.toFixed(2)
                      : row.cost > 0
                        ? `$${row.cost.toFixed(2)}`
                        : '\u2014'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip — rendered via portal at <body> so it escapes the chart
            container's `overflow-x-auto` (which per CSS spec also clips on
            the y-axis). Positioned with `fixed` using viewport coordinates;
            flips above/below the cursor based on available viewport space. */}
        {tooltip &&
          mounted &&
          createPortal(
            (() => {
              const TOOLTIP_MAX_HEIGHT = 180;
              const TOOLTIP_WIDTH = 240;
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const placeAbove =
                tooltip.y >= TOOLTIP_MAX_HEIGHT + 8 || vh - tooltip.y < TOOLTIP_MAX_HEIGHT + 8;
              const left = Math.max(8, Math.min(tooltip.x + 12, vw - TOOLTIP_WIDTH - 8));
              return (
                <div
                  className="fixed pointer-events-none z-50 bg-background border border-border rounded-md shadow-lg px-3 py-2 space-y-1"
                  style={{
                    left,
                    top: placeAbove ? tooltip.y - 8 : tooltip.y + 20,
                    transform: placeAbove ? 'translateY(-100%)' : 'none',
                  }}
                >
                  <div className="text-2xs font-mono font-medium text-foreground">
                    {tooltip.label}
                  </div>
                  {tooltip.isClassifierLike && (
                    <div className="text-3xs font-mono uppercase tracking-eyebrow text-orange-500">
                      {t.classifierLikeSignature}
                    </div>
                  )}
                  <div className="text-3xs font-mono text-muted-foreground space-y-0.5">
                    {tooltip.mode === 'ratio' ? (
                      <>
                        {tooltip.ratio === null ? (
                          <div>{t.noHashChain}</div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-sm inline-block"
                              style={{ backgroundColor: ratioColor(tooltip.ratio) }}
                            />
                            <span className="text-foreground">
                              {t.hashProviderLabel}{' '}
                              <span className="font-medium">{tooltip.ratio.toFixed(3)}</span>{' '}
                              <span className="text-subtle">
                                ({((tooltip.ratio - 1) * 100).toFixed(1)}%)
                              </span>
                            </span>
                          </div>
                        )}
                        {tooltip.hashTokenCount !== null && (
                          <div>
                            {t.hashTokens} {formatNumber(tooltip.hashTokenCount)}
                          </div>
                        )}
                        {tooltip.providerInputTotal !== null && (
                          <div>
                            {t.providerInput} {formatNumber(tooltip.providerInputTotal)}{' '}
                            <span className="text-subtle">{t.providerInputDetail}</span>
                          </div>
                        )}
                        {tooltip.hashBlocks !== null && (
                          <div>
                            {t.hashBlocksLabel} {formatNumber(tooltip.cachedHashBlocks ?? 0)} /{' '}
                            {formatNumber(tooltip.hashBlocks)} {t.cachedSuffix}
                          </div>
                        )}
                        <div className="pt-1 border-t border-border">
                          {t.output} {formatNumber(tooltip.output)} &middot; $
                          {tooltip.cost.toFixed(4)}
                        </div>
                      </>
                    ) : (
                      <>
                        {tooltip.mode === 'api' && (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-sm inline-block"
                              style={{ backgroundColor: COLORS.input }}
                            />
                            <span>
                              {t.apiLegend.input}: {formatNumber(tooltip.input)}
                            </span>
                          </div>
                        )}
                        {tooltip.cacheRead > 0 && (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-sm inline-block"
                              style={{ backgroundColor: COLORS.cacheRead }}
                            />
                            <span>
                              {tooltip.mode === 'hash'
                                ? t.hashLegend.cacheRead
                                : t.apiLegend.cacheRead}
                              : {formatNumber(tooltip.cacheRead)}
                            </span>
                          </div>
                        )}
                        {tooltip.cacheWrite > 0 && (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-sm inline-block"
                              style={{ backgroundColor: COLORS.cacheWrite }}
                            />
                            <span>
                              {tooltip.mode === 'hash'
                                ? t.hashLegend.cacheWrite
                                : t.apiLegend.cacheWrite}
                              : {formatNumber(tooltip.cacheWrite)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-sm inline-block"
                            style={{ backgroundColor: COLORS.output }}
                          />
                          <span>
                            {t.output} {formatNumber(tooltip.output)}
                          </span>
                        </div>
                        <div className="pt-1 border-t border-border">
                          {t.total} {formatNumber(tooltip.total)} &middot; $
                          {tooltip.cost.toFixed(4)}
                        </div>
                        {tooltip.mode === 'hash' && tooltip.hashBlocks !== null && (
                          <div>
                            {t.hashBlocksLabel} {formatNumber(tooltip.cachedHashBlocks ?? 0)} /{' '}
                            {formatNumber(tooltip.hashBlocks)} {t.cachedSuffix}
                            {tooltip.hashTokenCount !== null && (
                              <>
                                {' '}
                                &middot; {t.hashTokens} {formatNumber(tooltip.hashTokenCount)}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {(tooltip.ttftMs !== null || tooltip.tpotMs !== null) && (
                      <div>
                        TTFT: {tooltip.ttftMs === null ? '—' : formatDuration(tooltip.ttftMs)}{' '}
                        &middot; TPOT:{' '}
                        {tooltip.tpotMs === null ? '—' : formatDuration(tooltip.tpotMs)}
                        {tooltip.tpotMs !== null && (
                          <> &middot; {formatInteractivity(tooltip.tpotMs)}</>
                        )}
                        {(() => {
                          if (tooltip.mode !== 'api') return null;
                          const ps = computePrefillSpeed(
                            tooltip.cacheRead,
                            tooltip.cacheWrite,
                            tooltip.ttftMs,
                          );
                          return ps === null ? null : (
                            <>
                              {' '}
                              &middot;{' '}
                              <span className="text-sky-500">{formatPrefillSpeed(ps)}</span>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })(),
            document.body,
          )}
      </div>
    </div>
  );
}
