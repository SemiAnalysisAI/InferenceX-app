import {
  classifyCommand,
  classifyResult,
  extractAdditionalBinaries,
  extractBashCommand,
  extractCommandBinaries,
  toolResultContentToText,
  type VerificationKind,
  type VerificationStatus,
} from './tool-classifiers';

export interface ToolUseEvent {
  ordinality: number;
  id: string | null;
  name: string | null;
  verification_kind?: VerificationKind | null;
  command_binary?: string | null;
  command_binaries?: string[];
  additional_binaries?: string[];
}

export interface ToolResultEvent {
  content_ordinality: number;
  tool_use_id: string | null;
  is_error: boolean;
  status: VerificationStatus;
}

export interface RequestStats {
  toolUses: ToolUseEvent[];
  toolResults: ToolResultEvent[];
}

export function extractRequestStats(requestBody: unknown, responseBody: unknown): RequestStats {
  return {
    toolUses: extractToolUses(responseBody),
    toolResults: extractToolResults(requestBody),
  };
}

export function extractToolUses(responseBody: unknown): ToolUseEvent[] {
  const content = pickContentArray(responseBody);
  if (!content) return [];

  const out: ToolUseEvent[] = [];
  for (let i = 0; i < content.length; i++) {
    const elem = content[i];
    if (!isObject(elem) || elem.type !== 'tool_use') continue;

    const name = typeof elem.name === 'string' ? elem.name : null;
    const event: ToolUseEvent = {
      ordinality: i + 1,
      id: typeof elem.id === 'string' ? elem.id : null,
      name,
    };
    if (name === 'Bash') {
      const cmd = extractBashCommand(elem.input);
      event.verification_kind = classifyCommand(cmd);
      const binaries = extractCommandBinaries(cmd);
      event.command_binary = binaries[0] ?? null;
      if (binaries.length > 1) event.command_binaries = binaries;
      const additionalBinaries = extractAdditionalBinaries(cmd, binaries);
      if (additionalBinaries.length > 0) event.additional_binaries = additionalBinaries;
    }
    out.push(event);
  }
  return out;
}

export function extractToolResults(requestBody: unknown): ToolResultEvent[] {
  if (!isObject(requestBody)) return [];
  const messages = requestBody.messages;
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const last = messages.at(-1);
  if (!isObject(last) || last.role !== 'user' || !Array.isArray(last.content)) return [];

  const out: ToolResultEvent[] = [];
  for (let i = 0; i < last.content.length; i++) {
    const elem = last.content[i];
    if (!isObject(elem) || elem.type !== 'tool_result') continue;

    const isErrorFlag = elem.is_error === true ? true : elem.is_error === false ? false : null;
    out.push({
      content_ordinality: i + 1,
      tool_use_id: typeof elem.tool_use_id === 'string' ? elem.tool_use_id : null,
      is_error: isErrorFlag === true,
      status: classifyResult(isErrorFlag, toolResultContentToText(elem.content)),
    });
  }
  return out;
}

function pickContentArray(responseBody: unknown): unknown[] | null {
  if (!isObject(responseBody)) return null;
  const envelope = isObject(responseBody.body) ? responseBody.body : responseBody;
  if (!isObject(envelope)) return null;
  return Array.isArray(envelope.content) ? envelope.content : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
