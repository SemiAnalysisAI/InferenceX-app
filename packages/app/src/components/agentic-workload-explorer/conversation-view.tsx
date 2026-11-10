'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatDollars,
  formatDuration,
  formatInteractivity,
  formatNumber,
  formatTime,
  formatPrefillSpeed,
  computePrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import { buildRequestRuns, type RequestRun } from '@/lib/agentic-workload-explorer/subagent-runs';
import { type ContentBlock } from '@/lib/agentic-workload-explorer/subagent';
import { normalizeDashboardTrace } from '@semianalysisai/inferencex-db/proxytrace/shared/adapters';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { useSearchTracking } from '@/lib/analytics/use-search-tracking';
import { EmptyState } from '@/components/ui/empty-state';

interface RequestData {
  id: string;
  timestamp: string;
  model: string | null;
  requestBody: {
    messages?: {
      role: string;
      content: string | ContentBlock[];
    }[];
    system?: ContentBlock[];
    stream?: boolean;
    [key: string]: unknown;
  } | null;
  responseBody: {
    body?: {
      content?: ContentBlock[];
      stop_reason?: string;
      usage?: Record<string, unknown>;
    };
    [key: string]: unknown;
  } | null;
  responseStatusCode: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadInputTokens: number | null;
  durationMs: number | null;
  ttftMs: number | null;
  tpotMs: number | null;
  isStreaming: boolean;
  isFastMode: boolean | null;
  privacyMode?: 'anon' | 'full';
  hashIds: string[] | null;
  hashCount?: number;
  hashTokenCount: number | null;
  subagentLabel: string | null;
  costUsd: number | null;
  error: string | null;
  requestHeaders: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
}

export function extractTextFromContent(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  const texts = content
    .filter((b) => b.type === 'text')
    .map((b) => {
      if (typeof b.text === 'string') return b.text;
      if (b.text === null) return null;
      return JSON.stringify(b.text);
    });

  if (texts.every((t) => t === null)) {
    return texts.length > 0 ? '[content stripped]' : '';
  }
  return texts.filter((t) => t !== null).join('\n');
}

export function stripSystemReminders(text: string): string {
  return text.replaceAll(/<system-reminder>[\s\S]*?<\/system-reminder>/gu, '').trim();
}

function extractProcessors(metadata: Record<string, unknown> | null): string[] | null {
  const raw = metadata?.pipeline;
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((v): v is string => typeof v === 'string');
  return ids.length > 0 ? ids : null;
}

export interface MessageNode {
  kind: 'message';
  id: string;
  requestId: string;
  isRequestAnchor?: boolean;
  timestamp: string;
  model: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadInputTokens: number | null;
  ttftMs: number | null;
  tpotMs: number | null;
  fastMode: boolean;
  is1mContext: boolean;
  processors: string[] | null;
  costUsd: number | null;
  hashIds: string[] | null;
  hashCount?: number;
  privacyMode?: 'anon' | 'full';
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking';
  content: string;
  toolName?: string;
  toolId?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
  stopReason?: string | null;
  requestContext?: {
    system?: unknown[];
    messageCount: number;
    tools?: unknown[];
  } | null;
}

export interface SubagentGroupNode {
  kind: 'subagent_group';
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalCost: number;
  requestCount: number;
  children: MessageNode[];
}

export type ConversationNode = MessageNode | SubagentGroupNode;

export function buildConversationTree(requests: RequestData[]): ConversationNode[] {
  const nodes: ConversationNode[] = [];
  const normalizedRequests = requests.map((req) => normalizeDashboardTrace(req));

  for (const run of buildRequestRuns(normalizedRequests)) {
    if (run.kind === 'subagent_group') {
      nodes.push(buildSubagentGroupNode(run));
    } else {
      const messages = parseRequestMessages(run.req, true);
      nodes.push(...messages);
    }
  }

  return nodes;
}

