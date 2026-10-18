import { describe, expect, it } from 'vitest';
import {
  buildConversationTree,
  type MessageNode,
} from '@/components/agentic-workload-explorer/conversation-view';

type Req = Parameters<typeof buildConversationTree>[0][number];

function openaiResponsesRequest(overrides: Partial<Req> = {}): Req {
  return {
    id: 'openai-1',
    timestamp: '2026-04-24T00:00:00Z',
    model: 'gpt-5.4',
    requestBody: {
      // OpenAI Responses API uses `input[]`, not Anthropic's `messages[]`
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'what is 2+2?' }],
        },
      ],
      instructions: 'You are a careful assistant.',
      stream: true,
    } as unknown as Req['requestBody'],
    responseBody: {
      body: {
        id: 'resp_1',
        output: [
          {
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: 'simple arithmetic' }],
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '4' }],
          },
          {
            type: 'function_call',
            call_id: 'fc_1',
            name: 'calculator',
            arguments: '{"expr":"2+2"}',
          },
        ],
        status: 'completed',
      },
    } as unknown as Req['responseBody'],
    responseStatusCode: 200,
    inputTokens: 30,
    outputTokens: 10,
    cacheWriteTokens: null,
    cacheReadInputTokens: null,
    durationMs: 500,
    ttftMs: 120,
    tpotMs: 30,
    isStreaming: true,
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

describe('buildConversationTree — OpenAI Responses normalization', () => {
  it('renders OpenAI Responses user input as a user message', () => {
    const nodes = buildConversationTree([openaiResponsesRequest()]) as MessageNode[];
    const user = nodes.find((n) => n.type === 'user');
    expect(user).toBeDefined();
    expect(user!.content).toBe('what is 2+2?');
  });

  it('flattens OpenAI Responses output_text items into an assistant message', () => {
    const nodes = buildConversationTree([openaiResponsesRequest()]) as MessageNode[];
    const assistant = nodes.find((n) => n.type === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant!.content).toBe('4');
  });

  it('maps OpenAI Responses function_call items into tool_use nodes with parsed arguments', () => {
    const nodes = buildConversationTree([openaiResponsesRequest()]) as MessageNode[];
    const tool = nodes.find((n) => n.type === 'tool_use');
    expect(tool).toBeDefined();
    expect(tool!.toolName).toBe('calculator');
    expect(tool!.toolId).toBe('fc_1');
    expect(tool!.toolInput).toEqual({ expr: '2+2' });
  });

  it('maps OpenAI Responses reasoning summaries into thinking nodes', () => {
    const nodes = buildConversationTree([openaiResponsesRequest()]) as MessageNode[];
    const thinking = nodes.find((n) => n.type === 'thinking');
    expect(thinking).toBeDefined();
    expect(thinking!.content).toBe('simple arithmetic');
  });

  it('leaves Anthropic-shaped requests untouched', () => {
    const anthropic: Req = {
      ...openaiResponsesRequest(),
      requestBody: { messages: [{ role: 'user', content: 'hi' }] },
      responseBody: {
        body: { content: [{ type: 'text', text: 'hey' }], stop_reason: 'end_turn' },
      },
    };
    const nodes = buildConversationTree([anthropic]) as MessageNode[];
    expect(nodes.find((n) => n.type === 'user')!.content).toBe('hi');
    expect(nodes.find((n) => n.type === 'assistant')!.content).toBe('hey');
  });

  it('renders web_search_call / code_interpreter_call items as tool_use blocks', () => {
    const req = openaiResponsesRequest({
      responseBody: {
        body: {
          output: [
            { type: 'web_search_call', call_id: 'ws_1', query: 'latest news' },
            { type: 'code_interpreter_call', call_id: 'ci_1', code: 'print(2+2)' },
          ],
          status: 'completed',
        },
      } as unknown as Req['responseBody'],
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const tools = nodes.filter((n) => n.type === 'tool_use');
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.toolName)).toEqual(['web_search_call', 'code_interpreter_call']);
  });

  it('falls back to reasoning.content[].reasoning_text when summary is absent', () => {
    const req = openaiResponsesRequest({
      responseBody: {
        body: {
          output: [
            { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'chain of thought' }] },
          ],
          status: 'completed',
        },
      } as unknown as Req['responseBody'],
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const thinking = nodes.find((n) => n.type === 'thinking');
    expect(thinking?.content).toBe('chain of thought');
  });

  it('gracefully handles malformed function_call arguments', () => {
    const req = openaiResponsesRequest({
      responseBody: {
        body: {
          output: [
            {
              type: 'function_call',
              call_id: 'fc_1',
              name: 'bash',
              arguments: 'not json',
            },
          ],
          status: 'completed',
        },
      } as unknown as Req['responseBody'],
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const tool = nodes.find((n) => n.type === 'tool_use');
    expect(tool).toBeDefined();
    expect(tool!.toolName).toBe('bash');
    expect(tool!.toolInput).toEqual({ _raw: 'not json' });
  });

  it('preserves anon-stripped null-text input blocks so user message renders as [content stripped]', () => {
    const req = openaiResponsesRequest({
      requestBody: {
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: null },
              { type: 'input_text', text: null },
            ],
          },
        ],
      } as unknown as Req['requestBody'],
      responseBody: { body: { output: [], status: 'completed' } } as unknown as Req['responseBody'],
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const user = nodes.find((n) => n.type === 'user');
    expect(user).toBeDefined();
    expect(user!.content).toBe('[content stripped]');
  });

  it('emits a [content stripped] assistant node for anon-stripped output_text so stats still render', () => {
    const req = openaiResponsesRequest({
      requestBody: {
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'q' }],
          },
        ],
      } as unknown as Req['requestBody'],
      responseBody: {
        body: {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: null }],
            },
          ],
          status: 'completed',
        },
      } as unknown as Req['responseBody'],
    });
    const nodes = buildConversationTree([req]) as MessageNode[];
    const assistant = nodes.find((n) => n.type === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant!.content).toBe('[content stripped]');
    // Stats land on the only emitted assistant node so the row's cost/timing
    // line is rendered (see MessageRow's `inputTokens === null` early return).
    expect(assistant!.inputTokens).toBe(30);
    expect(assistant!.outputTokens).toBe(10);
    expect(assistant!.ttftMs).toBe(120);
  });
});
