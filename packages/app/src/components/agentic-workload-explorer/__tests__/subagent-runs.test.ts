import { describe, expect, it } from 'vitest';
import {
  buildRequestRuns,
  getRequestClaudeCodeAgentId,
  getRequestSubagentLabel,
  getRequestThreadId,
} from '@/lib/agentic-workload-explorer/subagent-runs';
import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';
import { isClaudeCodeWithAgentIdSupport } from '@semianalysisai/inferencex-db/proxytrace/shared/subagent';

function makeReq(overrides: Partial<SessionRequest> = {}): SessionRequest {
  return {
    id: 'req-1',
    timestamp: '2026-01-01T00:00:00Z',
    method: 'POST',
    endpoint: '/v1/messages',
    model: 'claude-opus-4-6',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadInputTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 5000,
    ttftMs: 200,
    tpotMs: 10,
    costUsd: 0.01,
    requestBody: null,
    responseBody: null,
    responseStatusCode: 200,
    isStreaming: true,
    isFastMode: false,
    hashIds: null,
    hashTokenCount: null,
    privacyMode: 'anon',
    subagentLabel: null,
    requestHeaders: null,
    error: null,
    metadata: null,
    ...overrides,
  };
}

describe('getRequestThreadId', () => {
  it('prefers child thread headers over parent session headers', () => {
    expect(
      getRequestThreadId({
        sessionId: 'parent-thread',
        threadId: 'child-thread',
        'x-codex-window-id': 'window-thread:0',
      }),
    ).toBe('child-thread');
  });

  it('uses x-codex-window-id before falling back to session id', () => {
    expect(
      getRequestThreadId({
        session_id: 'parent-thread',
        'x-codex-window-id': 'child-thread:1',
      }),
    ).toBe('child-thread');
  });
});

