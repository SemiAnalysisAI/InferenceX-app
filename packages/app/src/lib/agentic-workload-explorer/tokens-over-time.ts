import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';
import { buildRequestRuns } from '@/lib/agentic-workload-explorer/subagent-runs';
import { buildHashMetrics } from '@/lib/agentic-workload-explorer/hash-metrics';

export interface TokenSplit {
  cached: number;
  uncached: number;
  total: number;
}

export interface TokenPoint {
  requestId: string;
  /** 1-indexed within the selected agent's chronological requests. */
  turn: number;
  timestampMs: number;
  /** Milliseconds since the first selected request. */
  elapsedMs: number;
  /** Anthropic-reported cache split: cache_read_input_tokens vs cache_write + input. */
  api: TokenSplit;
  /** Hash-chain split: prefix matched against any prior chain in the session. */
  hash: TokenSplit;
  subagentLabel: string | null;
}

export type TokenSplitMode = 'api' | 'hash';

// Sub-agent run keys are prefixed, so they cannot collide with this main-agent sentinel.
export const MAIN_AGENT_KEY = 'main' as const;

interface AgentOption {
  /** `MAIN_AGENT_KEY` for the main agent; otherwise the sub-agent run key. */
  key: string;
  /** Label shown in the dropdown — already includes the agent-id suffix. */
  label: string;
  requestCount: number;
}

export function buildAgentOptions(requests: SessionRequest[]): AgentOption[] {
  if (requests.length === 0) return [];
  const runs = buildRequestRuns(requests);
  const options: AgentOption[] = [];
  let mainCount = 0;
  for (const run of runs) {
    if (run.kind === 'main') mainCount++;
  }
  if (mainCount > 0) {
    options.push({ key: MAIN_AGENT_KEY, label: 'Main Agent', requestCount: mainCount });
  }
  for (const run of runs) {
    if (run.kind === 'subagent_group') {
      options.push({ key: run.key, label: run.label, requestCount: run.requests.length });
    }
  }
  return options;
}

// Plot agents separately so unrelated prompt prefixes do not distort context growth.
export function buildTokenPoints(
  requests: SessionRequest[],
  agentKey: string = MAIN_AGENT_KEY,
): TokenPoint[] {
  if (requests.length === 0) return [];

  const runs = buildRequestRuns(requests);
  let selected: SessionRequest[];
  if (agentKey === MAIN_AGENT_KEY) {
    selected = runs.flatMap((run) => (run.kind === 'main' ? [run.req] : []));
  } else {
    const group = runs.find(
      (run): run is Extract<(typeof runs)[number], { kind: 'subagent_group' }> =>
        run.kind === 'subagent_group' && run.key === agentKey,
    );
    selected = group ? group.requests : [];
  }
  if (selected.length === 0) return [];

  const sorted = [...selected].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const t0 = new Date(sorted[0].timestamp).getTime();

  // Include every prior chain when computing reuse, then emit only the selected agent.
  const allSorted = [...requests].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const { byRequestId: hashByRequest } = buildHashMetrics(
    allSorted.map((r) => ({
      requestId: r.id,
      hashIds: r.hashIds,
      hashTokenCount: r.hashTokenCount,
    })),
  );

  return sorted.map((req, idx) => {
    const apiCached = req.cacheReadInputTokens ?? 0;
    const apiUncached = (req.cacheWriteTokens ?? 0) + (req.inputTokens ?? 0);
    const ts = new Date(req.timestamp).getTime();
    const hashMetric = hashByRequest.get(req.id);
    const hashCached = hashMetric?.cacheRead ?? 0;
    const hashUncached = hashMetric?.cacheWrite ?? 0;
    return {
      requestId: req.id,
      turn: idx + 1,
      timestampMs: ts,
      elapsedMs: ts - t0,
      api: {
        cached: apiCached,
        uncached: apiUncached,
        total: apiCached + apiUncached,
      },
      hash: {
        cached: hashCached,
        uncached: hashUncached,
        total: hashCached + hashUncached,
      },
      subagentLabel: req.subagentLabel,
    };
  });
}

interface CacheHitRates {
  /** API-reported cache hit rate, 0–100. */
  api: number;
  /** Hash-prefix hit rate, 0–100, assuming unlimited cache TTL and capacity. */
  hash: number;
}

export function computeCacheHitRates(points: TokenPoint[]): CacheHitRates {
  let apiCached = 0;
  let apiTotal = 0;
  let hashCached = 0;
  let hashTotal = 0;
  for (const p of points) {
    apiCached += p.api.cached;
    apiTotal += p.api.total;
    hashCached += p.hash.cached;
    hashTotal += p.hash.total;
  }
  return {
    api: apiTotal > 0 ? (apiCached / apiTotal) * 100 : 0,
    hash: hashTotal > 0 ? (hashCached / hashTotal) * 100 : 0,
  };
}

// Include all agents; sub-agent prefixes can reuse earlier main-agent requests.
export function computeSessionCacheHitRates(requests: SessionRequest[]): CacheHitRates {
  if (requests.length === 0) return { api: 0, hash: 0 };

  let apiCached = 0;
  let apiTotal = 0;
  for (const req of requests) {
    const cacheRead = req.cacheReadInputTokens ?? 0;
    const cacheWrite = req.cacheWriteTokens ?? 0;
    const input = req.inputTokens ?? 0;
    apiCached += cacheRead;
    apiTotal += cacheRead + cacheWrite + input;
  }

  const sorted = [...requests].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const { byRequestId } = buildHashMetrics(
    sorted.map((r) => ({
      requestId: r.id,
      hashIds: r.hashIds,
      hashTokenCount: r.hashTokenCount,
    })),
  );

  let hashCached = 0;
  let hashTotal = 0;
  for (const m of byRequestId.values()) {
    hashCached += m.cacheRead;
    hashTotal += m.cacheRead + m.cacheWrite;
  }

  return {
    api: apiTotal > 0 ? (apiCached / apiTotal) * 100 : 0,
    hash: hashTotal > 0 ? (hashCached / hashTotal) * 100 : 0,
  };
}

