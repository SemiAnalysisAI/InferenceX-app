import { describe, it, expect } from 'vitest';
import {
  truncate,
  tokenSummary,
  formatCost,
  messageNodeSummary,
  getToolArg,
  subagentSummary,
} from '@/components/agentic-workload-explorer/session-dag';
import type {
  MessageNode,
  SubagentGroupNode,
} from '@/components/agentic-workload-explorer/conversation-view';

function makeNode(overrides: Partial<MessageNode> = {}): MessageNode {
  return {
    kind: 'message',
    id: 'test-1',
    requestId: 'req-1',
    timestamp: '2025-01-01T00:00:00Z',
    model: 'claude-sonnet-4-20250514',
    durationMs: 100,
    inputTokens: 10,
    outputTokens: 5,
    cacheWriteTokens: null,
    cacheReadInputTokens: null,
    ttftMs: null,
    tpotMs: null,
    fastMode: false,
    is1mContext: false,
    processors: null,
    costUsd: null,
    hashIds: null,
    type: 'assistant',
    content: 'test content',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {
  it('returns [stripped] for null', () => {
    expect(truncate(null, 10)).toBe('[stripped]');
  });

  it('returns String for non-string input', () => {
    expect(truncate(42, 10)).toBe('42');
  });

  it('returns empty string for undefined', () => {
    expect(truncate(undefined, 10)).toBe('');
  });

  it('returns trimmed string when under max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis when over max', () => {
    expect(truncate('this is a very long string', 10)).toBe('this is a ...');
  });

  it('returns string at exact max length', () => {
    expect(truncate('1234567890', 10)).toBe('1234567890');
  });

  it('replaces newlines with spaces', () => {
    expect(truncate('line1\nline2\nline3', 50)).toBe('line1 line2 line3');
  });

  it('trims whitespace', () => {
    expect(truncate('  hello  ', 10)).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// tokenSummary
// ---------------------------------------------------------------------------

describe('tokenSummary', () => {
  it('returns empty string when all null', () => {
    expect(tokenSummary(null, null, null, null)).toBe('');
  });

  it('returns empty string when all zero', () => {
    expect(tokenSummary(0, 0, 0, 0)).toBe('');
  });

  it('shows only input when others are null', () => {
    expect(tokenSummary(100, null, null, null)).toBe('100 in');
  });

  it('shows only output when others are null', () => {
    expect(tokenSummary(null, null, null, 50)).toBe('50 out');
  });

  it('shows all parts when all present', () => {
    const result = tokenSummary(100, 200, 50, 30);
    expect(result).toBe('100 in \u00B7 200 cr \u00B7 50 cw \u00B7 30 out');
  });

  it('omits zero values', () => {
    expect(tokenSummary(100, 0, 0, 50)).toBe('100 in \u00B7 50 out');
  });

  it('formats large numbers', () => {
    const result = tokenSummary(1500, null, null, null);
    expect(result).toBe('1.5K in');
  });
});

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe('formatCost', () => {
  it('returns <$0.01 for small costs', () => {
    expect(formatCost(0.005)).toBe('<$0.01');
    expect(formatCost(0)).toBe('<$0.01');
  });

  it('formats costs >= 0.01', () => {
    expect(formatCost(0.01)).toBe('$0.010');
    expect(formatCost(1.234)).toBe('$1.234');
  });

  it('rounds to 3 decimal places', () => {
    expect(formatCost(0.12345)).toBe('$0.123');
  });
});

// ---------------------------------------------------------------------------
// messageNodeSummary
// ---------------------------------------------------------------------------

describe('messageNodeSummary', () => {
  it('truncates user content at 60 chars', () => {
    const node = makeNode({ type: 'user', content: 'short' });
    expect(messageNodeSummary(node)).toBe('short');
  });

  it('shows token count for assistant with outputTokens', () => {
    const node = makeNode({ type: 'assistant', outputTokens: 1500 });
    expect(messageNodeSummary(node)).toBe('Response \u00B7 1.5K tok');
  });

  it('shows just Response for assistant without outputTokens', () => {
    const node = makeNode({ type: 'assistant', outputTokens: null });
    expect(messageNodeSummary(node)).toBe('Response');
  });

  it('shows tool name for tool_use', () => {
    const node = makeNode({ type: 'tool_use', content: '', toolName: 'Read' });
    expect(messageNodeSummary(node)).toBe('Read');
  });

  it('shows Tool Call when no toolName', () => {
    const node = makeNode({ type: 'tool_use', content: '', toolName: undefined });
    expect(messageNodeSummary(node)).toBe('Tool Call');
  });

  it('shows Result for tool_result', () => {
    const node = makeNode({ type: 'tool_result' as never, content: '' });
    expect(messageNodeSummary(node)).toBe('Result');
  });

  it('shows Result (error) for errored tool_result', () => {
    const node = makeNode({ type: 'tool_result' as never, content: '', isError: true });
    expect(messageNodeSummary(node)).toBe('Result (error)');
  });

  it('shows char count for thinking', () => {
    const node = makeNode({ type: 'thinking', content: 'Let me think about this' });
    expect(messageNodeSummary(node)).toBe('Thinking \u00B7 23 chars');
  });
});

// ---------------------------------------------------------------------------
// getToolArg
// ---------------------------------------------------------------------------

describe('getToolArg', () => {
  it('returns empty string when no toolInput', () => {
    const node = makeNode({ toolInput: undefined });
    expect(getToolArg(node)).toBe('');
  });

  it('extracts filename from file_path', () => {
    const node = makeNode({ toolInput: { file_path: '/src/lib/proxy.ts' } });
    expect(getToolArg(node)).toBe(' \u00B7 proxy.ts');
  });

  it('truncates command', () => {
    const node = makeNode({ toolInput: { command: 'npm run test --verbose' } });
    const result = getToolArg(node);
    expect(result).toContain('\u00B7');
    expect(result).toContain('npm run test');
  });

  it('quotes pattern', () => {
    const node = makeNode({ toolInput: { pattern: 'TODO' } });
    expect(getToolArg(node)).toBe(' \u00B7 "TODO"');
  });

  it('returns empty string for unknown input keys', () => {
    const node = makeNode({ toolInput: { unknown_key: 'value' } });
    expect(getToolArg(node)).toBe('');
  });

  it('prefers file_path over command', () => {
    const node = makeNode({
      toolInput: { file_path: '/a.ts', command: 'echo hi' },
    });
    expect(getToolArg(node)).toBe(' \u00B7 a.ts');
  });
});

// ---------------------------------------------------------------------------
// subagentSummary
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<SubagentGroupNode> = {}): SubagentGroupNode {
  return {
    kind: 'subagent_group',
    id: 'g1',
    label: 'Explore Agent',
    startTime: '2025-01-01T00:00:00Z',
    endTime: '2025-01-01T00:00:10Z',
    totalDurationMs: 10000,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    totalCost: 0,
    requestCount: 1,
    children: [],
    ...overrides,
  };
}

describe('subagentSummary', () => {
  it('shows singular req for 1 request', () => {
    expect(subagentSummary(makeGroup({ requestCount: 1 }))).toBe('Explore Agent \u00B7 1 req');
  });

  it('shows plural reqs for multiple requests', () => {
    expect(subagentSummary(makeGroup({ requestCount: 3 }))).toBe('Explore Agent \u00B7 3 reqs');
  });

  it('includes cost when > 0', () => {
    const result = subagentSummary(makeGroup({ requestCount: 2, totalCost: 0.05 }));
    expect(result).toBe('Explore Agent \u00B7 2 reqs \u00B7 $0.050');
  });

  it('shows <$0.01 for small costs', () => {
    const result = subagentSummary(makeGroup({ requestCount: 1, totalCost: 0.005 }));
    expect(result).toBe('Explore Agent \u00B7 1 req \u00B7 <$0.01');
  });

  it('omits cost when zero', () => {
    const result = subagentSummary(makeGroup({ totalCost: 0 }));
    expect(result).not.toContain('$');
  });
});
