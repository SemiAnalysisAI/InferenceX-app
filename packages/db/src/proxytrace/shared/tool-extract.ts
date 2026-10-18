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

// Pre-extracts the `tool_use` and `tool_result` blocks from a recorded
// request/response pair AND pre-classifies them — `verification_kind` for
// Bash commands, pass/fail/unknown `status` for tool_results. The rows
// written into `request_stats` carry only the compact classified values,
// so the dashboard queries never have to ship raw commands or 8KB content
// blobs back to the app server.
//
// Keep the shapes in sync with the backfill in
// packages/db/migrations/017_classify_stats.ts — both populate the same
// columns from historical rows.

export interface ToolUseEvent {
  ordinality: number;
  id: string | null;
  name: string | null;
  verification_kind?: VerificationKind | null;
  // First command-position binary — kept for legacy rows and single-turn
  // timing attribution.
  command_binary?: string | null;
  // Every command-position binary in order, occurrences kept (pipes, &&/||
  // chains, substitutions, wrappers). Present only for compound commands
  // (length > 1) — single-binary rows fall back to command_binary in the
  // tool-timings query, so storing a one-element copy would be pure bloat.
  command_binaries?: string[];
  // Allowlisted verification binaries found outside shell command positions,
  // such as pytest in `uv run pytest`. Kept separate so command_binaries
  // preserves its ordered lexical meaning.
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
