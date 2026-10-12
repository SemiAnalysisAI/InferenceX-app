'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatNumber, formatDuration } from '@/lib/agentic-workload-explorer/format';
import type {
  ConversationNode,
  MessageNode,
  SubagentGroupNode,
} from '@/components/agentic-workload-explorer/conversation-view';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

// ── Constants ───────────────────────────────────────────────────────

const NODE_HEIGHT = 36;
const NODE_GAP = 4;
const TRUNK_X = 24;
const TRUNK_WIDTH = 520;
const _BRANCH_X = 56;
const BRANCH_WIDTH = 480;
const CHILD_INDENT = 32;
const CONNECTOR_WIDTH = 32;

// ── Node color map ──────────────────────────────────────────────────

const STRINGS = {
  en: {
    flowGraph: 'Flow Graph',
    legend: 'Legend',
    noData: 'No conversation data to display',
    nodes: (n: number) => `${n} nodes`,
    subAgents: (n: number) => `${n} sub-agent${n === 1 ? '' : 's'}`,
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
    nodeLabels: {
      user: 'User',
      assistant: 'Response',
      tool_use: 'Tool',
      tool_result: 'Result',
      thinking: 'Thinking',
      subagent_group: 'Sub-agent',
    },
    response: (tok: number) => `Response · ${formatNumber(tok)} tok`,
    responseNoTok: 'Response',
    toolCall: 'Tool Call',
    thinkingLabel: (chars: number) => `Thinking · ${formatNumber(chars)} chars`,
    resultLabel: 'Result',
    resultError: 'Result (error)',
  },
  zh: {
    flowGraph: '流程图',
    legend: '图例',
    noData: '暂无会话数据',
    nodes: (n: number) => `${n} 个节点`,
    subAgents: (n: number) => `${n} 个子智能体`,
    expandAll: '全部展开',
    collapseAll: '全部折叠',
    nodeLabels: {
      user: '用户',
      assistant: '响应',
      tool_use: '工具',
      tool_result: '结果',
      thinking: '思考',
      subagent_group: '子智能体',
    },
    response: (tok: number) => `响应 · ${formatNumber(tok)} tok`,
    responseNoTok: '响应',
    toolCall: '工具调用',
    thinkingLabel: (chars: number) => `思考 · ${formatNumber(chars)} 字符`,
    resultLabel: '结果',
    resultError: '结果（错误）',
  },
} as const;

interface NodeStyleDef {
  bg: string;
  border: string;
  text: string;
}

