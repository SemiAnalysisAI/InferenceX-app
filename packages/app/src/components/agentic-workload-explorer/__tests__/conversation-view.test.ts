import { describe, expect, it } from 'vitest';
import {
  buildConversationTree,
  type MessageNode,
} from '@/components/agentic-workload-explorer/conversation-view';

type ConversationRequest = Parameters<typeof buildConversationTree>[0][number];

function makeRequest(id: string): ConversationRequest {
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
  };
}

describe('buildConversationTree', () => {
  it('marks exactly one stable anchor message per request', () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const messages = buildConversationTree([makeRequest(requestId)]) as MessageNode[];

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.requestId)).toEqual([requestId, requestId]);
    expect(messages.map((message) => message.isRequestAnchor ?? false)).toEqual([true, false]);
  });
});