describe('buildRequestRuns', () => {
  it('splits parallel Codex subagents by child thread id', () => {
    const runs = buildRequestRuns([
      makeReq({
        id: 'codex-a',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'Codex Subagent',
        requestHeaders: {
          sessionId: 'parent-thread',
          threadId: 'child-thread-11111111',
          'x-codex-parent-thread-id': 'parent-thread',
        },
      }),
      makeReq({
        id: 'codex-b',
        timestamp: '2026-01-01T00:00:02Z',
        subagentLabel: 'Codex Subagent',
        requestHeaders: {
          sessionId: 'parent-thread',
          threadId: 'child-thread-22222222',
          'x-codex-parent-thread-id': 'parent-thread',
        },
      }),
    ]);

    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.kind)).toEqual(['subagent_group', 'subagent_group']);
    expect(runs.map((run) => (run.kind === 'subagent_group' ? run.label : null))).toEqual([
      'Codex Subagent · 11111111',
      'Codex Subagent · 22222222',
    ]);
  });

  it('keeps same-thread subagent requests in one run', () => {
    const runs = buildRequestRuns([
      makeReq({
        id: 'codex-a1',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'Codex Subagent',
        requestHeaders: { threadId: 'child-thread-11111111' },
      }),
      makeReq({
        id: 'codex-a2',
        timestamp: '2026-01-01T00:00:02Z',
        subagentLabel: 'Codex Subagent',
        requestHeaders: { threadId: 'child-thread-11111111' },
      }),
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0].kind).toBe('subagent_group');
    expect(runs[0].kind === 'subagent_group' ? runs[0].requests.map((r) => r.id) : []).toEqual([
      'codex-a1',
      'codex-a2',
    ]);
  });

  // ── Claude Code x-claude-code-agent-id (CLI ≥ 2.1.139) ──────────────────

  it('collapses requests sharing x-claude-code-agent-id into one run even when labels drift', () => {
    // Real-world shape from session 886a4fb7…: one Task-spawned general-
    // purpose sub-agent emits both "General Agent" and "Web Search Agent"
    // labelled requests across its lifetime. They share one agent-id and
    // should be ONE group, not two.
    const runs = buildRequestRuns([
      makeReq({
        id: 'r1',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'ac0996017289faf76' },
      }),
      makeReq({
        id: 'r2',
        timestamp: '2026-01-01T00:00:02Z',
        subagentLabel: 'Web Search Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'ac0996017289faf76' },
      }),
      makeReq({
        id: 'r3',
        timestamp: '2026-01-01T00:00:03Z',
        subagentLabel: 'Web Search Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'ac0996017289faf76' },
      }),
      makeReq({
        id: 'r4',
        timestamp: '2026-01-01T00:00:04Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'ac0996017289faf76' },
      }),
    ]);

    expect(runs).toHaveLength(1);
    const run = runs[0];
    expect(run.kind).toBe('subagent_group');
    if (run.kind !== 'subagent_group') return;
    expect(run.requests.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(run.agentId).toBe('ac0996017289faf76');
    // The per-request system-prompt label drifts (General Agent ↔ Web Search
    // Agent) across the agent's life; we don't try to pick one. Always
    // `Subagent`, suffixed with the agent-id for distinguishability.
    expect(run.baseLabel).toBe('Subagent');
    expect(run.label).toBe('Subagent · 289faf76');
  });

  it('keeps a single agent-id run together when main-agent turns interrupt it', () => {
    // Real scenario: user spawns a sub-agent that runs in the background,
    // then makes more main-agent requests while it's executing. With the
    // old algorithm, each contiguous stretch became its own group entry,
    // so the timeline / conversation view fragmented the agent into N
    // pieces. Same agent-id should collapse them all into ONE group.
    const runs = buildRequestRuns([
      makeReq({
        id: 'sub-1',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': '5302011f' },
      }),
      makeReq({
        id: 'sub-2',
        timestamp: '2026-01-01T00:00:02Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': '5302011f' },
      }),
      makeReq({
        id: 'main-1',
        timestamp: '2026-01-01T00:00:03Z',
        subagentLabel: null,
        requestHeaders: null,
      }),
      makeReq({
        id: 'sub-3',
        timestamp: '2026-01-01T00:00:04Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': '5302011f' },
      }),
      makeReq({
        id: 'main-2',
        timestamp: '2026-01-01T00:00:05Z',
        subagentLabel: null,
        requestHeaders: null,
      }),
      makeReq({
        id: 'sub-4',
        timestamp: '2026-01-01T00:00:06Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': '5302011f' },
      }),
    ]);

    expect(runs).toHaveLength(3); // 1 sub-agent group + 2 main turns
    const kinds = runs.map((r) => r.kind);
    expect(kinds).toEqual(['subagent_group', 'main', 'main']);
    const group = runs.find((r) => r.kind === 'subagent_group');
    if (!group || group.kind !== 'subagent_group') return;
    expect(group.requests.map((r) => r.id)).toEqual(['sub-1', 'sub-2', 'sub-3', 'sub-4']);
  });

  it('splits parallel Claude Code sub-agents by agent-id (interleaved timestamps)', () => {
    // Two general-purpose agents running concurrently — like the
    // CUDA/Linux research session — interleave their requests in time.
    // The agent-id grouper should still split them cleanly.
    const runs = buildRequestRuns([
      makeReq({
        id: 'a-1',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'a1032a1c9eb88e0bc' },
      }),
      makeReq({
        id: 'b-1',
        timestamp: '2026-01-01T00:00:02Z',
        subagentLabel: 'General Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'ac0996017289faf76' },
      }),
      makeReq({
        id: 'a-2',
        timestamp: '2026-01-01T00:00:03Z',
        subagentLabel: 'Web Search Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'a1032a1c9eb88e0bc' },
      }),
      makeReq({
        id: 'b-2',
        timestamp: '2026-01-01T00:00:04Z',
        subagentLabel: 'Web Search Agent',
        requestHeaders: { 'x-claude-code-agent-id': 'ac0996017289faf76' },
      }),
    ]);

    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.kind === 'subagent_group')).toBe(true);
    const groups = runs.filter((r) => r.kind === 'subagent_group');
    // Sorted by first-request timestamp.
    expect(groups[0].agentId).toBe('a1032a1c9eb88e0bc');
    expect(groups[0].requests.map((r) => r.id)).toEqual(['a-1', 'a-2']);
    expect(groups[1].agentId).toBe('ac0996017289faf76');
    expect(groups[1].requests.map((r) => r.id)).toEqual(['b-1', 'b-2']);
  });

  it('falls back to the label-only heuristic when agent-id header is absent (backwards compat)', () => {
    // Pre-2.1.139 Claude Code rows have no agent-id header. The grouping
    // should behave exactly as it did before this feature — contiguous
    // same-label runs become one group, distinct labels become separate.
    const runs = buildRequestRuns([
      makeReq({
        id: 'old-1',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'Explore Agent',
        requestHeaders: null,
      }),
      makeReq({
        id: 'old-2',
        timestamp: '2026-01-01T00:00:02Z',
        subagentLabel: 'Explore Agent',
        requestHeaders: null,
      }),
      makeReq({
        id: 'old-3',
        timestamp: '2026-01-01T00:00:03Z',
        subagentLabel: 'Plan Agent',
        requestHeaders: null,
      }),
    ]);

    expect(runs).toHaveLength(2);
    const groups = runs.filter((r) => r.kind === 'subagent_group');
    expect(groups[0].label).toBe('Explore Agent'); // no agent-id / thread-id suffix
    expect(groups[0].requests.map((r) => r.id)).toEqual(['old-1', 'old-2']);
    expect(groups[1].label).toBe('Plan Agent');
    expect(groups[1].requests.map((r) => r.id)).toEqual(['old-3']);
  });

  it('agent-id takes precedence over thread-id when both are present', () => {
    const runs = buildRequestRuns([
      makeReq({
        id: 'hybrid',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'General Agent',
        requestHeaders: {
          'x-claude-code-agent-id': 'cc-agent-id-aaaaaaaa',
          threadId: 'codex-thread-bbbbbbbb',
        },
      }),
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0].kind).toBe('subagent_group');
    if (runs[0].kind !== 'subagent_group') return;
    expect(runs[0].agentId).toBe('cc-agent-id-aaaaaaaa');
    // agent-id group → baseLabel is `Subagent`, suffix comes from agentId.
    expect(runs[0].label).toBe('Subagent · aaaaaaaa');
  });
});