function buildSubagentGroupNode(
  run: Extract<RequestRun<RequestData>, { kind: 'subagent_group' }>,
): SubagentGroupNode {
  const groupChildren: MessageNode[] = [];
  let totalDuration = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let totalCost = 0;
  let endMs = new Date(run.requests[0].timestamp).getTime();

  for (const req of run.requests) {
    const requestStartMs = new Date(req.timestamp).getTime();
    if (Number.isFinite(requestStartMs)) {
      endMs = Math.max(endMs, requestStartMs + (req.durationMs || 0));
    }
    totalDuration += req.durationMs || 0;
    totalIn += req.inputTokens || 0;
    totalOut += req.outputTokens || 0;
    totalCacheCreation += req.cacheWriteTokens || 0;
    totalCacheRead += req.cacheReadInputTokens || 0;
    totalCost += req.costUsd || 0;
    groupChildren.push(...parseRequestMessages(req, true));
  }

  return {
    kind: 'subagent_group',
    id: `group-${run.requests[0].timestamp}-${run.baseLabel}-${run.threadId ?? 'no-thread'}`,
    label: run.label,
    startTime: run.requests[0].timestamp,
    endTime: Number.isFinite(endMs)
      ? new Date(endMs).toISOString()
      : run.requests.at(-1)!.timestamp,
    totalDurationMs: totalDuration,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    totalCacheCreation,
    totalCacheRead,
    totalCost,
    requestCount: run.requests.length,
    children: groupChildren,
  };
}

function parseRequestMessages(req: RequestData, onlyLastTurn: boolean): MessageNode[] {
  const nodes: MessageNode[] = [];
  const body = req.requestBody;
  if (!body?.messages) return nodes;
  const fast = isFastMode(req.requestHeaders);
  const ctx1m = is1MContext(req.requestHeaders);
  const processors = extractProcessors(req.metadata);
  const pushNode = (node: Omit<MessageNode, 'requestId' | 'isRequestAnchor'>) => {
    nodes.push({
      ...node,
      requestId: req.id,
      isRequestAnchor: nodes.length === 0,
    });
  };

  const messages = body.messages;

  const requestContext = {
    system: Array.isArray(body.system) ? body.system : undefined,
    messageCount: messages.length,
    tools: Array.isArray(body.tools) ? body.tools : undefined,
  };

  const userMessages = onlyLastTurn
    ? messages.filter((m) => m.role === 'user').slice(-1)
    : messages.filter((m) => m.role === 'user');

  let isFirstNode = true;
  for (const msg of userMessages) {
    const text = extractTextFromContent(msg.content);
    const cleaned = stripSystemReminders(text);
    if (!cleaned) continue;
    pushNode({
      kind: 'message',
      id: `${req.id}-user-${nodes.length}`,
      timestamp: req.timestamp,
      model: req.model,
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      cacheWriteTokens: null,
      cacheReadInputTokens: null,
      ttftMs: null,
      tpotMs: null,
      fastMode: fast,
      is1mContext: ctx1m,
      processors,
      costUsd: null,
      hashIds: null,
      type: 'user',
      content: cleaned,
      requestContext: isFirstNode ? requestContext : null,
    });
    isFirstNode = false;
  }

  const responseContent = req.responseBody?.body?.content;
  const stopReason = req.responseBody?.body?.stop_reason as string | null;

  if (responseContent && Array.isArray(responseContent)) {
    let textIdx = 0;
    let thinkingIdx = 0;
    const responseNodeIndices: number[] = [];
    const trackPush = (node: Omit<MessageNode, 'requestId' | 'isRequestAnchor'>) => {
      pushNode(node);
      responseNodeIndices.push(nodes.length - 1);
    };
    const blankStats = {
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      cacheWriteTokens: null,
      cacheReadInputTokens: null,
      ttftMs: null,
      tpotMs: null,
      costUsd: null,
      hashIds: null,
    };

    const flushText = (textParts: string[]) => {
      if (textParts.length === 0) return;
      const merged = textParts.join('').trim();
      if (!merged) return;
      trackPush({
        kind: 'message',
        id: `${req.id}-response-${textIdx++}`,
        timestamp: req.timestamp,
        model: req.model,
        ...blankStats,
        fastMode: fast,
        is1mContext: ctx1m,
        processors,
        type: 'assistant',
        content: merged,
        stopReason,
      });
    };

    let pendingText: string[] = [];
    for (const block of responseContent) {
      if (block.type === 'text') {
        if (typeof block.text === 'string' && block.text) {
          pendingText.push(block.text);
        } else if (block.text === null) {
          pendingText.push('[content stripped]');
        }
      } else {
        flushText(pendingText);
        pendingText = [];

        if (block.type === 'thinking' && block.thinking) {
          trackPush({
            kind: 'message',
            id: `${req.id}-thinking-${thinkingIdx++}`,
            timestamp: req.timestamp,
            model: req.model,
            ...blankStats,
            fastMode: fast,
            is1mContext: ctx1m,
            processors,
            type: 'thinking',
            content: block.thinking,
          });
        } else if (block.type === 'tool_use') {
          trackPush({
            kind: 'message',
            id: `${req.id}-tool-${block.id}`,
            timestamp: req.timestamp,
            model: req.model,
            ...blankStats,
            fastMode: fast,
            is1mContext: ctx1m,
            processors,
            type: 'tool_use',
            content: '',
            toolName: block.name,
            toolId: block.id,
            toolInput: block.input,
            stopReason,
          });
        }
      }
    }
    flushText(pendingText);

    if (responseNodeIndices.length > 0) {
      let target = responseNodeIndices.at(-1)!;
      for (let k = responseNodeIndices.length - 1; k >= 0; k--) {
        if (nodes[responseNodeIndices[k]].type === 'assistant') {
          target = responseNodeIndices[k];
          break;
        }
      }
      nodes[target] = {
        ...nodes[target],
        durationMs: req.durationMs,
        inputTokens: req.inputTokens,
        outputTokens: req.outputTokens,
        cacheWriteTokens: req.cacheWriteTokens,
        cacheReadInputTokens: req.cacheReadInputTokens,
        ttftMs: req.ttftMs,
        tpotMs: req.tpotMs,
        costUsd: req.costUsd,
        hashIds: req.hashIds,
        hashCount: req.hashCount,
        privacyMode: req.privacyMode,
      };
    }
  }

  return nodes;
}

