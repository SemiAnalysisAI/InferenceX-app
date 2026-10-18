'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import {
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
  /** Block count when hashIds weren't loaded (fetched on demand instead). */
  hashCount?: number;
  hashTokenCount: number | null;
  subagentLabel: string | null;
  costUsd: number | null;
  error: string | null;
  requestHeaders: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
}

// -- Content helpers ---------------------------------------------------------

/** @visibleForTesting */
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

  // If all text blocks are stripped, show one marker
  if (texts.every((t) => t === null)) {
    return texts.length > 0 ? '[content stripped]' : '';
  }
  return texts.filter((t) => t !== null).join('\n');
}

/** @visibleForTesting */
export function stripSystemReminders(text: string): string {
  return text.replaceAll(/<system-reminder>[\s\S]*?<\/system-reminder>/gu, '').trim();
}

/** Pull the core pipeline stages from metadata. */
function extractProcessors(metadata: Record<string, unknown> | null): string[] | null {
  const raw = metadata?.pipeline;
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((v): v is string => typeof v === 'string');
  return ids.length > 0 ? ids : null;
}

// -- Tree structure ----------------------------------------------------------
// We build a list of "ConversationNode" items. Each node is either a
// top-level message or a subagent group that contains its own messages.

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
  // Normalize OpenAI Responses bodies to the Anthropic shape
  // before tagging/parsing — everything downstream assumes messages[] + content[].
  const normalizedRequests = requests.map((req) => normalizeDashboardTrace(req));

  for (const run of buildRequestRuns(normalizedRequests)) {
    if (run.kind === 'subagent_group') {
      nodes.push(buildSubagentGroupNode(run));
    } else {
      // Main agent request — extract only the latest turn's messages
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

/**
 * Parse a single request into MessageNodes.
 * For main agent: only extract the last user message + response (to avoid
 * re-showing the entire conversation history on each turn).
 * For subagents: extract only the latest turn to avoid repeating the growing
 * conversation history (each request carries prior tool calls + the original prompt).
 */
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

  // Build request context (system prompt, message count, tools)
  const requestContext = {
    system: Array.isArray(body.system) ? body.system : undefined,
    messageCount: messages.length,
    tools: Array.isArray(body.tools) ? body.tools : undefined,
  };

  // Extract user message(s)
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

  // Note: we intentionally skip the request message history (prior assistant
  // tool_use and user tool_result blocks) to avoid showing the subagent's
  // growing conversation history. Each request's response content is shown
  // separately below.

  // Extract response content
  const responseContent = req.responseBody?.body?.content;
  const stopReason = req.responseBody?.body?.stop_reason as string | null;

  if (responseContent && Array.isArray(responseContent)) {
    // Codex Responses commonly interleaves text runs with reasoning/function_call
    // items. We emit one node per run/block, so the suffix has to disambiguate
    // them within a single request — a static `-response` collides on the second
    // text run and React warns about duplicate keys.
    let textIdx = 0;
    let thinkingIdx = 0;
    // Track which response-derived nodes were appended so we can stamp the
    // request's usage/cost/timing on the most informative one *after* the
    // response is fully parsed. Without deferring we'd attribute the billed
    // numbers to the model's preamble ("I'll pull from official sources…")
    // instead of the substantive final answer.
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

    // Flush accumulated consecutive text blocks into a single assistant node
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
          // Anon-stripped assistant text. Emit a placeholder so the message
          // node still renders (and carries the request's stats).
          pendingText.push('[content stripped]');
        }
      } else {
        // Non-text block breaks the run — flush accumulated text first
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
    // Flush any trailing text blocks
    flushText(pendingText);

    // Attribute the request's billing/timing to the most informative response
    // node — preferring the last assistant text (the answer), and otherwise
    // the last emitted node (e.g. when the response is purely tool_use).
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

// -- Styles ------------------------------------------------------------------

const typeStyles: Record<string, { label: string; color: string; border: string; bg: string }> = {
  user: {
    label: 'User',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
  },
  assistant: {
    label: 'Assistant',
    color: 'text-foreground',
    border: 'border-border',
    bg: 'bg-card',
  },
  tool_use: {
    label: 'Tool Call',
    color: 'text-indigo-400',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/5',
  },
  tool_result: {
    label: 'Tool Result',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
  },
  thinking: {
    label: 'Thinking',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
  },
};

const STRINGS = {
  en: {
    typeLabels: {
      user: 'User',
      assistant: 'Assistant',
      tool_use: 'Tool Call',
      tool_result: 'Tool Result',
      thinking: 'Thinking',
    } as Record<string, string>,
    noConversationData: 'No conversation data to display',
    searchPlaceholder: 'Search messages, tool calls, content...',
    search: 'Search',
    noMatches: (query: string) => `No matches for “${query}”`,
    requestDivider: 'request',
    requestBadge: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    cached: 'cached',
    newCache: 'new',
    hashIdsLabel: (count: number) => `hash_ids [${count} blocks]`,
    hashIdsFailed: 'Failed to load hash_ids — collapse and expand to retry.',
    hashIdsLoading: 'Loading…',
    requestContext: 'Request Context',
    messagesInHistory: (n: number) => ` · ${n} messages in history`,
    nTools: (n: number) => ` · ${n} tools`,
    systemPromptSuffix: ' · system prompt',
    systemPromptHeading: 'System Prompt',
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
    cacheReadLabel: 'cache_read',
    cacheCreateLabel: 'cache_create',
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
    searchPlaceholder: '搜索消息、工具调用、内容…',
    search: '搜索',
    noMatches: (query: string) => `未找到“${query}”的匹配项`,
    requestDivider: '请求',
    requestBadge: (n: number) => `${n} 个请求`,
    cached: '缓存命中',
    newCache: '新写入',
    hashIdsLabel: (count: number) => `hash_ids [${count} 个块]`,
    hashIdsFailed: '加载 hash_ids 失败——收起后重新展开即可重试。',
    hashIdsLoading: '加载中…',
    requestContext: '请求上下文',
    messagesInHistory: (n: number) => ` · 历史消息 ${n} 条`,
    nTools: (n: number) => ` · ${n} 个工具`,
    systemPromptSuffix: ' · system prompt',
    systemPromptHeading: 'System Prompt',
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
    cacheReadLabel: 'cache_read',
    cacheCreateLabel: 'cache_create',
  },
};

// -- Components --------------------------------------------------------------

function nodeMatchesQuery(node: ConversationNode, q: string): boolean {
  if (node.kind === 'message') {
    return (
      node.content.toLowerCase().includes(q) || (node.toolName?.toLowerCase().includes(q) ?? false)
    );
  }
  // subagent group: check label and children
  if (node.label.toLowerCase().includes(q)) return true;
  return node.children.some(
    (c) => c.content.toLowerCase().includes(q) || (c.toolName?.toLowerCase().includes(q) ?? false),
  );
}

export function ConversationView({
  requests,
  visibleNodeCount,
  reversed,
}: {
  requests: RequestData[];
  visibleNodeCount?: number;
  reversed?: boolean;
}) {
  const t = STRINGS[useLocale()];
  const tree = buildConversationTree(requests);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+F to open search
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
  const displayNodes = reversed ? [...sliced].toReversed() : sliced;

  if (tree.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t.noConversationData}</p>;
  }

  return (
    <div className="space-y-1">
      {/* Search bar — hidden during replay mode */}
      {visibleNodeCount === undefined && (
        <div className="flex items-center gap-2 mb-2">
          {showSearch ? (
            <div className="flex-1 relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full text-xs font-mono bg-background border border-border rounded-md pl-8 pr-8 py-1.5 text-foreground placeholder:text-subtle focus:outline-none focus:border-foreground/30 transition-colors"
              />
              {query && (
                <button
                  onClick={() => {
                    track('agentic_workload_conversation_search_cleared');
                    setQuery('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-foreground"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                track('agentic_workload_conversation_search_toggled', { open: true });
                setShowSearch(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-2xs font-mono text-subtle hover:text-foreground border border-border rounded-md hover:bg-surface-hover transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {t.search}
              <kbd className="text-3xs text-subtle border border-border rounded px-1 py-px ml-1">
                ⌘F
              </kbd>
            </button>
          )}
          {showSearch && q && (
            <span className="text-3xs font-mono text-subtle shrink-0">
              {filtered.length} / {tree.length}
            </span>
          )}
        </div>
      )}

      {/* Results */}
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
      {q && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground py-6 text-center font-mono">
          {t.noMatches(query)}
        </p>
      )}
    </div>
  );
}

function SubagentGroup({ group, highlight }: { group: SubagentGroupNode; highlight?: string }) {
  const t = STRINGS[useLocale()];
  const [expanded, setExpanded] = useState(true);

  const timeRange =
    formatTime(group.startTime) === formatTime(group.endTime)
      ? formatTime(group.startTime)
      : `${formatTime(group.startTime)} – ${formatTime(group.endTime)}`;

  return (
    <div className="rounded-md border border-purple-500/30 bg-purple-500/5">
      {/* Group header */}
      <button
        onClick={() => {
          track('agentic_workload_conversation_subagent_toggled', {
            expanded: !expanded,
            label: group.label,
          });
          setExpanded(!expanded);
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-purple-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-xs font-medium text-purple-400">{group.label}</span>
          <Badge
            variant="outline"
            className="text-xs py-0 h-5 border-purple-500/30 text-purple-400"
          >
            {t.requestBadge(group.requestCount)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatNumber(group.totalInputTokens)}/{formatNumber(group.totalOutputTokens)} tok
          </span>
          {(group.totalCacheRead > 0 || group.totalCacheCreation > 0) && (
            <span className="text-xs text-cyan-400 font-mono">
              {group.totalCacheRead > 0 && `${formatNumber(group.totalCacheRead)} ${t.cached}`}
              {group.totalCacheRead > 0 && group.totalCacheCreation > 0 && ' · '}
              {group.totalCacheCreation > 0 &&
                `${formatNumber(group.totalCacheCreation)} ${t.newCache}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {group.totalCost > 0 && (
            <span className="font-mono text-emerald-400">{formatCost(group.totalCost)}</span>
          )}
          <span className="font-mono">{formatDuration(group.totalDurationMs)}</span>
          <span>{timeRange}</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded children */}
      {expanded && (
        <div className="border-t border-purple-500/20 ml-4 pl-4 border-l-2 border-l-purple-500/20 py-2 pr-4 space-y-1">
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
      <div className="h-px flex-1 bg-border" />
      <span className="text-3xs font-mono uppercase tracking-eyebrow-wide text-subtle">
        {t.requestDivider}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Collapsed hash_ids list. When the session was loaded without hash_ids (the
 * conversation tab), the list is fetched for this one request on first expand.
 */
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
      <summary className="text-3xs font-mono text-cyan-400 cursor-pointer hover:text-cyan-300">
        {t.hashIdsLabel(count)}
      </summary>
      <div className="text-3xs font-mono text-cyan-400/70 mt-1 break-all leading-relaxed">
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
  const t = STRINGS[useLocale()];
  const style = typeStyles[msg.type] || typeStyles.assistant;

  return (
    <div
      id={msg.isRequestAnchor ? `req-${msg.requestId}` : undefined}
      data-request-id={msg.requestId}
      className={`rounded-md border ${style.border} ${style.bg} ${compact ? 'px-3 py-2' : 'px-4 py-3'} scroll-mt-20`}
    >
      {/* Header. The badge cluster can get long (pipeline processors etc.) —
          let it wrap and keep the metrics block from being pushed off-screen. */}
      <div className="flex items-start justify-between gap-x-3 mb-1.5">
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
            <span className="text-xs text-muted-foreground font-mono">{msg.model}</span>
          )}
          {msg.fastMode && (
            <Badge
              variant="outline"
              className="text-xs py-0 h-5 border-orange-500/30 text-orange-400"
            >
              fast
            </Badge>
          )}
          {msg.is1mContext && (
            <Badge
              variant="outline"
              className="text-xs py-0 h-5 border-sky-500/30 text-sky-400 font-mono"
            >
              1M
            </Badge>
          )}
          {msg.isRequestAnchor &&
            msg.processors?.map((p) => (
              <Badge
                key={p}
                variant="outline"
                className="text-xs py-0 h-5 border-violet-500/30 text-violet-400 font-mono"
              >
                {p}
              </Badge>
            ))}
          {msg.stopReason && msg.stopReason !== 'end_turn' && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              {msg.stopReason}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 flex-wrap justify-end gap-y-1">
          <TokenInfo msg={msg} />
          {msg.ttftMs !== null && (
            <span className="font-mono">TTFT {formatDuration(msg.ttftMs)}</span>
          )}
          {(() => {
            const ps = computePrefillSpeed(
              msg.cacheReadInputTokens,
              msg.cacheWriteTokens,
              msg.ttftMs,
            );
            return ps === null ? null : (
              <span className="font-mono text-sky-500">{formatPrefillSpeed(ps)}</span>
            );
          })()}
          {msg.tpotMs !== null && (
            <span className="font-mono">{formatInteractivity(msg.tpotMs)}</span>
          )}
          {msg.durationMs !== null && (
            <span className="font-mono">E2E {formatDuration(msg.durationMs)}</span>
          )}
          <span>{formatTime(msg.timestamp)}</span>
        </div>
      </div>

      {/* Request context (system prompt, message history, tools) */}
      {msg.requestContext && <RequestContextBlock context={msg.requestContext} />}

      {/* Content */}
      {msg.type === 'tool_use' ? (
        <ToolCallContent name={msg.toolName} input={msg.toolInput} />
      ) : msg.type === 'tool_result' ? (
        <ToolResultContent content={msg.content} isError={msg.isError} />
      ) : (
        <TextContent text={msg.content} type={msg.type} highlight={highlight} />
      )}

      {/* Hash IDs — only shown for anon traces. Full-mode traces also carry
          hash blocks for debugging, but we keep them out of the UI to avoid
          duplicating information already visible in the redacted body. */}
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
      <summary className="text-3xs font-mono text-muted-foreground cursor-pointer hover:text-foreground">
        {t.requestContext}
        {context.messageCount > 1 && t.messagesInHistory(context.messageCount)}
        {hasTools && t.nTools(context.tools!.length)}
        {hasSystem && t.systemPromptSuffix}
      </summary>
      <div className="mt-2 space-y-2">
        {hasSystem && (
          <div>
            <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-amber-400 mb-1">
              {t.systemPromptHeading}
            </div>
            <pre className="text-xs font-mono bg-amber-500/5 border border-amber-500/20 rounded p-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
              {systemTexts!.join('\n\n---\n\n')}
            </pre>
          </div>
        )}
        {hasTools && (
          <div>
            <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-indigo-400 mb-1">
              {t.toolsHeading(context.tools!.length)}
            </div>
            <details>
              <summary className="text-3xs font-mono text-muted-foreground cursor-pointer">
                {t.showToolDefs}
              </summary>
              <pre className="text-xs font-mono bg-indigo-500/5 border border-indigo-500/20 rounded p-2 overflow-x-auto max-h-64 overflow-y-auto mt-1">
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
          <mark key={i} className="bg-amber-500/30 text-foreground rounded-sm px-px">
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
    return (
      <div className="text-xs font-mono text-muted-foreground italic">{t.contentStripped}</div>
    );
  }
  if (!text) return null;
  if (typeof text !== 'string') {
    return <pre className="text-xs font-mono">{JSON.stringify(text, null, 2)}</pre>;
  }
  const maxPreview = type === 'thinking' ? 200 : 500;
  const truncated = text.length > maxPreview;
  const displayText = truncated && !expanded ? `${text.slice(0, maxPreview)}...` : text;

  // Render markdown for user/assistant messages so code fences, lists, headers
  // etc. display structurally instead of as raw syntax. Skip when there's an
  // active search highlight (the highlighter doesn't compose with the markdown
  // AST) and for `thinking` blocks (model output of structured reasoning we
  // already truncate aggressively — markdown adds little there).
  const useMarkdown = !highlight && (type === 'user' || type === 'assistant');

  return (
    <div className="space-y-1.5">
      {truncated && (
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_conversation_text_toggled', { expanded: !expanded });
            setExpanded((value) => !value);
          }}
          className="text-3xs font-mono text-subtle hover:text-foreground uppercase tracking-eyebrow"
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
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold uppercase tracking-wide mt-2 mb-1">{children}</h4>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-5 mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-5 mb-2 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic mb-2">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="text-xs font-mono border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-surface px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
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
              <code
                className="font-mono text-xs px-1 py-px rounded bg-surface border border-border"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="text-xs font-mono bg-surface border border-border rounded p-2.5 overflow-x-auto mb-2 whitespace-pre">
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
          <pre className="text-xs font-mono bg-red-500/10 text-red-400 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
            {String(input.old_string)}
          </pre>
        )}
        {input.new_string !== null && (
          <pre className="text-xs font-mono bg-emerald-500/10 text-emerald-400 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
            {String(input.new_string)}
          </pre>
        )}
      </div>
    );
  }

  if (name === 'Bash' && input.command) {
    return (
      <pre className="text-sm font-mono bg-muted/50 rounded p-2 overflow-x-auto">
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
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto mt-1">
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

  // Default: show JSON
  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer">{t.parameters}</summary>
      <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto mt-1">
        {JSON.stringify(input, null, 2)}
      </pre>
    </details>
  );
}

function ToolResultContent({ content, isError }: { content: string | unknown; isError?: boolean }) {
  const t = STRINGS[useLocale()];
  if (content === null) {
    return (
      <div className="text-xs font-mono text-muted-foreground italic">{t.contentStripped}</div>
    );
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
        className={`text-xs font-mono ${isError ? 'text-red-400' : 'text-muted-foreground'} ${truncated ? 'cursor-pointer' : 'list-none'} whitespace-pre-wrap break-words`}
      >
        {truncated ? `${content.slice(0, maxPreview)}...` : content}
      </summary>
      {truncated && (
        <pre
          className={`text-xs font-mono ${isError ? 'text-red-400' : 'text-muted-foreground'} mt-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap`}
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

function formatCost(cost: number): string {
  if (cost < 0.01) return `<$0.01`;
  return `$${cost.toFixed(3)}`;
}

function TokenInfo({ msg }: { msg: MessageNode }) {
  const t = STRINGS[useLocale()];
  if (msg.inputTokens === null && msg.outputTokens === null) return null;

  const cacheRead = msg.cacheReadInputTokens || 0;
  const cacheCreation = msg.cacheWriteTokens || 0;
  const hasCache = cacheRead > 0 || cacheCreation > 0;
  const cost = msg.costUsd;

  return (
    <span className="font-mono flex items-center gap-1.5">
      {hasCache ? (
        <>
          <span className="text-muted-foreground">
            {t.tokenIn} {formatNumber(msg.inputTokens || 0)}
          </span>
          {cacheRead > 0 && (
            <span className="text-cyan-400">
              +{formatNumber(cacheRead)} {t.cacheReadLabel}
            </span>
          )}
          {cacheCreation > 0 && (
            <span className="text-amber-400">
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
      {cost !== null && <span className="text-emerald-400">{formatCost(cost)}</span>}
    </span>
  );
}