const nodeStyleDefs: Record<string, NodeStyleDef> = {
  user: {
    bg: 'bg-blue-500/8',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
  },
  assistant: {
    bg: 'bg-surface',
    border: 'border-border',
    text: 'text-foreground',
  },
  tool_use: {
    bg: 'bg-indigo-500/8',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
  },
  tool_result: {
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
  thinking: {
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
  },
  subagent_group: {
    bg: 'bg-purple-500/8',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
  },
};

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function getNodeStyle(type: string, t: Strings): NodeStyleDef & { label: string } {
  const labels = t.nodeLabels as Record<string, string>;
  const def = nodeStyleDefs[type] || nodeStyleDefs.assistant;
  return { ...def, label: labels[type] || labels.assistant };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** @visibleForTesting */
export function truncate(str: string | unknown, max: number): string {
  if (str === null) return '[stripped]';
  if (typeof str !== 'string') {
    return String(str ?? '');
  }
  const clean = str.replaceAll('\n', ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

/** @visibleForTesting */
export function tokenSummary(
  input: number | null,
  cacheRead: number | null,
  cacheWrite: number | null,
  output: number | null,
): string {
  const parts: string[] = [];
  if (input) parts.push(`${formatNumber(input)} in`);
  if (cacheRead) parts.push(`${formatNumber(cacheRead)} cr`);
  if (cacheWrite) parts.push(`${formatNumber(cacheWrite)} cw`);
  if (output) parts.push(`${formatNumber(output)} out`);
  return parts.join(' \u00B7 ');
}

/** @visibleForTesting */
export function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(3)}`;
}

/** @visibleForTesting */
export function messageNodeSummary(node: MessageNode, t?: Strings): string {
  const s = t ?? STRINGS.en;
  switch (node.type) {
    case 'user': {
      return truncate(node.content, 60);
    }
    case 'assistant': {
      return node.outputTokens ? s.response(node.outputTokens) : s.responseNoTok;
    }
    case 'tool_use': {
      return node.toolName ? `${node.toolName}${getToolArg(node)}` : s.toolCall;
    }
    case 'tool_result': {
      return node.isError ? s.resultError : s.resultLabel;
    }
    case 'thinking': {
      return s.thinkingLabel(typeof node.content === 'string' ? node.content.length : 0);
    }
    default: {
      return '';
    }
  }
}

/** @visibleForTesting */
export function getToolArg(node: MessageNode): string {
  if (!node.toolInput) return '';
  const input = node.toolInput;
  if (typeof input.file_path === 'string') {
    const parts = input.file_path.split('/');
    return ` \u00B7 ${parts.at(-1)}`;
  }
  if (typeof input.command === 'string') {
    return ` \u00B7 ${truncate(input.command, 30)}`;
  }
  if (typeof input.pattern === 'string') {
    return ` \u00B7 "${truncate(input.pattern, 20)}"`;
  }
  return '';
}

/** @visibleForTesting */
export function subagentSummary(node: SubagentGroupNode): string {
  return `${node.label} \u00B7 ${node.requestCount} req${node.requestCount === 1 ? '' : 's'}${node.totalCost > 0 ? ` \u00B7 ${formatCost(node.totalCost)}` : ''}`;
}

// ── Component ───────────────────────────────────────────────────────

export function SessionDAG({ nodes }: { nodes: ConversationNode[] }) {
  const t = STRINGS[useLocale()];
  const subagentGroupCount = useMemo(
    () => nodes.reduce((count, n) => (n.kind === 'subagent_group' ? count + 1 : count), 0),
    [nodes],
  );

  const [expandAllCounter, setExpandAllCounter] = useState(0);
  const [collapseAllCounter, setCollapseAllCounter] = useState(0);

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center font-mono">{t.noData}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-center gap-4">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.flowGraph}
        </span>
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-3 text-2xs font-mono text-subtle">
          <span>{t.nodes(nodes.length)}</span>
          {subagentGroupCount > 0 && <span>{t.subAgents(subagentGroupCount)}</span>}
          {subagentGroupCount > 0 && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => {
                  setExpandAllCounter((c) => c + 1);
                  track('agentic_workload_dag_expand_all');
                }}
                className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
              >
                {t.expandAll}
              </button>
              <button
                onClick={() => {
                  setCollapseAllCounter((c) => c + 1);
                  track('agentic_workload_dag_collapse_all');
                }}
                className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
              >
                {t.collapseAll}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* DAG container */}
      <div className="relative rounded-md border border-border bg-surface p-4 overflow-x-auto">
        <div
          className="relative"
          style={{ minWidth: TRUNK_X + TRUNK_WIDTH + CONNECTOR_WIDTH + BRANCH_WIDTH + 40 }}
        >
          {nodes.map((node, idx) => {
            if (node.kind === 'subagent_group') {
              return (
                <SubagentGroupRow
                  key={node.id}
                  node={node}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === nodes.length - 1}
                  expandAllCounter={expandAllCounter}
                  collapseAllCounter={collapseAllCounter}
                  t={t}
                />
              );
            }

            return (
              <MessageNodeRow
                key={node.id}
                node={node}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === nodes.length - 1}
                t={t}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.legend}
        </span>
        {Object.entries(nodeStyleDefs).map(([key, style]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm border ${style.bg} ${style.border}`} />
            <span className="text-3xs font-mono text-subtle">{getNodeStyle(key, t).label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Trunk message node row ──────────────────────────────────────────

function MessageNodeRow({
  node,
  index: _index,
  isFirst,
  isLast,
  t,
}: {
  node: MessageNode;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  t: Strings;
}) {
  const style = getNodeStyle(node.type, t);

  return (
    <div className="relative flex items-stretch" style={{ minHeight: NODE_HEIGHT + NODE_GAP }}>
      {/* Trunk connector line */}
      <div
        className="absolute flex flex-col items-center"
        style={{ left: TRUNK_X - 8, width: 16, top: 0, bottom: 0 }}
      >
        {!isFirst && <div className="w-px flex-1 bg-border" />}
        <div className="w-2 h-2 rounded-full bg-border shrink-0" />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>

      {/* Node card */}
      <div
        className={`flex items-center gap-2 rounded-md border ${style.bg} ${style.border} px-3 font-mono`}
        style={{
          marginLeft: TRUNK_X + 16,
          height: NODE_HEIGHT,
          maxWidth: TRUNK_WIDTH,
          marginTop: NODE_GAP / 2,
          marginBottom: NODE_GAP / 2,
        }}
      >
        <span className={`text-3xs font-bold shrink-0 ${style.text}`}>{style.label}</span>
        <span className="text-2xs text-muted-foreground truncate">
          {messageNodeSummary(node, t)}
        </span>
        {(node.inputTokens ||
          node.cacheReadInputTokens ||
          node.cacheWriteTokens ||
          node.outputTokens) && (
          <span className="text-3xs text-subtle shrink-0">
            {tokenSummary(
              node.inputTokens,
              node.cacheReadInputTokens,
              node.cacheWriteTokens,
              node.outputTokens,
            )}
          </span>
        )}
        {node.durationMs !== null && (
          <span className="text-3xs text-subtle shrink-0">{formatDuration(node.durationMs)}</span>
        )}
        {node.costUsd !== null && node.costUsd > 0 && (
          <span className="text-3xs text-emerald-400 shrink-0">{formatCost(node.costUsd)}</span>
        )}
        {node.isError && (
          <Badge
            variant="outline"
            className="text-3xs py-0 h-4 border-red-500/30 text-red-400 shrink-0"
          >
            error
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Sub-agent group row ─────────────────────────────────────────────

function SubagentGroupRow({
  node,
  index: _index,
  isFirst,
  isLast,
  expandAllCounter,
  collapseAllCounter,
  t,
}: {
  node: SubagentGroupNode;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  expandAllCounter: number;
  collapseAllCounter: number;
  t: Strings;
}) {
  const [expanded, setExpanded] = useState(true);
  // Adjust state during render on prop change instead of in an effect — avoids
  // the extra commit with stale UI between the two renders.
  const [prevExpandAll, setPrevExpandAll] = useState(expandAllCounter);
  const [prevCollapseAll, setPrevCollapseAll] = useState(collapseAllCounter);
  if (expandAllCounter !== prevExpandAll) {
    setPrevExpandAll(expandAllCounter);
    if (expandAllCounter > 0) setExpanded(true);
  }
  if (collapseAllCounter !== prevCollapseAll) {
    setPrevCollapseAll(collapseAllCounter);
    if (collapseAllCounter > 0) setExpanded(false);
  }

  const style = getNodeStyle('subagent_group', t);
  const totalChildHeight = node.children.length * (NODE_HEIGHT + NODE_GAP);

  return (
    <div className="relative">
      {/* Main row with branch-off */}
      <div className="relative flex items-stretch" style={{ minHeight: NODE_HEIGHT + NODE_GAP }}>
        {/* Trunk connector line */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: TRUNK_X - 8, width: 16, top: 0, bottom: 0 }}
        >
          {!isFirst && <div className="w-px flex-1 bg-border" />}
          <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
          {!isLast && <div className="w-px flex-1 bg-border" />}
        </div>

        {/* Branch-off connector: horizontal line from trunk to group node */}
        <svg
          className="absolute"
          style={{
            left: TRUNK_X + 8,
            top: (NODE_HEIGHT + NODE_GAP) / 2 - 1,
            width: CONNECTOR_WIDTH,
            height: 2,
          }}
        >
          <line
            x1={0}
            y1={1}
            x2={CONNECTOR_WIDTH}
            y2={1}
            stroke="#8b5cf6"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        </svg>

        {/* Group header node (clickable) */}
        <div
          className={`flex items-center gap-2 rounded-md border ${style.bg} ${style.border} px-3 font-mono cursor-pointer hover:brightness-125 transition-all`}
          style={{
            marginLeft: TRUNK_X + 16 + CONNECTOR_WIDTH,
            height: NODE_HEIGHT,
            maxWidth: BRANCH_WIDTH,
            marginTop: NODE_GAP / 2,
            marginBottom: NODE_GAP / 2,
          }}
          onClick={() => {
            setExpanded(!expanded);
            track('agentic_workload_dag_group_toggled', { expanded: !expanded });
          }}
        >
          <span className="text-3xs text-subtle shrink-0">{expanded ? '\u25BC' : '\u25B6'}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
          <span className={`text-3xs font-bold shrink-0 ${style.text}`}>{style.label}</span>
          <span className="text-2xs text-muted-foreground truncate">{subagentSummary(node)}</span>
          {(node.totalInputTokens ||
            node.totalCacheRead ||
            node.totalCacheCreation ||
            node.totalOutputTokens) && (
            <span className="text-3xs text-subtle shrink-0">
              {tokenSummary(
                node.totalInputTokens,
                node.totalCacheRead,
                node.totalCacheCreation,
                node.totalOutputTokens,
              )}
            </span>
          )}
          {node.totalDurationMs > 0 && (
            <span className="text-3xs text-subtle shrink-0">
              {formatDuration(node.totalDurationMs)}
            </span>
          )}
        </div>
      </div>

      {/* Children (collapsible) */}
      {expanded && node.children.length > 0 && (
        <div className="relative">
          {/* Vertical branch line for children */}
          {/* Trunk continues */}
          <div
            className="absolute w-px bg-border"
            style={{
              left: TRUNK_X - 8 + 7,
              top: 0,
              height: totalChildHeight,
            }}
          />
          {/* Branch vertical line */}
          <div
            className="absolute w-px"
            style={{
              left: TRUNK_X + 16 + CONNECTOR_WIDTH + CHILD_INDENT - 12,
              top: 0,
              height: totalChildHeight,
              background: '#8b5cf6',
              opacity: 0.3,
            }}
          />

          {node.children.map((child, _childIdx) => {
            const childStyle = getNodeStyle(child.type, t);
            return (
              <div
                key={child.id}
                className="relative flex items-stretch"
                style={{ minHeight: NODE_HEIGHT + NODE_GAP }}
              >
                {/* Child connector dot */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    left: TRUNK_X + 16 + CONNECTOR_WIDTH + CHILD_INDENT - 16,
                    width: 8,
                    top: (NODE_HEIGHT + NODE_GAP) / 2 - 3,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400/50" />
                </div>

                {/* Child node card */}
                <div
                  className={`flex items-center gap-2 rounded-md border ${childStyle.bg} ${childStyle.border} px-3 font-mono`}
                  style={{
                    marginLeft: TRUNK_X + 16 + CONNECTOR_WIDTH + CHILD_INDENT,
                    height: NODE_HEIGHT,
                    maxWidth: BRANCH_WIDTH - CHILD_INDENT,
                    marginTop: NODE_GAP / 2,
                    marginBottom: NODE_GAP / 2,
                  }}
                >
                  <span className={`text-3xs font-bold shrink-0 ${childStyle.text}`}>
                    {childStyle.label}
                  </span>
                  <span className="text-2xs text-muted-foreground truncate">
                    {messageNodeSummary(child, t)}
                  </span>
                  {(child.inputTokens ||
                    child.cacheReadInputTokens ||
                    child.cacheWriteTokens ||
                    child.outputTokens) && (
                    <span className="text-3xs text-subtle shrink-0">
                      {tokenSummary(
                        child.inputTokens,
                        child.cacheReadInputTokens,
                        child.cacheWriteTokens,
                        child.outputTokens,
                      )}
                    </span>
                  )}
                  {child.isError && (
                    <Badge
                      variant="outline"
                      className="text-3xs py-0 h-4 border-red-500/30 text-red-400 shrink-0"
                    >
                      error
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}

          {/* Rejoin connector: from last child back to trunk */}
          <div className="relative" style={{ height: NODE_GAP }}>
            <svg
              className="absolute"
              style={{
                left: TRUNK_X + 8,
                top: -NODE_GAP,
                width: CONNECTOR_WIDTH,
                height: NODE_GAP + 4,
              }}
            >
              <line
                x1={0}
                y1={NODE_GAP + 2}
                x2={CONNECTOR_WIDTH}
                y2={NODE_GAP + 2}
                stroke="#8b5cf6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.4}
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
