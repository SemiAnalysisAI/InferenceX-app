'use client';

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import {
  formatDollars,
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
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { TOKEN_SERIES_COLORS as COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { Button } from '@/components/ui/button';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { chartFont, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';
import { fitLabel, rowChartColumns } from '@/components/agentic-workload-explorer/row-chart-layout';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import {
  ShowMoreRows,
  useRowLimit,
} from '@/components/agentic-workload-explorer/conversation-view';

const RATIO_COLORS = {
  good: '#10b981',
  warn: '#f59e0b',
  bad: '#f43f5e',
} as const;

const STRINGS = {
  en: {
    sectionTitle: 'Token flamegraph',
    noData: 'No request data available',
    apiCache: 'API cache',
    hashBlocks: 'Hash blocks',
    hashProvider: 'Hash / provider',
    hashProviderTooltip:
      'Hash chain token count / provider-reported input tokens. 1.0 means the padded chain matches billing.',
    chronological: 'Chronological',
    modeLabel: 'Cache view',
    layoutLabel: 'Layout',
    grouped: 'Grouped',
    classifierLike: 'Classifier-like',
    classifierLikeHint: 'Inferred from the response stop marker',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    classifierLikeSignature: 'Classifier-like response signature',
    noHashChain: 'No hash chain recorded for this request',
    hashProviderLabel: 'Hash / provider:',
    hashTokens: 'Hash tokens:',
    providerInput: 'Provider input:',
    providerInputDetail: '(input + cache_read + cache_write)',
    hashBlocksLabel: 'Hash blocks:',
    cachedSuffix: 'cached',
    output: 'Output:',
    total: 'Total:',
    apiLegend: {
      input: 'Input',
      cacheRead: 'Cache read',
      cacheWrite: 'Cache write',
      output: 'Output',
    },
    hashLegend: {
      input: 'Input',
      cacheRead: 'Cached prefix',
      cacheWrite: 'Uncached suffix',
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
    modeLabel: '缓存视图',
    layoutLabel: '布局',
    grouped: '分组',
    classifierLike: '类分类器',
    classifierLikeHint: '根据响应的停止标记推断',
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
const CLASSIFIER_COLOR = '#f97316';

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
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  const containerWidth = dimensions.width;
  const [rowLimit, , showMoreRows] = useRowLimit(`${mode}-${layout}`);
  useFontsVersion();

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

  const maxRatio = useMemo(() => {
    let observed = 0;
    for (const r of visibleRows) {
      if (!r.isGroup && r.ratio !== null && r.ratio > observed) observed = r.ratio;
    }
    return Math.max(2, observed * 1.05);
  }, [visibleRows]);

  const columns = rowChartColumns(containerWidth);
  const barLeft = columns.label + 8;
  const labelFont = chartFont(CHART_TYPE.axisLabel);
  const barWidth = containerWidth - barLeft - columns.value - 8;
  const shownRows = visibleRows.length > rowLimit ? visibleRows.slice(0, rowLimit) : visibleRows;
  const svgHeight = shownRows.length * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;
  const ratioReferenceX = barLeft + (barWidth > 0 ? barWidth / maxRatio : 0);

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
    return <EmptyState className="h-32">{t.noData}</EmptyState>;
  }

  return (
    <Card className="relative">
      <CardHeader className="sticky top-0 z-20 gap-2 bg-card/95 pb-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <CardTitle>{t.sectionTitle}</CardTitle>
        <div className="flex items-center gap-4 flex-wrap">
          <SegmentedToggle
            role="group"
            ariaLabel={t.modeLabel}
            value={mode}
            onValueChange={(next) => {
              setMode(next);
              track('agentic_workload_flamegraph_mode_changed', { mode: next });
            }}
            options={[
              { value: 'api', label: t.apiCache },
              { value: 'hash', label: t.hashBlocks },
              { value: 'ratio', label: t.hashProvider, title: t.hashProviderTooltip },
            ]}
          />
          {subagentGroupTurns.length > 0 && (
            <SegmentedToggle
              role="group"
              ariaLabel={t.layoutLabel}
              value={layout}
              onValueChange={(next) => {
                setLayout(next);
                track('agentic_workload_flamegraph_layout_changed', { layout: next });
              }}
              options={[
                { value: 'chronological', label: t.chronological },
                { value: 'grouped', label: t.grouped },
              ]}
            />
          )}
          {legendItems.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5" title={t.classifierLikeHint}>
            <div
              className="w-2.5 h-2.5 rotate-45 rounded-[1px]"
              style={{ backgroundColor: CLASSIFIER_COLOR }}
            />
            <span className="text-xs text-muted-foreground">{t.classifierLike}</span>
          </div>
          {subagentGroupTurns.length > 0 && layout === 'grouped' && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  expandAll();
                  track('agentic_workload_flamegraph_expand_all');
                }}
              >
                {t.expandAll}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  collapseAll();
                  track('agentic_workload_flamegraph_collapse_all');
                }}
              >
                {t.collapseAll}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        <div ref={setContainerRef} className="min-w-0">
          <svg
            role="img"
            aria-label={t.sectionTitle}
            width={Math.max(0, containerWidth)}
            height={svgHeight}
            className="block"
          >
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
                    fontSize: px(CHART_TYPE.axisLabel),
                    fontFamily: CHART_FONT_SANS,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  1.0
                </text>
              </>
            )}
            {shownRows.map((row, idx) => {
              const y = idx * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;
              const total = getTotal(row);
              const scale = barWidth > 0 ? barWidth / maxTokens : 0;

              const inputW = row.input * scale;
              const cacheReadW = row.cacheRead * scale;
              const cacheWriteW = row.cacheWrite * scale;
              const outputW = row.output * scale;

              const barX = barLeft;
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
              const labelOffset = labelX + (row.isGroup ? 16 : 4);

              function navigateToConversation() {
                router.push(
                  explorerHref(`/sessions/${sessionId}/conversation#req-${row.requestId}`),
                );
              }

              return (
                <g
                  key={row.key}
                  className="cursor-pointer"
                  onClick={row.isGroup ? undefined : navigateToConversation}
                  onMouseMove={(e) => handleMouseMove(e, row)}
                  onMouseLeave={handleMouseLeave}
                >
                  {row.indent === 1 && (
                    <line
                      x1={8}
                      y1={y}
                      x2={8}
                      y2={y + ROW_HEIGHT}
                      stroke={COLORS.output}
                      strokeWidth={2}
                      strokeOpacity={0.5}
                    />
                  )}

                  {row.isGroup && (
                    <text
                      x={labelX + 4}
                      y={y + ROW_HEIGHT / 2}
                      dominantBaseline="central"
                      className="fill-current text-muted-foreground cursor-pointer"
                      style={{
                        fontSize: px(CHART_TYPE.axisLabel),
                        fontFamily: CHART_FONT_SANS,
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
                    x={labelOffset}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    className={`fill-current hover:underline ${
                      row.isClassifierLike ? 'text-warning' : 'text-muted-foreground'
                    }`}
                    style={{
                      fontSize: px(CHART_TYPE.axisLabel),
                      fontFamily: CHART_FONT_SANS,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToConversation();
                    }}
                  >
                    {fitLabel(row.label, labelFont, columns.label - labelOffset)}
                  </text>

                  <rect
                    x={barX}
                    y={y + 2}
                    width={Math.max(0, barWidth)}
                    height={ROW_HEIGHT - 4}
                    rx={3}
                    className="fill-current"
                    style={{ color: 'var(--color-border)', opacity: 0.3 }}
                  />

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
                        />
                      ) : null,
                    )}

                  {!row.isGroup && mode === 'ratio' && row.ratio !== null && ratioW > 0 && (
                    <rect
                      x={barX}
                      y={y + 2}
                      width={ratioW}
                      height={ROW_HEIGHT - 4}
                      rx={3}
                      fill={ratioFill}
                      opacity={0.85}
                    />
                  )}

                  <text
                    x={barX + barWidth + 8}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    className="fill-current text-muted-foreground"
                    style={{
                      fontSize: px(CHART_TYPE.axisLabel),
                      fontFamily: CHART_FONT_SANS,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.isGroup
                      ? ''
                      : mode === 'ratio'
                        ? row.ratio === null
                          ? '\u2014'
                          : row.ratio.toFixed(2)
                        : row.cost > 0
                          ? formatDollars(row.cost)
                          : '\u2014'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <ShowMoreRows
          shown={shownRows.length}
          total={visibleRows.length}
          view="flamegraph"
          onShowMore={showMoreRows}
        />

        {tooltip && (
          <FloatingTooltip x={tooltip.x} y={tooltip.y} placement="above">
            <ChartHoverCardBody
              title={tooltip.label}
              warning={tooltip.isClassifierLike ? t.classifierLikeSignature : undefined}
              metrics={
                tooltip.mode === 'ratio'
                  ? tooltip.ratio === null
                    ? []
                    : [
                        {
                          value: tooltip.ratio.toFixed(3),
                          label: `${t.hashProviderLabel} (${((tooltip.ratio - 1) * 100).toFixed(1)}%)`,
                          color: ratioColor(tooltip.ratio),
                        },
                      ]
                  : [
                      ...(tooltip.mode === 'api'
                        ? [
                            {
                              value: formatNumber(tooltip.input),
                              label: t.apiLegend.input,
                              color: COLORS.input,
                            },
                          ]
                        : []),
                      ...(tooltip.cacheRead > 0
                        ? [
                            {
                              value: formatNumber(tooltip.cacheRead),
                              label:
                                tooltip.mode === 'hash'
                                  ? t.hashLegend.cacheRead
                                  : t.apiLegend.cacheRead,
                              color: COLORS.cacheRead,
                            },
                          ]
                        : []),
                      ...(tooltip.cacheWrite > 0
                        ? [
                            {
                              value: formatNumber(tooltip.cacheWrite),
                              label:
                                tooltip.mode === 'hash'
                                  ? t.hashLegend.cacheWrite
                                  : t.apiLegend.cacheWrite,
                              color: COLORS.cacheWrite,
                            },
                          ]
                        : []),
                      {
                        value: formatNumber(tooltip.output),
                        label: t.output,
                        color: COLORS.output,
                      },
                    ]
              }
              summary={(() => {
                const parts: string[] = [];
                if (tooltip.mode === 'ratio') {
                  if (tooltip.ratio === null) parts.push(t.noHashChain);
                  if (tooltip.hashTokenCount !== null)
                    parts.push(`${t.hashTokens} ${formatNumber(tooltip.hashTokenCount)}`);
                  if (tooltip.providerInputTotal !== null)
                    parts.push(
                      `${t.providerInput} ${formatNumber(tooltip.providerInputTotal)} ${t.providerInputDetail}`,
                    );
                  if (tooltip.hashBlocks !== null)
                    parts.push(
                      `${t.hashBlocksLabel} ${formatNumber(tooltip.cachedHashBlocks ?? 0)} / ${formatNumber(tooltip.hashBlocks)} ${t.cachedSuffix}`,
                    );
                  parts.push(
                    `${t.output} ${formatNumber(tooltip.output)}`,
                    formatDollars(tooltip.cost),
                  );
                } else {
                  parts.push(
                    `${t.total} ${formatNumber(tooltip.total)}`,
                    formatDollars(tooltip.cost),
                  );
                  if (tooltip.mode === 'hash' && tooltip.hashBlocks !== null) {
                    parts.push(
                      `${t.hashBlocksLabel} ${formatNumber(tooltip.cachedHashBlocks ?? 0)} / ${formatNumber(tooltip.hashBlocks)} ${t.cachedSuffix}`,
                    );
                    if (tooltip.hashTokenCount !== null)
                      parts.push(`${t.hashTokens} ${formatNumber(tooltip.hashTokenCount)}`);
                  }
                }
                if (tooltip.ttftMs !== null || tooltip.tpotMs !== null) {
                  parts.push(
                    `TTFT: ${tooltip.ttftMs === null ? '—' : formatDuration(tooltip.ttftMs)}`,
                    `TPOT: ${tooltip.tpotMs === null ? '—' : formatDuration(tooltip.tpotMs)}`,
                  );
                  if (tooltip.tpotMs !== null) parts.push(formatInteractivity(tooltip.tpotMs));
                  if (tooltip.mode === 'api') {
                    const ps = computePrefillSpeed(
                      tooltip.cacheRead,
                      tooltip.cacheWrite,
                      tooltip.ttftMs,
                    );
                    if (ps !== null) parts.push(formatPrefillSpeed(ps));
                  }
                }
                return parts.join(' · ');
              })()}
            />
          </FloatingTooltip>
        )}
      </CardContent>
    </Card>
  );
}