// ── Context Trajectories ────────────────────────────────────────────────────
// Second chart on the same tab. Shows the main-agent's input-token line plus
// one yellow trajectory per sub-agent invocation, so the user can see where
// sub-agents fired in time and how their context grew during their lifetime.

export interface TrajectoryPoint {
  requestId: string;
  elapsedMs: number;
  total: number;
}

export interface AgentTrajectory {
  /**
   * Stable grouping key from `buildRequestRuns` (e.g. `cc-agent::<uuid>`,
   * `<label>::thread::<id>`, or `<label>::no-id`). Used to color each
   * sub-agent distinctly in the chart legend.
   */
  key: string;
  /** null for the main-agent trajectory; subagent label otherwise. */
  label: string | null;
  points: TrajectoryPoint[];
}

export interface ContextTrajectories {
  /** Main-agent trajectory (single line). Empty array if no main-agent rows. */
  main: TrajectoryPoint[];
  /** One entry per sub-agent invocation (a contiguous run of same-labeled rows). */
  subagents: AgentTrajectory[];
  /** elapsed-ms anchor (first request's timestamp, ms). 0 if no requests. */
  t0: number;
  /** Max total-input-tokens across every plotted point — used as the y-domain. */
  maxTotal: number;
  /** Max elapsed-ms across every plotted point — used as the x-domain. */
  maxElapsed: number;
  /** Counts for the chart subtitle. */
  counts: {
    total: number;
    main: number;
    subagent: number;
    invocations: number;
  };
}

function totalInput(req: SessionRequest): number {
  return (req.cacheReadInputTokens ?? 0) + (req.cacheWriteTokens ?? 0) + (req.inputTokens ?? 0);
}

/**
 * Build per-agent trajectories from a session's requests. Each sub-agent
 * invocation (a contiguous run of same-label, same-thread requests, per the
 * shared `buildRequestRuns` grouper) becomes one yellow trajectory; the main
 * agent's requests collapse into a single dark line.
 *
 * Three separate `Agent SDK` invocations separated by main-agent turns show up
 * as three distinct yellow lines, not one merged line. Codex sub-agents that
 * carry a `thread_id` header are split per-thread even within a single stretch.
 *
 * `elapsedMs` is anchored on the EARLIEST request in the session (sub-agent or
 * main) so sub-agent activity lines up correctly with the main-agent curve
 * when both are plotted on the same axes.
 */
export function buildContextTrajectories(requests: SessionRequest[]): ContextTrajectories {
  if (requests.length === 0) {
    return {
      main: [],
      subagents: [],
      t0: 0,
      maxTotal: 0,
      maxElapsed: 0,
      counts: { total: 0, main: 0, subagent: 0, invocations: 0 },
    };
  }

  // Anchor elapsedMs on the earliest request overall, not just the earliest
  // main-agent one — otherwise sub-agents that fire before turn 1 plot at
  // negative time. Compute t0 from the unsorted input min.
  let t0 = Number.POSITIVE_INFINITY;
  for (const req of requests) {
    const ts = new Date(req.timestamp).getTime();
    if (ts < t0) t0 = ts;
  }
  if (!Number.isFinite(t0)) t0 = 0;

  const mkPoint = (req: SessionRequest): TrajectoryPoint => ({
    requestId: req.id,
    elapsedMs: new Date(req.timestamp).getTime() - t0,
    total: totalInput(req),
  });

  const main: TrajectoryPoint[] = [];
  const subagents: AgentTrajectory[] = [];
  let mainCount = 0;
  let subagentCount = 0;

  for (const run of buildRequestRuns(requests)) {
    if (run.kind === 'main') {
      main.push(mkPoint(run.req));
      mainCount++;
    } else {
      subagents.push({
        key: run.key,
        label: run.label,
        points: run.requests.map(mkPoint),
      });
      subagentCount += run.requests.length;
    }
  }

  // Keep main points in chronological order — buildRequestRuns interleaves
  // mains and sub-agent groups in source order, so sequential mains stay sorted
  // already; this is a defensive sort for any out-of-order edge cases.
  main.sort((a, b) => a.elapsedMs - b.elapsedMs);

  let maxTotal = 0;
  let maxElapsed = 0;
  const visit = (p: TrajectoryPoint) => {
    if (p.total > maxTotal) maxTotal = p.total;
    if (p.elapsedMs > maxElapsed) maxElapsed = p.elapsedMs;
  };
  main.forEach(visit);
  for (const s of subagents) s.points.forEach(visit);

  return {
    main,
    subagents,
    t0,
    maxTotal,
    maxElapsed,
    counts: {
      total: requests.length,
      main: mainCount,
      subagent: subagentCount,
      invocations: subagents.length,
    },
  };
}

/**
 * Format a positive elapsed-ms value as `+MM:SS` (or `+H:MM:SS` for sessions
 * over an hour). Mirrors the NVIDIA-blog reference axis labels.
 */
export function formatElapsedMMSS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `+${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `+${String(m).padStart(2, '0')}:${ss}`;
}