// Message kinds read from their label. User turns sit one surface step up, thinking is dashed.
const typeStyles: Record<string, { label: string; color: string; border: string; bg: string }> = {
  user: {
    label: 'User',
    color: 'text-foreground',
    border: 'border-border/30',
    bg: 'bg-muted/20',
  },
  assistant: {
    label: 'Assistant',
    color: 'text-foreground',
    border: 'border-border/30',
    bg: 'bg-card',
  },
  tool_use: {
    label: 'Tool call',
    color: 'text-muted-foreground',
    border: 'border-border/30',
    bg: 'bg-card',
  },
  tool_result: {
    label: 'Tool result',
    color: 'text-muted-foreground',
    border: 'border-border/30',
    bg: 'bg-card',
  },
  thinking: {
    label: 'Thinking',
    color: 'text-muted-foreground',
    border: 'border-dashed border-border/30',
    bg: 'bg-card',
  },
};

export const ROW_PAGE_SIZE = 50;

const ROW_STRINGS = {
  en: {
    showMore: (n: string) => `Show ${n} more`,
    hidden: (n: string) => `(${n} hidden)`,
  },
  zh: {
    showMore: (n: string) => `再显示 ${n} 条`,
    hidden: (n: string) => `（还有 ${n} 条隐藏）`,
  },
};

export function useRowLimit(resetKey?: unknown): [number, (n: number) => void, () => void] {
  const [limit, setLimit] = useState(ROW_PAGE_SIZE);
  useEffect(() => setLimit(ROW_PAGE_SIZE), [resetKey]);
  const showMore = useCallback(() => setLimit((l) => l + ROW_PAGE_SIZE), []);
  return [limit, setLimit, showMore];
}

export function ShowMoreRows({
  shown,
  total,
  view,
  onShowMore,
}: {
  shown: number;
  total: number;
  view: string;
  onShowMore: () => void;
}) {
  const locale = useLocale();
  const t = ROW_STRINGS[locale];
  const hidden = total - shown;
  if (hidden <= 0) return null;
  return (
    <div className="flex justify-center py-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          track('agentic_workload_session_rows_expanded', { view, shown, total });
          onShowMore();
        }}
      >
        {t.showMore(Math.min(ROW_PAGE_SIZE, hidden).toLocaleString(locale))}
        <span className="tabular-nums text-muted-foreground">
          {t.hidden(hidden.toLocaleString(locale))}
        </span>
      </Button>
    </div>
  );
}

