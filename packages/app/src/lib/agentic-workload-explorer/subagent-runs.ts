import { getSubagentLabel, type ContentBlock } from '@/lib/agentic-workload-explorer/subagent';
import { isClaudeCodeWithAgentIdSupport } from '@semianalysisai/inferencex-db/proxytrace/shared/subagent';

export interface SubagentGroupableRequest {
  id: string;
  timestamp: string;
  model: string | null;
  requestBody: Record<string, unknown> | null;
  requestHeaders: Record<string, string> | null;
  subagentLabel: string | null;
  durationMs: number | null;
}

export type RequestRun<T extends SubagentGroupableRequest> =
  | {
      kind: 'main';
      req: T;
    }
  | {
      kind: 'subagent_group';
      key: string;
      baseLabel: string;
      label: string;
      threadId: string | null;
      /** Stable Claude Code agent identity, independent of system-prompt label drift. */
      agentId: string | null;
      requests: T[];
    };

interface TaggedRequest<T extends SubagentGroupableRequest> {
  req: T;
  subagentLabel: string | null;
  threadId: string | null;
  agentId: string | null;
}

export function getRequestThreadId(headers: Record<string, string> | null): string | null {
  if (!headers) return null;

  const threadId = headers.threadId ?? headers.thread_id ?? headers['x-codex-thread-id'];
  if (threadId) return threadId;

  const windowId = headers['x-codex-window-id'];
  if (windowId) return windowId.split(':', 1)[0];

  return headers.sessionId ?? headers.session_id ?? null;
}

// Claude Code >= 2.1.139 identifies sub-agents by header; main and utility calls omit it.
export function getRequestClaudeCodeAgentId(headers: Record<string, string> | null): string | null {
  if (!headers) return null;
  const id = headers['x-claude-code-agent-id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

// Distinguish concurrent agents that share a label with a stable ID suffix.
function getSubagentRunLabel(
  baseLabel: string,
  agentId: string | null,
  threadId: string | null,
): string {
  const suffix = agentId ?? threadId;
  return suffix ? `${baseLabel} · ${suffix.slice(-8)}` : baseLabel;
}

export function getRequestSubagentLabel(req: SubagentGroupableRequest): string | null {
  // Agent-ID-capable clients omit the header on main/utility calls, even when a
  // stored label suggests a sub-agent. The header takes precedence over that label.
  const userAgent = req.requestHeaders?.['user-agent'] ?? null;
  if (isClaudeCodeWithAgentIdSupport(userAgent)) {
    const agentId = getRequestClaudeCodeAgentId(req.requestHeaders);
    if (!agentId) return null;
    if (req.subagentLabel) return req.subagentLabel;
    const system = Array.isArray(req.requestBody?.system)
      ? (req.requestBody.system as ContentBlock[])
      : null;
    return getSubagentLabel(system) ?? 'Subagent';
  }

  if (req.subagentLabel) return req.subagentLabel;

  const system = Array.isArray(req.requestBody?.system)
    ? (req.requestBody.system as ContentBlock[])
    : null;
  const label = getSubagentLabel(system);
  if (label) return label;

  if (req.model?.includes('haiku') && req.requestBody?.max_tokens !== 1) {
    return 'Subagent (Haiku)';
  }

  return null;
}

export function buildRequestRuns<T extends SubagentGroupableRequest>(
  requests: T[],
): RequestRun<T>[] {
  const tagged = requests.map((req): TaggedRequest<T> => ({
    req,
    subagentLabel: getRequestSubagentLabel(req),
    threadId: getRequestThreadId(req.requestHeaders),
    agentId: getRequestClaudeCodeAgentId(req.requestHeaders),
  }));

  // Group stable IDs across the whole session, including interleaved main-agent turns.
  const idGroups = new Map<string, TaggedRequest<T>[]>();
  for (const item of tagged) {
    const key = idGroupKey(item);
    if (!key) continue;
    if (!idGroups.has(key)) idGroups.set(key, []);
    idGroups.get(key)!.push(item);
  }

  // Emit ID groups at their first request; without stable IDs, group only contiguous labels.
  const runs: RequestRun<T>[] = [];
  const emitted = new Set<string>();
  let i = 0;
  while (i < tagged.length) {
    const tag = tagged[i];

    if (!tag.subagentLabel) {
      runs.push({ kind: 'main', req: tag.req });
      i++;
      continue;
    }

    const key = idGroupKey(tag);
    if (key) {
      if (!emitted.has(key)) {
        emitted.add(key);
        runs.push(buildSubagentGroup(key, idGroups.get(key)!));
      }
      i++;
      continue;
    }

    // Label-only fallback (pre-2.1.139 Claude Code, no headers). Same
    // stretch-based grouping as before: contiguous same-label requests
    // collapse into one group; a main-agent interruption ends the run.
    const stretch: TaggedRequest<T>[] = [];
    while (i < tagged.length && tagged[i].subagentLabel && !idGroupKey(tagged[i])) {
      stretch.push(tagged[i]);
      i++;
    }
    const byLabel = new Map<string, TaggedRequest<T>[]>();
    for (const item of stretch) {
      const k = `${item.subagentLabel}::no-id`;
      if (!byLabel.has(k)) byLabel.set(k, []);
      byLabel.get(k)!.push(item);
    }
    for (const [k, items] of byLabel) {
      runs.push(buildSubagentGroup(k, items));
    }
  }

  return runs;
}

function idGroupKey<T extends SubagentGroupableRequest>(item: TaggedRequest<T>): string | null {
  if (!item.subagentLabel) return null;
  if (item.agentId) return `cc-agent::${item.agentId}`;
  if (item.threadId) return `${item.subagentLabel}::thread::${item.threadId}`;
  return null;
}

function buildSubagentGroup<T extends SubagentGroupableRequest>(
  key: string,
  items: TaggedRequest<T>[],
): Extract<RequestRun<T>, { kind: 'subagent_group' }> {
  // Sort by timestamp so the group's requests appear chronologically in
  // the conversation/timeline views, even if the input wasn't strictly
  // sorted. (Defensive — buildRequestRuns is typically called with
  // already-sorted requests, but cheap to enforce.)
  const sorted = [...items].toSorted(
    (a, b) => new Date(a.req.timestamp).getTime() - new Date(b.req.timestamp).getTime(),
  );
  const threadId = sorted[0].threadId;
  const agentId = sorted[0].agentId;
  // For agent-id groups the per-request label drifts arbitrarily across
  // the agent's life; we don't try to name them. The semantic name lives
  // in Claude Code's local subagents/*.meta.json which isn't on the wire.
  const baseLabel = agentId ? 'Subagent' : (sorted[0].subagentLabel ?? 'Subagent');
  return {
    kind: 'subagent_group',
    key,
    baseLabel,
    label: getSubagentRunLabel(baseLabel, agentId, threadId),
    threadId,
    agentId,
    requests: sorted.map((item) => item.req),
  };
}
