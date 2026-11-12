'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatDollars,
  formatNumber,
  formatDuration,
} from '@/lib/agentic-workload-explorer/format';
import {
  ShowMoreRows,
  useRowLimit,
  type ConversationNode,
  type MessageNode,
  type SubagentGroupNode,
} from '@/components/agentic-workload-explorer/conversation-view';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { EmptyState } from '@/components/ui/empty-state';

const NODE_HEIGHT = 36;
const NODE_GAP = 4;
const TRUNK_X = 24;
const TRUNK_WIDTH = 520;
const _BRANCH_X = 56;
const BRANCH_WIDTH = 480;
const CHILD_INDENT = 32;
const CONNECTOR_WIDTH = 32;

const STRINGS = {
  en: {
    flowGraph: 'Flow graph',
    noData: 'No conversation data to display',
    nodes: (n: number) => `${n} nodes`,
    subAgents: (n: number) => `${n} sub-agent${n === 1 ? '' : 's'}`,
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
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
    toolCall: 'Tool call',
    thinkingLabel: (chars: number) => `Thinking · ${formatNumber(chars)} chars`,
    resultLabel: 'Result',
    resultError: 'Result (error)',
    errorBadge: 'error',
  },
  zh: {
    flowGraph: '流程图',
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
    errorBadge: '错误',
  },
} as const;

interface NodeStyleDef {
  bg: string;
  border: string;
  text: string;
}

// Node kinds read from their label. User turns and subagent groups sit one surface step up.
const nodeStyleDefs: Record<string, NodeStyleDef> = {
  user: {
    bg: 'bg-muted/20',
    border: 'border-border/30',
    text: 'text-foreground',
  },
  assistant: {
    bg: 'bg-card',
    border: 'border-border/30',
    text: 'text-foreground',
  },
  tool_use: {
    bg: 'bg-card',
    border: 'border-border/30',
    text: 'text-muted-foreground',
  },
  tool_result: {
    bg: 'bg-card',
    border: 'border-border/30',
    text: 'text-muted-foreground',
  },
  thinking: {
    bg: 'bg-card',
    border: 'border-dashed border-border/30',
    text: 'text-muted-foreground',
  },
  subagent_group: {
    bg: 'bg-muted/20',
    border: 'border-border/30',
    text: 'text-foreground',
  },
};

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function getNodeStyle(type: string, t: Strings): NodeStyleDef & { label: string } {
  const labels = t.nodeLabels as Record<string, string>;
  const def = nodeStyleDefs[type] || nodeStyleDefs.assistant;
  return { ...def, label: labels[type] || labels.assistant };
}