const STRINGS = {
  en: {
    typeLabels: {
      user: 'User',
      assistant: 'Assistant',
      tool_use: 'Tool call',
      tool_result: 'Tool result',
      thinking: 'Thinking',
    } as Record<string, string>,
    noConversationData: 'No conversation data to display',
    searchPlaceholder: 'Search messages and tool calls',
    search: 'Search',
    noMatches: (query: string) => `No matches for “${query}”`,
    requestDivider: 'request',
    requestBadge: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    cached: 'cached',
    newCache: 'new',
    hashIdsLabel: (count: number) => `hash_ids [${count} blocks]`,
    hashIdsFailed: 'Failed to load hash_ids. Collapse and expand to retry.',
    hashIdsLoading: 'Loading…',
    requestContext: 'Request context',
    messagesInHistory: (n: number) => ` · ${n} messages in history`,
    nTools: (n: number) => ` · ${n} tools`,
    systemPromptSuffix: ' · system prompt',
    systemPromptHeading: 'System prompt',
    toolsHeading: (n: number) => `Tools (${n})`,
    showToolDefs: 'Show tool definitions',
    showLess: 'Show less',
    showFull: (n: string) => `Show full ${n} chars`,
    parameters: 'Parameters',
    nLines: (n: number) => `${n} lines`,
    contentStripped: '[content stripped]',
    tokenIn: 'in:',
    tokenOut: 'out:',
    tok: 'tok',
    cacheReadLabel: 'Cache read',
    cacheCreateLabel: 'Cache create',
  },
  zh: {
    typeLabels: {
      user: '用户',
      assistant: '助手',
      tool_use: '工具调用',
      tool_result: '工具结果',
      thinking: '思考',
    } as Record<string, string>,
    noConversationData: '无对话数据',
    searchPlaceholder: '搜索消息和工具调用',
    search: '搜索',
    noMatches: (query: string) => `未找到“${query}”的匹配项`,
    requestDivider: '请求',
    requestBadge: (n: number) => `${n} 个请求`,
    cached: '缓存命中',
    newCache: '新写入',
    hashIdsLabel: (count: number) => `hash_ids [${count} 个块]`,
    hashIdsFailed: '加载 hash_ids 失败。收起后重新展开即可重试。',
    hashIdsLoading: '加载中…',
    requestContext: '请求上下文',
    messagesInHistory: (n: number) => ` · 历史消息 ${n} 条`,
    nTools: (n: number) => ` · ${n} 个工具`,
    systemPromptSuffix: ' · system prompt',
    systemPromptHeading: '系统提示词',
    toolsHeading: (n: number) => `工具 (${n})`,
    showToolDefs: '查看工具定义',
    showLess: '收起',
    showFull: (n: string) => `展开全部 ${n} 字符`,
    parameters: '参数',
    nLines: (n: number) => `${n} 行`,
    contentStripped: '[内容已脱敏]',
    tokenIn: '输入:',
    tokenOut: '输出:',
    tok: 'tok',
    cacheReadLabel: '缓存读取',
    cacheCreateLabel: '缓存创建',
  },
};

function nodeMatchesQuery(node: ConversationNode, q: string): boolean {
  if (node.kind === 'message') {
    return (
      node.content.toLowerCase().includes(q) || (node.toolName?.toLowerCase().includes(q) ?? false)
    );
  }
  if (node.label.toLowerCase().includes(q)) return true;
  return node.children.some(
    (c) => c.content.toLowerCase().includes(q) || (c.toolName?.toLowerCase().includes(q) ?? false),
  );
}

