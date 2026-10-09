import { describe, it, expect } from 'vitest';
import {
  buildStatRows,
  flattenStatRowsChronologically,
  type StatRow,
} from '@/lib/agentic-workload-explorer/stat-rows';
import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';

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

// ---------------------------------------------------------------------------
// buildStatRows
// ---------------------------------------------------------------------------
describe('buildStatRows', () => {
  it('returns empty array for empty input', () => {
    expect(buildStatRows([])).toEqual([]);
  });

  it('returns a single main row with turn 1 for one non-subagent request', () => {
    const rows = buildStatRows([makeReq()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('main');
    expect(rows[0].turn).toBe(1);
    const main = rows[0] as StatRow & { kind: 'main' };
    expect(main.input).toBe(1000);
    expect(main.output).toBe(500);
    expect(main.cacheRead).toBe(0);
    expect(main.cacheWrite).toBe(0);
    expect(main.cost).toBe(0.01);
    expect(main.durationMs).toBe(5000);
    expect(main.ttftMs).toBe(200);
    expect(main.tpotMs).toBe(10);
    expect(main.isClassifierLike).toBe(false);
  });

  it('marks classifier-like calls from camel-cased or stored response fields', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'classifier-camel',
        responseBody: {
          body: { stopReason: 'stop_sequence', stopSequence: '</block>' },
        },
      }),
      makeReq({
        id: 'classifier-snake',
        responseBody: {
          stop_reason: 'stop_sequence',
          stop_sequence: '</severity>',
        },
      }),
      makeReq({
        id: 'ordinary-stop',
        responseBody: {
          body: { stopReason: 'end_turn', stopSequence: '</block>' },
        },
      }),
    ]);

    expect(rows.map((row) => row.kind === 'main' && row.isClassifierLike)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('restores chronology around a collapsed subagent group', () => {
    const agentHeaders = {
      'user-agent': 'claude-cli/2.1.139',
      'x-claude-code-agent-id': 'agent-1',
    };
    const rows = buildStatRows([
      makeReq({ id: 'main', timestamp: '2026-01-01T00:00:00Z' }),
      makeReq({
        id: 'sub-1',
        timestamp: '2026-01-01T00:00:01Z',
        subagentLabel: 'Subagent',
        requestHeaders: agentHeaders,
      }),
      makeReq({
        id: 'classifier',
        timestamp: '2026-01-01T00:00:02Z',
        responseBody: {
          body: { stopReason: 'stop_sequence', stopSequence: '</severity>' },
        },
      }),
      makeReq({
        id: 'sub-2',
        timestamp: '2026-01-01T00:00:03Z',
        subagentLabel: 'Subagent',
        requestHeaders: agentHeaders,
      }),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(['main', 'subagent_group', 'main']);
    expect(flattenStatRowsChronologically(rows).map(({ row }) => row.requestId)).toEqual([
      'main',
      'sub-1',
      'classifier',
      'sub-2',
    ]);
  });

  it('assigns incrementing turn numbers to multiple non-subagent requests', () => {
    const rows = buildStatRows([
      makeReq({ id: 'r1', timestamp: '2026-01-01T00:00:00Z' }),
      makeReq({ id: 'r2', timestamp: '2026-01-01T00:01:00Z' }),
      makeReq({ id: 'r3', timestamp: '2026-01-01T00:02:00Z' }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.turn)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.kind === 'main')).toBe(true);
  });

  it('groups a haiku request (not max_tokens=1) as subagent_group', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'h1',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 200,
        outputTokens: 100,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('subagent_group');
    const group = rows[0] as StatRow & { kind: 'subagent_group' };
    expect(group.label).toBe('Subagent (Haiku)');
    expect(group.requestCount).toBe(1);
    expect(group.input).toBe(200);
    expect(group.output).toBe(100);
  });

  it('treats a haiku request with max_tokens=1 as main (test ping)', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'h-ping',
        model: 'claude-haiku-4-5-20251001',
        requestBody: { max_tokens: 1 } as Record<string, unknown>,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('main');
  });

  it('handles mixed main and subagent sequences correctly', () => {
    const rows = buildStatRows([
      makeReq({ id: 'r1', timestamp: '2026-01-01T00:00:00Z' }),
      makeReq({
        id: 'h1',
        timestamp: '2026-01-01T00:01:00Z',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        durationMs: 1000,
      }),
      makeReq({
        id: 'h2',
        timestamp: '2026-01-01T00:02:00Z',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 150,
        outputTokens: 75,
        costUsd: 0.002,
        durationMs: 1500,
      }),
      makeReq({ id: 'r2', timestamp: '2026-01-01T00:03:00Z' }),
    ]);

    expect(rows).toHaveLength(3);

    // First: main turn 1
    expect(rows[0].kind).toBe('main');
    expect(rows[0].turn).toBe(1);

    // Second: subagent_group turn 2 (two haiku requests merged)
    expect(rows[1].kind).toBe('subagent_group');
    expect(rows[1].turn).toBe(2);
    const group = rows[1] as StatRow & { kind: 'subagent_group' };
    expect(group.requestCount).toBe(2);
    expect(group.label).toBe('Subagent (Haiku)');

    // Third: main turn 3
    expect(rows[2].kind).toBe('main');
    expect(rows[2].turn).toBe(3);
  });

  it('aggregates tokens, cost, and duration in subagent groups', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'h1',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 10,
        cacheWriteTokens: 5,
        costUsd: 0.001,
        durationMs: 1000,
        ttftMs: 100,
        tpotMs: 8,
      }),
      makeReq({
        id: 'h2',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 200,
        outputTokens: 100,
        cacheReadInputTokens: 20,
        cacheWriteTokens: 15,
        costUsd: 0.002,
        durationMs: 2000,
        ttftMs: 150,
        tpotMs: 12,
      }),
    ]);

    expect(rows).toHaveLength(1);
    const group = rows[0] as StatRow & { kind: 'subagent_group' };
    expect(group.kind).toBe('subagent_group');
    expect(group.input).toBe(300);
    expect(group.output).toBe(150);
    expect(group.cacheRead).toBe(30);
    expect(group.cacheWrite).toBe(20);
    expect(group.cost).toBeCloseTo(0.003);
    expect(group.durationMs).toBe(3000);
    expect(group.requestCount).toBe(2);
    expect(group.children).toHaveLength(2);
  });

  it('splits parallel Codex subagents by child thread id', () => {
    const rows = buildStatRows([
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

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'subagent_group')).toBe(true);
    expect(rows.map((row) => (row.kind === 'subagent_group' ? row.label : null))).toEqual([
      'Codex Subagent · 11111111',
      'Codex Subagent · 22222222',
    ]);
    expect(rows.map((row) => row.requestId)).toEqual(['codex-a', 'codex-b']);
  });

  it('uses first ttftMs in subagent group', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'h1',
        model: 'claude-haiku-4-5-20251001',
        ttftMs: 100,
        outputTokens: 50,
        tpotMs: 10,
      }),
      makeReq({
        id: 'h2',
        model: 'claude-haiku-4-5-20251001',
        ttftMs: 200,
        outputTokens: 100,
        tpotMs: 20,
      }),
    ]);
    const group = rows[0] as StatRow & { kind: 'subagent_group' };
    expect(group.ttftMs).toBe(100);
  });

  it('computes weighted average tpotMs across subagent children', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'h1',
        model: 'claude-haiku-4-5-20251001',
        outputTokens: 51, // 50 intervals
        tpotMs: 10,
      }),
      makeReq({
        id: 'h2',
        model: 'claude-haiku-4-5-20251001',
        outputTokens: 101, // 100 intervals
        tpotMs: 20,
      }),
    ]);
    const group = rows[0] as StatRow & { kind: 'subagent_group' };
    // weighted: (10 * 50 + 20 * 100) / (50 + 100) = 2500 / 150 ≈ 16.67
    expect(group.tpotMs).toBeCloseTo(2500 / 150);
  });

  it('returns null tpotMs when no children have valid tpot data', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'h1',
        model: 'claude-haiku-4-5-20251001',
        outputTokens: 1,
        tpotMs: null,
      }),
    ]);
    const group = rows[0] as StatRow & { kind: 'subagent_group' };
    expect(group.tpotMs).toBeNull();
  });

  it('detects subagent via system prompt pattern', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'r1',
        requestBody: {
          system: [{ type: 'text', text: 'You are a file search specialist agent.' }],
        } as Record<string, unknown>,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('subagent_group');
    const group = rows[0] as StatRow & { kind: 'subagent_group' };
    expect(group.label).toBe('Explore Agent');
  });

  it('handles null token/cost values without crashing', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'r1',
        inputTokens: null,
        outputTokens: null,
        cacheReadInputTokens: null,
        cacheWriteTokens: null,
        costUsd: null,
        durationMs: null,
      }),
    ]);
    expect(rows).toHaveLength(1);
    const main = rows[0] as StatRow & { kind: 'main' };
    expect(main.input).toBe(0);
    expect(main.output).toBe(0);
    expect(main.cost).toBe(0);
    expect(main.durationMs).toBe(0);
  });

  it('passes hash fields through to main rows and subagent children', () => {
    const rows = buildStatRows([
      makeReq({
        id: 'r1',
        hashIds: ['a', 'b'],
        hashTokenCount: 128,
      }),
      makeReq({
        id: 'h1',
        model: 'claude-haiku-4-5-20251001',
        hashIds: ['c'],
        hashTokenCount: 64,
      }),
    ]);

    const main = rows[0] as StatRow & { kind: 'main' };
    expect(main.hashIds).toEqual(['a', 'b']);
    expect(main.hashTokenCount).toBe(128);

    const group = rows[1] as StatRow & { kind: 'subagent_group' };
    expect(group.children[0].hashIds).toEqual(['c']);
    expect(group.children[0].hashTokenCount).toBe(64);
  });
});