describe('getRequestClaudeCodeAgentId', () => {
  it('reads x-claude-code-agent-id verbatim', () => {
    expect(getRequestClaudeCodeAgentId({ 'x-claude-code-agent-id': 'ac0996017289faf76' })).toBe(
      'ac0996017289faf76',
    );
  });

  it('returns null when the header is absent or empty', () => {
    expect(getRequestClaudeCodeAgentId(null)).toBeNull();
    expect(getRequestClaudeCodeAgentId({})).toBeNull();
    expect(getRequestClaudeCodeAgentId({ 'x-claude-code-agent-id': '' })).toBeNull();
  });
});

describe('isClaudeCodeWithAgentIdSupport', () => {
  it('returns true for exactly 2.1.139', () => {
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/2.1.139 (external, cli)')).toBe(true);
  });

  it('returns true for versions above 2.1.139', () => {
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/2.1.140 (external, cli)')).toBe(true);
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/2.2.0 (external, cli)')).toBe(true);
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/3.0.0 (external, cli)')).toBe(true);
  });

  it('returns false for versions below 2.1.139', () => {
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/2.1.138 (external, cli)')).toBe(false);
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/2.0.999 (external, cli)')).toBe(false);
    expect(isClaudeCodeWithAgentIdSupport('claude-cli/1.99.999 (external, cli)')).toBe(false);
  });

  it('returns false for non-Claude-Code user agents', () => {
    expect(isClaudeCodeWithAgentIdSupport('codex-cli/0.5.0 (rs)')).toBe(false);
    expect(isClaudeCodeWithAgentIdSupport('curl/8.0')).toBe(false);
    expect(isClaudeCodeWithAgentIdSupport(null)).toBe(false);
    expect(isClaudeCodeWithAgentIdSupport('')).toBe(false);
  });
});

describe('getRequestSubagentLabel', () => {
  it('returns null on CC ≥ 2.1.139 when agent-id header is absent (utility calls)', () => {
    // Title Generation, Anthropic.ping(), Name Generation etc. — Claude Code
    // deliberately omits the agent-id header on these to signal "not a real
    // sub-agent." Even if their system prompt matches a heuristic, they
    // should NOT be labeled as sub-agents.
    expect(
      getRequestSubagentLabel(
        makeReq({
          subagentLabel: 'Title Generation',
          requestHeaders: { 'user-agent': 'claude-cli/2.1.139 (external, cli)' },
        }),
      ),
    ).toBeNull();
  });

  it('returns label on CC ≥ 2.1.139 when agent-id header is present', () => {
    expect(
      getRequestSubagentLabel(
        makeReq({
          subagentLabel: 'General Agent',
          requestHeaders: {
            'user-agent': 'claude-cli/2.1.139 (external, cli)',
            'x-claude-code-agent-id': 'ac0996017289faf76',
          },
        }),
      ),
    ).toBe('General Agent');
  });

  it('falls back to generic Subagent on CC ≥ 2.1.139 when agent-id is present but no other label', () => {
    expect(
      getRequestSubagentLabel(
        makeReq({
          subagentLabel: null,
          requestBody: null,
          requestHeaders: {
            'user-agent': 'claude-cli/2.1.139 (external, cli)',
            'x-claude-code-agent-id': 'ac0996017289faf76',
          },
        }),
      ),
    ).toBe('Subagent');
  });

  it('keeps legacy heuristic for CC < 2.1.139 (backwards compat)', () => {
    expect(
      getRequestSubagentLabel(
        makeReq({
          subagentLabel: 'Title Generation',
          requestHeaders: { 'user-agent': 'claude-cli/2.1.138 (external, cli)' },
        }),
      ),
    ).toBe('Title Generation');
  });

  it('keeps legacy heuristic when user-agent is absent (Codex, raw API clients, etc.)', () => {
    expect(
      getRequestSubagentLabel(
        makeReq({
          subagentLabel: 'Codex Subagent',
          requestHeaders: null,
        }),
      ),
    ).toBe('Codex Subagent');
  });
});