export function truncate(str: string | unknown, max: number): string {
  if (str === null) return '[stripped]';
  if (typeof str !== 'string') {
    return String(str ?? '');
  }
  const clean = str.replaceAll('\n', ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

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

export function formatCost(cost: number): string {
  return formatDollars(cost);
}

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

export function subagentSummary(node: SubagentGroupNode): string {
  return `${node.label} \u00B7 ${node.requestCount} req${node.requestCount === 1 ? '' : 's'}${node.totalCost > 0 ? ` \u00B7 ${formatCost(node.totalCost)}` : ''}`;
}

export function SessionDAG({ nodes }: { nodes: ConversationNode[] }) {
  const t = STRINGS[useLocale()];
  const subagentGroupCount = useMemo(
    () => nodes.reduce((count, n) => (n.kind === 'subagent_group' ? count + 1 : count), 0),
    [nodes],
  );

  const [expandAllCounter, setExpandAllCounter] = useState(0);
  const [collapseAllCounter, setCollapseAllCounter] = useState(0);
  const [rowLimit, , showMoreRows] = useRowLimit(nodes.length === 0);
  const shownNodes = nodes.length > rowLimit ? nodes.slice(0, rowLimit) : nodes;

  if (nodes.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noData}
      </EmptyState>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0 grow basis-48">
            <CardTitle>{t.flowGraph}</CardTitle>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {[
                t.nodes(nodes.length),
                subagentGroupCount > 0 ? t.subAgents(subagentGroupCount) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {subagentGroupCount > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setExpandAllCounter((c) => c + 1);
                  track('agentic_workload_dag_expand_all');
                }}
              >
                {t.expandAll}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setCollapseAllCounter((c) => c + 1);
                  track('agentic_workload_dag_collapse_all');
                }}
              >
                {t.collapseAll}
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {Object.entries(nodeStyleDefs).map(([key, style]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm border ${style.bg} ${style.border}`} />
              <span className="text-xs text-muted-foreground">{getNodeStyle(key, t).label}</span>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        <div
          className="relative"
          style={{ minWidth: TRUNK_X + TRUNK_WIDTH + CONNECTOR_WIDTH + BRANCH_WIDTH + 40 }}
        >
          {shownNodes.map((node, idx) => {
            if (node.kind === 'subagent_group') {
              return (
                <SubagentGroupRow
                  key={node.id}
                  node={node}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === shownNodes.length - 1}
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
                isLast={idx === shownNodes.length - 1}
                t={t}
              />
            );
          })}
        </div>
        <ShowMoreRows
          shown={shownNodes.length}
          total={nodes.length}
          view="flow"
          onShowMore={showMoreRows}
        />
      </CardContent>
    </Card>
  );
}

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
      <div
        className="absolute flex flex-col items-center"
        style={{ left: TRUNK_X - 8, width: 16, top: 0, bottom: 0 }}
      >
        {!isFirst && <div className="w-px flex-1 bg-border/30" />}
        <div className="w-2 h-2 rounded-full bg-border shrink-0" />
        {!isLast && <div className="w-px flex-1 bg-border/30" />}
      </div>

      <div
        className={`flex items-center gap-2 rounded-md border ${style.bg} ${style.border} px-3 tabular-nums`}
        style={{
          marginLeft: TRUNK_X + 16,
          height: NODE_HEIGHT,
          maxWidth: TRUNK_WIDTH,
          marginTop: NODE_GAP / 2,
          marginBottom: NODE_GAP / 2,
        }}
      >
        <span className={`text-xs font-medium shrink-0 ${style.text}`}>{style.label}</span>
        <span className="text-xs text-muted-foreground truncate">
          {messageNodeSummary(node, t)}
        </span>
        {(node.inputTokens ||
          node.cacheReadInputTokens ||
          node.cacheWriteTokens ||
          node.outputTokens) && (
          <span className="text-xs text-muted-foreground shrink-0">
            {tokenSummary(
              node.inputTokens,
              node.cacheReadInputTokens,
              node.cacheWriteTokens,
              node.outputTokens,
            )}
          </span>
        )}
        {node.durationMs !== null && (
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDuration(node.durationMs)}
          </span>
        )}
        {node.costUsd !== null && node.costUsd > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{formatCost(node.costUsd)}</span>
        )}
        {node.isError && (
          <Badge
            variant="outline"
            className="text-xs py-0 h-4 border-destructive/30 text-destructive shrink-0"
          >
            {t.errorBadge}
          </Badge>
        )}
      </div>
    </div>
  );
}

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
      <div className="relative flex items-stretch" style={{ minHeight: NODE_HEIGHT + NODE_GAP }}>
        <div
          className="absolute flex flex-col items-center"
          style={{ left: TRUNK_X - 8, width: 16, top: 0, bottom: 0 }}
        >
          {!isFirst && <div className="w-px flex-1 bg-border/30" />}
          <div className="w-2 h-2 rounded-full bg-foreground/60 shrink-0" />
          {!isLast && <div className="w-px flex-1 bg-border/30" />}
        </div>

        <svg
          className="absolute text-muted-foreground"
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
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        </svg>

        <div
          className={`flex items-center gap-2 rounded-md border ${style.bg} ${style.border} px-3 tabular-nums cursor-pointer hover:bg-muted/60 transition-colors`}
          style={{
            marginLeft: TRUNK_X + 16 + CONNECTOR_WIDTH,
            height: NODE_HEIGHT,
            maxWidth: BRANCH_WIDTH,
            marginTop: NODE_GAP / 2,
            marginBottom: NODE_GAP / 2,
          }}
          onClick={() => {
            setExpanded(!expanded);
            track('agentic_workload_dag_group_toggled', { enabled: !expanded });
          }}
        >
          {expanded ? (
            <ChevronDown className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
          )}
          <span className={`text-xs font-medium shrink-0 ${style.text}`}>{style.label}</span>
          <span className="text-xs text-muted-foreground truncate">{subagentSummary(node)}</span>
          {(node.totalInputTokens ||
            node.totalCacheRead ||
            node.totalCacheCreation ||
            node.totalOutputTokens) && (
            <span className="text-xs text-muted-foreground shrink-0">
              {tokenSummary(
                node.totalInputTokens,
                node.totalCacheRead,
                node.totalCacheCreation,
                node.totalOutputTokens,
              )}
            </span>
          )}
          {node.totalDurationMs > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDuration(node.totalDurationMs)}
            </span>
          )}
        </div>
      </div>

      {expanded && node.children.length > 0 && (
        <div className="relative">
          <div
            className="absolute w-px bg-border/30"
            style={{
              left: TRUNK_X - 8 + 7,
              top: 0,
              height: totalChildHeight,
            }}
          />
          <div
            className="absolute w-px bg-border/30"
            style={{
              left: TRUNK_X + 16 + CONNECTOR_WIDTH + CHILD_INDENT - 12,
              top: 0,
              height: totalChildHeight,
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
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    left: TRUNK_X + 16 + CONNECTOR_WIDTH + CHILD_INDENT - 16,
                    width: 8,
                    top: (NODE_HEIGHT + NODE_GAP) / 2 - 3,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-border" />
                </div>

                <div
                  className={`flex items-center gap-2 rounded-md border ${childStyle.bg} ${childStyle.border} px-3 tabular-nums`}
                  style={{
                    marginLeft: TRUNK_X + 16 + CONNECTOR_WIDTH + CHILD_INDENT,
                    height: NODE_HEIGHT,
                    maxWidth: BRANCH_WIDTH - CHILD_INDENT,
                    marginTop: NODE_GAP / 2,
                    marginBottom: NODE_GAP / 2,
                  }}
                >
                  <span className={`text-xs font-medium shrink-0 ${childStyle.text}`}>
                    {childStyle.label}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {messageNodeSummary(child, t)}
                  </span>
                  {(child.inputTokens ||
                    child.cacheReadInputTokens ||
                    child.cacheWriteTokens ||
                    child.outputTokens) && (
                    <span className="text-xs text-muted-foreground shrink-0">
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
                      className="text-xs py-0 h-4 border-destructive/30 text-destructive shrink-0"
                    >
                      error
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}

          <div className="relative" style={{ height: NODE_GAP }}>
            <svg
              className="absolute text-muted-foreground"
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
                stroke="currentColor"
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
