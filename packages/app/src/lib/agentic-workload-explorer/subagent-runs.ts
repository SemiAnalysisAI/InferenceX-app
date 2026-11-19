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

export function getRequestClaudeCodeAgentId(headers: Record<string, string> | null): string | null {
  if (!headers) return null;
  const id = headers['x-claude-code-agent-id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function getSubagentRunLabel(
  baseLabel: string,
  agentId: string | null,
  threadId: string | null,
): string {
  const suffix = agentId ?? threadId;
  return suffix ? `${baseLabel} · ${suffix.slice(-8)}` : baseLabel;
}

export function getRequestSubagentLabel(req: SubagentGroupableRequest): string | null {
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

  const idGroups = new Map<string, TaggedRequest<T>[]>();
  for (const item of tagged) {
    const key = idGroupKey(item);
    if (!key) continue;
    if (!idGroups.has(key)) idGroups.set(key, []);
    idGroups.get(key)!.push(item);
  }

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
  const sorted = [...items].toSorted(
    (a, b) => new Date(a.req.timestamp).getTime() - new Date(b.req.timestamp).getTime(),
  );
  const threadId = sorted[0].threadId;
  const agentId = sorted[0].agentId;
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
