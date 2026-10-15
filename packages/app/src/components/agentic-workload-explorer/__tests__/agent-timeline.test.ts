import { describe, it, expect } from 'vitest';
import {
  buildTimelineRows,
  getAgentColor,
  getToolColor,
  getDominantTool,
  formatTickLabel,
} from '@/components/agentic-workload-explorer/agent-timeline';
import type { SessionRequest } from '@/lib/agentic-workload-explorer/session-context';

function makeSessionRequest(overrides: Partial<SessionRequest> = {}): SessionRequest {
  return {
    id: 'req-1',
    timestamp: '2025-01-01T00:00:00Z',
    method: 'POST',
    endpoint: '/v1/messages',
    model: 'claude-sonnet-4-20250514',
    requestBody: null,
    responseBody: null,
    responseStatusCode: 200,
    inputTokens: 10,
    outputTokens: 5,
    cacheWriteTokens: null,
    cacheReadInputTokens: null,
    durationMs: 100,
    ttftMs: null,
    tpotMs: null,
    isStreaming: false,
    isFastMode: false,
    hashIds: null,
    hashTokenCount: null,
    privacyMode: 'anon',
    subagentLabel: null,
    costUsd: null,
    error: null,
    metadata: null,
    requestHeaders: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getAgentColor
// ---------------------------------------------------------------------------

describe('getAgentColor', () => {
  it('returns mapped color for known agents', () => {
    expect(getAgentColor('Main')).toBe('#6b7280');
    expect(getAgentColor('Explore Agent')).toBe('#0ea5e9');
    expect(getAgentColor('Plan Agent')).toBe('#f59e0b');
  });

  it('returns default color for unknown agent', () => {
    expect(getAgentColor('Unknown Agent')).toBe('#ec4899');
  });
});

// ---------------------------------------------------------------------------
// getToolColor
// ---------------------------------------------------------------------------

describe('getToolColor', () => {
  it('returns mapped color for known tools', () => {
    expect(getToolColor('Bash')).toBe('#8b5cf6');
    expect(getToolColor('Read')).toBe('#0ea5e9');
    expect(getToolColor('Edit')).toBe('#10b981');
    expect(getToolColor('Write')).toBe('#f59e0b');
  });

  it('returns default color for unknown tool', () => {
    expect(getToolColor('SomeCustomTool')).toBe('#ec4899');
  });

  it('returns assistant color', () => {
    expect(getToolColor('assistant')).toBe('#6b7280');
  });

  it('returns thinking color', () => {
    expect(getToolColor('thinking')).toBe('#eab308');
  });
});

// ---------------------------------------------------------------------------
// getDominantTool
// ---------------------------------------------------------------------------

describe('getDominantTool', () => {
  it('returns tool name from Anthropic tool_use block', () => {
    const req = makeSessionRequest({
      responseBody: {
        body: {
          content: [
            { type: 'text', text: 'I will read the file' },
            { type: 'tool_use', name: 'Read', id: 't1', input: {} },
          ],
        },
      },
    });
    expect(getDominantTool(req)).toBe('Read');
  });

  it('returns thinking when only thinking blocks (no text)', () => {
    const req = makeSessionRequest({
      responseBody: {
        body: {
          content: [{ type: 'thinking', thinking: 'Let me think...' }],
        },
      },
    });
    expect(getDominantTool(req)).toBe('thinking');
  });

  it('returns assistant when thinking + text blocks', () => {
    const req = makeSessionRequest({
      responseBody: {
        body: {
          content: [
            { type: 'thinking', thinking: 'Hmm' },
            { type: 'text', text: 'Here is the answer' },
          ],
        },
      },
    });
    expect(getDominantTool(req)).toBe('assistant');
  });

  it('returns assistant for text-only response', () => {
    const req = makeSessionRequest({
      responseBody: {
        body: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    });
    expect(getDominantTool(req)).toBe('assistant');
  });

  it('returns assistant for empty content array', () => {
    const req = makeSessionRequest({
      responseBody: { body: { content: [] } },
    });
    expect(getDominantTool(req)).toBe('assistant');
  });

  it('returns assistant for null responseBody', () => {
    const req = makeSessionRequest({ responseBody: null });
    expect(getDominantTool(req)).toBe('assistant');
  });

  it('returns assistant for responseBody with no body', () => {
    const req = makeSessionRequest({ responseBody: {} });
    expect(getDominantTool(req)).toBe('assistant');
  });
});

// ---------------------------------------------------------------------------
// formatTickLabel
// ---------------------------------------------------------------------------

describe('formatTickLabel', () => {
  it('formats sub-second as ms', () => {
    expect(formatTickLabel(0)).toBe('+0ms');
    expect(formatTickLabel(500)).toBe('+500ms');
    expect(formatTickLabel(999)).toBe('+999ms');
  });

  it('formats seconds with 1 decimal under 10s', () => {
    expect(formatTickLabel(1000)).toBe('+1.0s');
    expect(formatTickLabel(5500)).toBe('+5.5s');
    expect(formatTickLabel(9999)).toBe('+10.0s');
  });

  it('formats seconds with 0 decimals at 10s+', () => {
    expect(formatTickLabel(10000)).toBe('+10s');
    expect(formatTickLabel(30000)).toBe('+30s');
  });

  it('formats minutes', () => {
    expect(formatTickLabel(60000)).toBe('+1.0m');
    expect(formatTickLabel(90000)).toBe('+1.5m');
    expect(formatTickLabel(120000)).toBe('+2.0m');
  });
});

// ---------------------------------------------------------------------------
// buildTimelineRows
// ---------------------------------------------------------------------------

describe('buildTimelineRows', () => {
  it('splits parallel Codex subagents into separate timeline rows', () => {
    const { rows } = buildTimelineRows([
      makeSessionRequest({
        id: 'codex-a',
        timestamp: '2025-01-01T00:00:01Z',
        subagentLabel: 'Codex Subagent',
        requestHeaders: {
          sessionId: 'parent-thread',
          threadId: 'child-thread-11111111',
          'x-codex-parent-thread-id': 'parent-thread',
        },
      }),
      makeSessionRequest({
        id: 'codex-b',
        timestamp: '2025-01-01T00:00:02Z',
        subagentLabel: 'Codex Subagent',
        requestHeaders: {
          sessionId: 'parent-thread',
          threadId: 'child-thread-22222222',
          'x-codex-parent-thread-id': 'parent-thread',
        },
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.label)).toEqual([
      'Codex Subagent · 11111111 #1',
      'Codex Subagent · 22222222 #1',
    ]);
    expect(rows.map((row) => row.bars.map((bar) => bar.requestId))).toEqual([
      ['codex-a'],
      ['codex-b'],
    ]);
  });
});
