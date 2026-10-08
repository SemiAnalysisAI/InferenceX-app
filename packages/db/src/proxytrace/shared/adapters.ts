export interface ContentBlock {
  type: string;
  text?: string | null;
  id?: string;
  name?: string;
  input?: Record<string, unknown> | null;
  content?: string | ContentBlock[];
  tool_use_id?: string | null;
  is_error?: boolean;
  thinking?: string | null;
}

export interface DashboardTraceLike {
  requestBody: Record<string, unknown> | null;
  responseBody: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

type OpenAIResponsesItem = Record<string, unknown>;

const OPENAI_RESPONSES_BUILTIN_TOOL_TYPES = new Set([
  'web_search_call',
  'file_search_call',
  'code_interpreter_call',
  'computer_use_call',
  'image_generation_call',
  'local_shell_call',
  'custom_tool_call',
  'mcp_call',
]);

function safeCallId(it: OpenAIResponsesItem): string {
  if (typeof it.call_id === 'string' && it.call_id.length > 0) return it.call_id;
  if (typeof it.id === 'string' && it.id.length > 0) return it.id;
  return '';
}

function openaiOutputToContent(output: unknown): ContentBlock[] {
  if (!Array.isArray(output)) return [];
  const blocks: ContentBlock[] = [];
  for (const raw of output) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as OpenAIResponsesItem;
    if (it.type === 'message' && Array.isArray(it.content)) {
      for (const c of it.content as OpenAIResponsesItem[]) {
        if (c?.type !== 'output_text') continue;
        // Pass through null text (anon-stripped) so downstream rendering can
        // emit a "[content stripped]" placeholder instead of dropping the
        // assistant turn entirely.
        if (typeof c.text === 'string') {
          blocks.push({ type: 'text', text: c.text });
        } else if (c.text === null) {
          blocks.push({ type: 'text', text: null });
        }
      }
    } else if (it.type === 'function_call') {
      let input: Record<string, unknown>;
      try {
        input =
          typeof it.arguments === 'string'
            ? (JSON.parse(it.arguments) as Record<string, unknown>)
            : ((it.arguments as Record<string, unknown> | undefined) ?? {});
      } catch {
        input = { _raw: it.arguments };
      }
      blocks.push({
        type: 'tool_use',
        id: safeCallId(it),
        name: typeof it.name === 'string' ? it.name : 'unknown',
        input,
      });
    } else if (it.type === 'reasoning') {
      const summary = Array.isArray(it.summary) ? (it.summary as OpenAIResponsesItem[]) : [];
      const summaryText = summary
        .filter((s) => s?.type === 'summary_text' && typeof s.text === 'string')
        .map((s) => s.text as string)
        .join('\n');
      const contentText = Array.isArray(it.content)
        ? (it.content as OpenAIResponsesItem[])
            .filter((c) => c?.type === 'reasoning_text' && typeof c.text === 'string')
            .map((c) => c.text as string)
            .join('\n')
        : '';
      const text = summaryText || contentText;
      if (text) blocks.push({ type: 'thinking', thinking: text });
    } else if (typeof it.type === 'string' && OPENAI_RESPONSES_BUILTIN_TOOL_TYPES.has(it.type)) {
      blocks.push({
        type: 'tool_use',
        id: safeCallId(it),
        name: it.type,
        input: raw as Record<string, unknown>,
      });
    }
  }
  return blocks;
}

function openaiInputToMessages(
  input: unknown,
): { role: string; content: ContentBlock[] | string }[] {
  if (!Array.isArray(input)) return [];
  const msgs: { role: string; content: ContentBlock[] | string }[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as OpenAIResponsesItem;
    if (it.type === 'message' && typeof it.role === 'string' && Array.isArray(it.content)) {
      const texts: ContentBlock[] = [];
      for (const c of it.content as OpenAIResponsesItem[]) {
        if (c?.type !== 'input_text') continue;
        // Pass through anon-stripped null text — extractTextFromContent in
        // conversation-view renders it as "[content stripped]" so the user
        // turn still appears, just placeholdered.
        if (typeof c.text === 'string') {
          texts.push({ type: 'text', text: c.text });
        } else if (c.text === null) {
          texts.push({ type: 'text', text: null });
        }
      }
      if (texts.length > 0) msgs.push({ role: it.role, content: texts });
    } else if (typeof it.type === 'string' && it.type.endsWith('_call_output')) {
      let content: string | ContentBlock[];
      if (typeof it.output === 'string') {
        content = it.output;
      } else if (Array.isArray(it.output)) {
        content = it.output as ContentBlock[];
      } else if (it.output === null) {
        // anon-stripped tool result
        content = '[content stripped]';
      } else {
        continue;
      }
      msgs.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: safeCallId(it),
            content,
          },
        ],
      });
    }
  }
  return msgs;
}

export function normalizeOpenAIResponsesTrace<T extends DashboardTraceLike>(trace: T): T {
  const rb = trace.requestBody;
  const resBody = trace.responseBody?.body as
    | { output?: unknown; status?: unknown; content?: unknown }
    | undefined;

  const isResponsesRequest = rb && Array.isArray(rb.input);
  const isResponsesResponse = resBody && Array.isArray(resBody.output);
  if (!isResponsesRequest && !isResponsesResponse) return trace;

  const next: T = { ...trace };

  if (isResponsesRequest && rb) {
    const messages = openaiInputToMessages(rb.input);
    const instructions = typeof rb.instructions === 'string' ? rb.instructions : null;
    next.requestBody = {
      ...rb,
      messages,
      system: instructions ? [{ type: 'text', text: instructions }] : undefined,
    };
  }

  if (isResponsesResponse && resBody) {
    const content = openaiOutputToContent(resBody.output);
    const stopReason =
      typeof resBody.status === 'string' && resBody.status !== 'completed'
        ? resBody.status
        : 'end_turn';
    next.responseBody = {
      ...trace.responseBody,
      body: {
        ...(resBody as Record<string, unknown>),
        content,
        stop_reason: stopReason,
      },
    };
  }

  return next;
}

export function normalizeDashboardTrace<T extends DashboardTraceLike>(trace: T): T {
  const provider = trace.metadata?.provider;
  if (provider === 'openai') return normalizeOpenAIResponsesTrace(trace);

  // Historical rows written before provider metadata can still be recognized
  // by the Responses API body shape.
  if (trace.requestBody && Array.isArray(trace.requestBody.input))
    return normalizeOpenAIResponsesTrace(trace);
  const body = trace.responseBody?.body as Record<string, unknown> | undefined;
  if (body && Array.isArray(body.output)) return normalizeOpenAIResponsesTrace(trace);

  return trace;
}