export function ConversationView({
  requests,
  visibleNodeCount,
  reversed,
  targetRequestId,
}: {
  requests: RequestData[];
  visibleNodeCount?: number;
  reversed?: boolean;
  targetRequestId?: string | null;
}) {
  const t = STRINGS[useLocale()];
  const tree = buildConversationTree(requests);
  const [query, setQuery] = useState('');
  useSearchTracking('agentic_workload_conversation_searched', query);
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setQuery('');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showSearch]);

  const q = query.toLowerCase().trim();
  const filtered = useMemo(
    () => (q ? tree.filter((node) => nodeMatchesQuery(node, q)) : tree),
    [tree, q],
  );
  const sliced = visibleNodeCount === undefined ? filtered : filtered.slice(0, visibleNodeCount);
  const allNodes = reversed ? [...sliced].toReversed() : sliced;
  const [rowLimit, , showMoreRows] = useRowLimit(q);
  const targetIndex = targetRequestId
    ? allNodes.findIndex(
        (node) =>
          node.kind === 'message' && node.isRequestAnchor && node.requestId === targetRequestId,
      )
    : -1;
  const paged = visibleNodeCount === undefined;
  const shownCount = paged ? Math.max(rowLimit, targetIndex + 1) : allNodes.length;
  const displayNodes = shownCount < allNodes.length ? allNodes.slice(0, shownCount) : allNodes;

  if (tree.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noConversationData}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-1">
      {visibleNodeCount === undefined && (
        <div className="flex items-center gap-2 mb-2">
          {showSearch ? (
            <div className="flex-1 relative">
              <Search
                className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-11 w-full rounded-md border border-input bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus:border-foreground/30 focus:outline-none md:h-8"
              />
              {query && (
                <button
                  onClick={() => {
                    track('agentic_workload_conversation_search_cleared');
                    setQuery('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                track('agentic_workload_conversation_search_toggled', { enabled: true });
                setShowSearch(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              <Search aria-hidden="true" />
              {t.search}
              <kbd className="rounded-sm border border-border/30 px-1 text-3xs leading-4 text-muted-foreground">
                ⌘F
              </kbd>
            </Button>
          )}
          {showSearch && q && (
            <span className="text-3xs tabular-nums text-muted-foreground shrink-0">
              {filtered.length} / {tree.length}
            </span>
          )}
        </div>
      )}

      {displayNodes.map((node, idx) => {
        const isAnchor = node.kind === 'message' && node.isRequestAnchor === true;
        const showDivider = idx > 0 && isAnchor;
        return (
          <Fragment key={node.id}>
            {showDivider && <RequestDivider />}
            {node.kind === 'subagent_group' ? (
              <SubagentGroup group={node} highlight={q} />
            ) : (
              <MessageRow msg={node} highlight={q} />
            )}
          </Fragment>
        );
      })}
      <ShowMoreRows
        shown={displayNodes.length}
        total={allNodes.length}
        view="conversation"
        onShowMore={showMoreRows}
      />
      {q && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-6 text-center">{t.noMatches(query)}</p>
      )}
    </div>
  );
}

function SubagentGroup({ group, highlight }: { group: SubagentGroupNode; highlight?: string }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [expanded, setExpanded] = useState(true);

  const startLabel = formatTime(group.startTime, locale);
  const endLabel = formatTime(group.endTime, locale);
  const timeRange = startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;

  return (
    <div>
      <button
        onClick={() => {
          track('agentic_workload_conversation_subagent_toggled', {
            enabled: !expanded,
            label: group.label,
          });
          setExpanded(!expanded);
        }}
        className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground">{group.label}</span>
          <Badge variant="outline" className="text-xs py-0 h-5">
            {t.requestBadge(group.requestCount)}
          </Badge>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(group.totalInputTokens)}/{formatNumber(group.totalOutputTokens)} tok
          </span>
          {(group.totalCacheRead > 0 || group.totalCacheCreation > 0) && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {group.totalCacheRead > 0 && `${formatNumber(group.totalCacheRead)} ${t.cached}`}
              {group.totalCacheRead > 0 && group.totalCacheCreation > 0 && ' · '}
              {group.totalCacheCreation > 0 &&
                `${formatNumber(group.totalCacheCreation)} ${t.newCache}`}
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {group.totalCost > 0 && (
            <span className="tabular-nums">{formatDollars(group.totalCost)}</span>
          )}
          <span className="tabular-nums">{formatDuration(group.totalDurationMs)}</span>
          <span>{timeRange}</span>
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="ml-4 pl-4 border-l border-border/30 py-2 pr-4 space-y-1">
          {group.children.map((child, idx) => {
            const showDivider = idx > 0 && child.isRequestAnchor === true;
            return (
              <Fragment key={child.id}>
                {showDivider && <RequestDivider />}
                <MessageRow msg={child} compact highlight={highlight} />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestDivider() {
  const t = STRINGS[useLocale()];
  return (
    <div className="flex items-center gap-2 my-2" role="separator" aria-label="next request">
      <div className="h-px flex-1 bg-border/30" />
      <span className="text-xs text-muted-foreground font-medium">{t.requestDivider}</span>
      <div className="h-px flex-1 bg-border/30" />
    </div>
  );
}

function HashIdsDetails({
  requestId,
  hashIds,
  count,
}: {
  requestId: string;
  hashIds: string[] | null;
  count: number;
}) {
  const t = STRINGS[useLocale()];
  const [loaded, setLoaded] = useState<string[] | null>(hashIds);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || loaded || state === 'loading') return;
    setState('loading');
    fetch(`/api/v1/agentic-workload-explorer/requests/${requestId}/hash-ids`)
      .then((r) => {
        if (!r.ok) throw new Error(`hash-ids ${r.status}`);
        return r.json() as Promise<{ hashIds: string[] }>;
      })

      .then((d) => {
        setLoaded(d.hashIds);
        setState('idle');
      })
      .catch(() => setState('error'));
  }

  return (
    <details className="mt-2" onToggle={onToggle}>
      <summary className="text-3xs font-mono text-muted-foreground cursor-pointer hover:text-foreground">
        {t.hashIdsLabel(count)}
      </summary>
      <div className="text-3xs font-mono text-muted-foreground mt-1 break-all leading-relaxed">
        {loaded ? `[${loaded.join(', ')}]` : state === 'error' ? t.hashIdsFailed : t.hashIdsLoading}
      </div>
    </details>
  );
}

function MessageRow({
  msg,
  compact,
  highlight,
}: {
  msg: MessageNode;
  compact?: boolean;
  highlight?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const style = typeStyles[msg.type] || typeStyles.assistant;

  return (
    <div
      id={msg.isRequestAnchor ? `req-${msg.requestId}` : undefined}
      data-request-id={msg.requestId}
      className={`rounded-md border ${style.border} ${style.bg} ${compact ? 'px-3 py-2' : 'px-4 py-3'} scroll-mt-20`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap gap-y-1 min-w-0">
          <span className={`text-xs font-medium ${style.color}`}>
            {t.typeLabels[msg.type] ?? style.label}
          </span>
          {msg.toolName && (
            <Badge variant="outline" className="text-xs font-mono py-0 h-5">
              {msg.toolName}
            </Badge>
          )}
          {msg.model && !compact && (
            <span className="text-xs text-muted-foreground">{msg.model}</span>
          )}
          {msg.fastMode && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              fast
            </Badge>
          )}
          {msg.is1mContext && (
            <Badge variant="outline" className="text-xs py-0 h-5 tabular-nums">
              1M
            </Badge>
          )}
          {msg.isRequestAnchor && msg.processors && msg.processors.length > 0 && (
            <span className="text-xs font-mono text-muted-foreground">
              {msg.processors.join(' · ')}
            </span>
          )}
          {msg.stopReason && msg.stopReason !== 'end_turn' && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              {msg.stopReason}
            </Badge>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
          <TokenInfo msg={msg} />
          {msg.ttftMs !== null && (
            <span className="tabular-nums">TTFT {formatDuration(msg.ttftMs)}</span>
          )}
          {(() => {
            const ps = computePrefillSpeed(
              msg.cacheReadInputTokens,
              msg.cacheWriteTokens,
              msg.ttftMs,
            );
            return ps === null ? null : (
              <span className="tabular-nums">{formatPrefillSpeed(ps)}</span>
            );
          })()}
          {msg.tpotMs !== null && (
            <span className="tabular-nums">{formatInteractivity(msg.tpotMs)}</span>
          )}
          {msg.durationMs !== null && (
            <span className="tabular-nums">E2E {formatDuration(msg.durationMs)}</span>
          )}
          <span>{formatTime(msg.timestamp, locale)}</span>
        </div>
      </div>

      {msg.requestContext && <RequestContextBlock context={msg.requestContext} />}

      {msg.type === 'tool_use' ? (
        <ToolCallContent name={msg.toolName} input={msg.toolInput} />
      ) : msg.type === 'tool_result' ? (
        <ToolResultContent content={msg.content} isError={msg.isError} />
      ) : (
        <TextContent text={msg.content} type={msg.type} highlight={highlight} />
      )}

      {msg.privacyMode !== 'full' && (msg.hashIds?.length ?? msg.hashCount ?? 0) > 0 && (
        <HashIdsDetails
          requestId={msg.requestId}
          hashIds={msg.hashIds}
          count={msg.hashIds?.length ?? msg.hashCount ?? 0}
        />
      )}
    </div>
  );
}

function RequestContextBlock({ context }: { context: NonNullable<MessageNode['requestContext']> }) {
  const t = STRINGS[useLocale()];
  const systemTexts = context.system
    ?.map((block: unknown) => {
      if (block && typeof block === 'object' && (block as Record<string, unknown>).text) {
        const text = (block as Record<string, unknown>).text;
        return typeof text === 'string' ? text : null;
      }
      return null;
    })
    .filter(Boolean) as string[] | undefined;

  const hasSystem = systemTexts && systemTexts.length > 0;
  const hasTools = context.tools && context.tools.length > 0;

  if (!hasSystem && !hasTools && context.messageCount <= 1) return null;

  return (
    <details className="mb-2">
      <summary className="text-3xs text-muted-foreground cursor-pointer hover:text-foreground">
        {t.requestContext}
        {context.messageCount > 1 && t.messagesInHistory(context.messageCount)}
        {hasTools && t.nTools(context.tools!.length)}
        {hasSystem && t.systemPromptSuffix}
      </summary>
      <div className="mt-2 space-y-2">
        {hasSystem && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t.systemPromptHeading}
            </div>
            <pre className="text-xs font-mono bg-muted/40 rounded-md p-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
              {systemTexts!.join('\n\n---\n\n')}
            </pre>
          </div>
        )}
        {hasTools && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {t.toolsHeading(context.tools!.length)}
            </div>
            <details>
              <summary className="text-3xs text-muted-foreground cursor-pointer">
                {t.showToolDefs}
              </summary>
              <pre className="text-xs font-mono bg-muted/40 rounded-md p-2 overflow-x-auto max-h-64 overflow-y-auto mt-1">
                {JSON.stringify(context.tools, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </details>
  );
}

function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(
    new RegExp(`(${query.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)})`, 'giu'),
  );
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-primary/25 text-foreground rounded-sm px-px">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function TextContent({
  text,
  type,
  highlight,
}: {
  text: string | unknown;
  type: string;
  highlight?: string;
}) {
  const t = STRINGS[useLocale()];
  const [expanded, setExpanded] = useState(false);

  if (text === null) {
    return <div className="text-xs text-muted-foreground">{t.contentStripped}</div>;
  }
  if (!text) return null;
  if (typeof text !== 'string') {
    return <pre className="text-xs font-mono">{JSON.stringify(text, null, 2)}</pre>;
  }
  const maxPreview = type === 'thinking' ? 200 : 500;
  const truncated = text.length > maxPreview;
  const displayText = truncated && !expanded ? `${text.slice(0, maxPreview)}...` : text;

  const useMarkdown = !highlight && (type === 'user' || type === 'assistant');

  return (
    <div className="space-y-1.5">
      {truncated && (
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_conversation_text_toggled', { enabled: !expanded });
            setExpanded((value) => !value);
          }}
          className="text-xs text-muted-foreground hover:text-foreground font-medium"
        >
          {expanded ? t.showLess : t.showFull(formatNumber(text.length))}
        </button>
      )}
      {useMarkdown ? (
        <MarkdownText text={displayText} />
      ) : (
        <div className="text-sm whitespace-pre-wrap break-words">
          <HighlightText text={displayText} query={highlight} />
        </div>
      )}
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="text-sm break-words leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-xs font-medium mt-2 mb-1">{children}</h4>,
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-5 mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-5 mb-2 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border/30 pl-3 text-muted-foreground mb-2">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-border/30" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="text-xs font-mono border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border/30 bg-card px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border/30 px-2 py-1">{children}</td>,
          code({ className, children, ...props }) {
            const isBlock = /language-/u.test(className ?? '');
            if (isBlock) {
              return (
                <code className={`${className ?? ''} font-mono text-xs`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="font-mono text-xs px-1 py-px rounded-sm bg-muted/50" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="text-xs font-mono bg-muted/40 rounded-md p-2.5 overflow-x-auto mb-2 whitespace-pre">
              {children}
            </pre>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ToolCallContent({ name, input }: { name?: string; input?: Record<string, unknown> }) {
  const t = STRINGS[useLocale()];
  if (!input) return null;

  if (name === 'Read' && input.file_path) {
    return (
      <div className="text-sm font-mono text-muted-foreground">
        {String(input.file_path)}
        {input.offset
          ? ` (lines ${input.offset}-${Number(input.offset) + Number(input.limit || 100)})`
          : ''}
      </div>
    );
  }

  if (name === 'Edit' && input.file_path) {
    return (
      <div className="space-y-1">
        <div className="text-sm font-mono text-muted-foreground">{String(input.file_path)}</div>
        {input.old_string !== null && (
          <pre className="text-xs font-mono bg-destructive/10 text-destructive rounded-md p-2 overflow-x-auto max-h-32 overflow-y-auto">
            {String(input.old_string)}
          </pre>
        )}
        {input.new_string !== null && (
          <pre className="text-xs font-mono bg-success/10 text-success rounded-md p-2 overflow-x-auto max-h-32 overflow-y-auto">
            {String(input.new_string)}
          </pre>
        )}
      </div>
    );
  }

  if (name === 'Bash' && input.command) {
    return (
      <pre className="text-sm font-mono bg-muted/50 rounded-md p-2 overflow-x-auto">
        $ {String(input.command)}
      </pre>
    );
  }

  if (name === 'Write' && input.file_path) {
    return (
      <div className="space-y-1">
        <div className="text-sm font-mono text-muted-foreground">{String(input.file_path)}</div>
        {input.content !== null && (
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">
              {t.nLines(String(input.content).split('\n').length)}
            </summary>
            <pre className="text-xs font-mono bg-muted/50 rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto mt-1">
              {String(input.content)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (name === 'Grep' || name === 'Glob') {
    return (
      <div className="text-sm font-mono text-muted-foreground">
        {name === 'Grep' ? `grep "${input.pattern}"` : `glob "${input.pattern}"`}
        {input.path ? ` in ${input.path}` : ''}
      </div>
    );
  }

  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer">{t.parameters}</summary>
      <pre className="text-xs font-mono bg-muted/50 rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto mt-1">
        {JSON.stringify(input, null, 2)}
      </pre>
    </details>
  );
}

function ToolResultContent({ content, isError }: { content: string | unknown; isError?: boolean }) {
  const t = STRINGS[useLocale()];
  if (content === null) {
    return <div className="text-xs text-muted-foreground">{t.contentStripped}</div>;
  }
  if (!content) return null;
  if (typeof content !== 'string') {
    return <pre className="text-xs font-mono">{JSON.stringify(content, null, 2)}</pre>;
  }
  const maxPreview = 300;
  const truncated = content.length > maxPreview;

  return (
    <details open={!truncated}>
      <summary
        className={`text-xs font-mono ${isError ? 'text-destructive' : 'text-muted-foreground'} ${truncated ? 'cursor-pointer' : 'list-none'} whitespace-pre-wrap break-words`}
      >
        {truncated ? `${content.slice(0, maxPreview)}...` : content}
      </summary>
      {truncated && (
        <pre
          className={`text-xs font-mono ${isError ? 'text-destructive' : 'text-muted-foreground'} mt-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap`}
        >
          {content}
        </pre>
      )}
    </details>
  );
}

function isFastMode(headers: Record<string, string> | null): boolean {
  if (!headers) return false;
  const beta = headers['anthropic-beta'] || '';
  return beta.includes('fast-mode');
}

function is1MContext(headers: Record<string, string> | null): boolean {
  if (!headers) return false;
  const beta = headers['anthropic-beta'] || '';
  return beta.includes('context-1m-');
}

function TokenInfo({ msg }: { msg: MessageNode }) {
  const t = STRINGS[useLocale()];
  if (msg.inputTokens === null && msg.outputTokens === null) return null;

  const cacheRead = msg.cacheReadInputTokens || 0;
  const cacheCreation = msg.cacheWriteTokens || 0;
  const hasCache = cacheRead > 0 || cacheCreation > 0;
  const cost = msg.costUsd;

  return (
    <span className="flex items-center gap-1.5 tabular-nums">
      {hasCache ? (
        <>
          <span className="text-muted-foreground">
            {t.tokenIn} {formatNumber(msg.inputTokens || 0)}
          </span>
          {cacheRead > 0 && (
            <span>
              +{formatNumber(cacheRead)} {t.cacheReadLabel}
            </span>
          )}
          {cacheCreation > 0 && (
            <span>
              +{formatNumber(cacheCreation)} {t.cacheCreateLabel}
            </span>
          )}
          <span className="text-muted-foreground">
            {t.tokenOut} {formatNumber(msg.outputTokens || 0)}
          </span>
        </>
      ) : (
        <span>
          {formatNumber(msg.inputTokens || 0)}/{formatNumber(msg.outputTokens || 0)} {t.tok}
        </span>
      )}
      {cost !== null && <span>{formatDollars(cost)}</span>}
    </span>
  );
}
