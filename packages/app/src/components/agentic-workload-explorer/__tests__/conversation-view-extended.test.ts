import { describe, it, expect } from 'vitest';
import {
  buildConversationTree,
  type MessageNode,
  type SubagentGroupNode,
} from '@/components/agentic-workload-explorer/conversation-view';

type ConversationRequest = Parameters<typeof buildConversationTree>[0][number];

function makeRequest(
  id: string,
  overrides: Partial<ConversationRequest> = {},
): ConversationRequest {
  return {
    id,
    timestamp: '2025-01-01T00:00:00Z',
    model: 'claude-sonnet-4-20250514',
    requestBody: {
      messages: [{ role: 'user', content: 'Hello' }],
    },
    responseBody: {
      body: {
        content: [{ type: 'text', text: 'Hi there' }],
        stop_reason: 'end_turn',
      },
    },
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
    subagentLabel: null,
    costUsd: null,
    error: null,
    requestHeaders: null,
    metadata: null,
    ...overrides,
  };
}

describe('buildConversationTree — extended', () => {
  it('returns empty array for empty input', () => {
    expect(buildConversationTree([])).toEqual([]);
  });

  // -- Anthropic response content blocks --

  it('creates thinking node from thinking block', () => {
    const req = makeRequest('t1', {
      responseBody: {
        body: {
          content: [
            { type: 'thinking', thinking: 'Let me think about this...' },
            { type: 'text', text: 'Answer' },
          ],
          stop_reason: 'end_turn',
        },
      },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const thinking = nodes.find((n) => n.type === 'thinking');
    expect(thinking).toBeDefined();
    expect(thinking!.content).toBe('Let me think about this...');
  });

  it('creates tool_use node with name and id', () => {
    const req = makeRequest('t2', {
      responseBody: {
        body: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-1',
              input: { file_path: '/src/index.ts' },
            },
          ],
          stop_reason: 'tool_use',
        },
      },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const toolUse = nodes.find((n) => n.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse!.toolName).toBe('Read');
    expect(toolUse!.toolId).toBe('tool-1');
    expect(toolUse!.toolInput).toEqual({ file_path: '/src/index.ts' });
    expect(toolUse!.stopReason).toBe('tool_use');
  });

  it('creates multiple nodes for thinking + text + tool_use response', () => {
    const req = makeRequest('t3', {
      responseBody: {
        body: {
          content: [
            { type: 'thinking', thinking: 'Hmm' },
            { type: 'text', text: 'I will read the file' },
            { type: 'tool_use', name: 'Read', id: 'r1', input: { file_path: '/a.ts' } },
          ],
          stop_reason: 'tool_use',
        },
      },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const types = nodes.map((n) => n.type);
    expect(types).toContain('user');
    expect(types).toContain('thinking');
    expect(types).toContain('assistant');
    expect(types).toContain('tool_use');
  });

  it('handles empty response content array', () => {
    const req = makeRequest('t4', {
      responseBody: { body: { content: [], stop_reason: 'end_turn' } },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    // Only user node, no response nodes
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('user');
  });

  it('handles null response body', () => {
    const req = makeRequest('t5', { responseBody: null });
    const nodes = buildConversationTree([req]) as MessageNode[];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('user');
  });

  // -- Anonymized / stripped content --

  it('shows [content stripped] for all-null text blocks', () => {
    const req = makeRequest('anon1', {
      requestBody: {
        messages: [{ role: 'user', content: [{ type: 'text', text: null }] as never }],
      },
      responseBody: {
        body: {
          content: [{ type: 'text', text: null }] as never,
          stop_reason: 'end_turn',
        },
      },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const user = nodes.find((n) => n.type === 'user');
    expect(user!.content).toBe('[content stripped]');
  });

  // -- Stop reason --

  it('passes through Anthropic stop_reason', () => {
    const req = makeRequest('sr1');
    const nodes = buildConversationTree([req]) as MessageNode[];
    const assistant = nodes.find((n) => n.type === 'assistant');
    expect(assistant!.stopReason).toBe('end_turn');
  });

  // -- Request context --

  it('attaches requestContext to first node', () => {
    const req = makeRequest('ctx1', {
      requestBody: {
        messages: [{ role: 'user', content: 'Hi' }],
        system: [{ type: 'text', text: 'You are helpful' }],
        tools: [{ name: 'Read' }],
      },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    expect(nodes[0].requestContext).toBeDefined();
    expect(nodes[0].requestContext!.messageCount).toBe(1);
    expect(nodes[0].requestContext!.system).toHaveLength(1);
    expect(nodes[0].requestContext!.tools).toHaveLength(1);
  });

  // -- Fast mode --

  it('detects fast mode from request headers', () => {
    const req = makeRequest('fm1', {
      requestHeaders: { 'anthropic-beta': 'fast-mode-2026-02-01' },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    expect(nodes[0].fastMode).toBe(true);
  });

  it('sets fastMode false when no fast-mode header', () => {
    const req = makeRequest('fm2', { requestHeaders: null });
    const nodes = buildConversationTree([req]) as MessageNode[];
    expect(nodes[0].fastMode).toBe(false);
  });

  // -- System reminder stripping --

  it('strips system reminders from user messages', () => {
    const req = makeRequest('sys1', {
      requestBody: {
        messages: [{ role: 'user', content: 'Question<system-reminder>hidden</system-reminder>' }],
      },
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const user = nodes.find((n) => n.type === 'user');
    expect(user!.content).toBe('Question');
  });

  // -- Subagent grouping --

  it('groups subagent requests into SubagentGroupNode', () => {
    const sub = makeRequest('sub1', {
      requestBody: {
        system: [
          {
            type: 'text',
            text: 'You are a file search specialist for a READ-ONLY exploration task',
          },
        ],
        messages: [{ role: 'user', content: 'Find files' }],
      },
    });
    const nodes = buildConversationTree([sub]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('subagent_group');
  });

  it('detects Haiku model as subagent', () => {
    const sub = makeRequest('haiku1', {
      model: 'claude-haiku-4-5-20251001',
      requestBody: {
        messages: [{ role: 'user', content: 'Quick task' }],
        max_tokens: 4096,
      },
    });
    const nodes = buildConversationTree([sub]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('subagent_group');
    expect((nodes[0] as SubagentGroupNode).label).toBe('Subagent (Haiku)');
  });

  it('treats Haiku with max_tokens=1 as main (test ping)', () => {
    const ping = makeRequest('ping1', {
      model: 'claude-haiku-4-5-20251001',
      requestBody: {
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      },
    });
    const nodes = buildConversationTree([ping]);
    expect(nodes[0].kind).toBe('message');
  });

  it('emits one subagent group per distinct (label, threadId) pair', () => {
    const explore = makeRequest('exp1', {
      timestamp: '2025-01-01T00:00:01Z',
      requestBody: {
        system: [{ type: 'text', text: 'You are a file search specialist' }],
        messages: [{ role: 'user', content: 'Explore' }],
      },
    });
    const plan = makeRequest('plan1', {
      timestamp: '2025-01-01T00:00:02Z',
      requestBody: {
        system: [
          {
            type: 'text',
            text: 'You are a software architect for this project',
          },
        ],
        messages: [{ role: 'user', content: 'Plan' }],
      },
    });
    const nodes = buildConversationTree([explore, plan]);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.kind === 'subagent_group')).toBe(true);
  });

  it('splits parallel Codex subagents by threadId', () => {
    const first = makeRequest('codex1', {
      timestamp: '2025-01-01T00:00:01Z',
      subagentLabel: 'Codex Subagent',
      requestHeaders: {
        sessionId: 'parent-thread',
        threadId: 'child-thread-11111111',
        'x-codex-parent-thread-id': 'parent-thread',
        'x-codex-window-id': 'child-thread-11111111:0',
      },
    });
    const second = makeRequest('codex2', {
      timestamp: '2025-01-01T00:00:02Z',
      subagentLabel: 'Codex Subagent',
      requestHeaders: {
        sessionId: 'parent-thread',
        threadId: 'child-thread-22222222',
        'x-codex-parent-thread-id': 'parent-thread',
        'x-codex-window-id': 'child-thread-22222222:0',
      },
    });

    const nodes = buildConversationTree([first, second]);

    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.kind === 'subagent_group')).toBe(true);
    expect((nodes[0] as SubagentGroupNode).label).toBe('Codex Subagent · 11111111');
    expect((nodes[1] as SubagentGroupNode).label).toBe('Codex Subagent · 22222222');
  });

  it('falls back to Codex x-codex-window-id without using the window generation', () => {
    const first = makeRequest('codex-window1', {
      timestamp: '2025-01-01T00:00:01Z',
      subagentLabel: 'Codex Subagent',
      requestHeaders: {
        sessionId: 'parent-thread',
        'x-codex-window-id': 'child-thread-11111111:0',
      },
    });
    const second = makeRequest('codex-window2', {
      timestamp: '2025-01-01T00:00:02Z',
      subagentLabel: 'Codex Subagent',
      requestHeaders: {
        sessionId: 'parent-thread',
        'x-codex-window-id': 'child-thread-22222222:1',
      },
    });

    const nodes = buildConversationTree([first, second]);

    expect(nodes).toHaveLength(2);
    expect((nodes[0] as SubagentGroupNode).label).toBe('Codex Subagent · 11111111');
    expect((nodes[1] as SubagentGroupNode).label).toBe('Codex Subagent · 22222222');
  });

  it('falls back to legacy Codex session_id when no thread header exists', () => {
    const first = makeRequest('legacy-codex1', {
      timestamp: '2025-01-01T00:00:01Z',
      subagentLabel: 'Codex Subagent',
      requestHeaders: { sessionId: 'legacy-child-11111111' },
    });
    const second = makeRequest('legacy-codex2', {
      timestamp: '2025-01-01T00:00:02Z',
      subagentLabel: 'Codex Subagent',
      requestHeaders: { sessionId: 'legacy-child-22222222' },
    });

    const nodes = buildConversationTree([first, second]);

    expect(nodes).toHaveLength(2);
    expect((nodes[0] as SubagentGroupNode).label).toBe('Codex Subagent · 11111111');
    expect((nodes[1] as SubagentGroupNode).label).toBe('Codex Subagent · 22222222');
  });

  it('aggregates subagent group totals', () => {
    const sub1 = makeRequest('agg1', {
      timestamp: '2025-01-01T00:00:01Z',
      model: 'claude-haiku-4-5-20251001',
      requestBody: { messages: [{ role: 'user', content: 'Task 1' }], max_tokens: 4096 },
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 200,
      costUsd: 0.01,
    });
    const sub2 = makeRequest('agg2', {
      timestamp: '2025-01-01T00:00:02Z',
      model: 'claude-haiku-4-5-20251001',
      requestBody: { messages: [{ role: 'user', content: 'Task 2' }], max_tokens: 4096 },
      inputTokens: 200,
      outputTokens: 100,
      durationMs: 300,
      costUsd: 0.02,
    });
    const nodes = buildConversationTree([sub1, sub2]);
    expect(nodes).toHaveLength(1);
    const group = nodes[0] as SubagentGroupNode;
    expect(group.totalInputTokens).toBe(300);
    expect(group.totalOutputTokens).toBe(150);
    expect(group.totalDurationMs).toBe(500);
    expect(group.totalCost).toBeCloseTo(0.03);
    expect(group.requestCount).toBe(2);
  });

  it('uses request duration to compute subagent group end time', () => {
    const sub = makeRequest('timed-subagent', {
      timestamp: '2025-01-01T00:00:01Z',
      model: 'claude-haiku-4-5-20251001',
      requestBody: { messages: [{ role: 'user', content: 'Task' }], max_tokens: 4096 },
      durationMs: 125_000,
    });

    const group = buildConversationTree([sub])[0] as SubagentGroupNode;

    expect(group.startTime).toBe('2025-01-01T00:00:01Z');
    expect(group.endTime).toBe('2025-01-01T00:02:06.000Z');
  });

  it('handles mixed main -> subagent -> main sequence', () => {
    const main1 = makeRequest('m1', { timestamp: '2025-01-01T00:00:01Z' });
    const sub = makeRequest('s1', {
      timestamp: '2025-01-01T00:00:02Z',
      model: 'claude-haiku-4-5-20251001',
      requestBody: { messages: [{ role: 'user', content: 'Sub task' }], max_tokens: 4096 },
    });
    const main2 = makeRequest('m2', { timestamp: '2025-01-01T00:00:03Z' });
    const nodes = buildConversationTree([main1, sub, main2]);
    expect(nodes[0].kind).toBe('message'); // main1 user
    // Find subagent group
    const groupIdx = nodes.findIndex((n) => n.kind === 'subagent_group');
    expect(groupIdx).toBeGreaterThan(0);
    // Find main2 messages after the group
    const afterGroup = nodes.slice(groupIdx + 1);
    expect(afterGroup.some((n) => n.kind === 'message')).toBe(true);
  });

  // -- No messages and no input --

  it('returns empty nodes when request has no messages and no input', () => {
    const req = makeRequest('empty1', {
      requestBody: { messages: undefined } as never,
    });
    const nodes = buildConversationTree([req]);
    expect(nodes).toHaveLength(0);
  });

  // -- Cost and hash passthrough --

  it('passes costUsd and hashIds through to nodes', () => {
    const req = makeRequest('pass1', {
      costUsd: 0.123,
      hashIds: ['abc', 'def'],
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const assistant = nodes.find((n) => n.type === 'assistant');
    expect(assistant!.costUsd).toBe(0.123);
    expect(assistant!.hashIds).toEqual(['abc', 'def']);
  });
});
