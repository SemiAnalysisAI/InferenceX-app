import type { VerificationKind, VerificationStatus } from './tool-classifiers';

export type { VerificationKind, VerificationStatus };

export type SessionOutcome =
  | 'no_edit'
  | 'edited_unverified'
  | 'verified_pass'
  | 'fail_recovered'
  | 'fail_unrecovered'
  | 'ambiguous';

// Rows are produced by the analytics queries in operations.ts and
// consumed here by analyzeToolOutcomes. Classification fields
// (verification_kind, status) are pre-computed at ingest time by
// extractRequestStats and stored in request_stats.

export interface ToolUseRow {
  session_id: string;
  request_id: string;
  timestamp: Date | string;
  ordinality: number;
  tool_use_id: string | null;
  tool_name: string | null;
  verification_kind: VerificationKind | null;
  duration_ms: number | null;
  cost_usd: number | null;
}

export interface ToolResultRow {
  session_id: string;
  request_id: string;
  timestamp: Date | string;
  msg_ordinality: number;
  content_ordinality: number;
  tool_use_id: string | null;
  is_error: boolean | null;
  status: VerificationStatus;
}

export interface ToolErrorRate {
  tool_name: string;
  total_calls: number;
  matched_results: number;
  successes: number;
  errors: number;
  unknown: number;
  error_rate: number | null;
}

export interface VerificationByKind {
  kind: VerificationKind;
  attempts: number;
  after_edit_attempts: number;
  passes: number;
  failures: number;
  unknown: number;
  pass_rate: number | null;
  failure_rate: number | null;
}

export interface SessionOutcomeCount {
  outcome: SessionOutcome;
  count: number;
}

export interface VerificationSummary {
  sessions_analyzed: number;
  edited_sessions: number;
  no_edit_sessions: number;
  verified_edited_sessions: number;
  unverified_edited_sessions: number;
  verified_pass_sessions: number;
  fail_recovered_sessions: number;
  fail_unrecovered_sessions: number;
  ambiguous_sessions: number;
  verification_attempts: number;
  verification_attempts_after_edit: number;
  verification_passes: number;
  verification_failures: number;
  verification_unknown: number;
}

export interface ToolOutcomeAnalytics {
  toolErrorRates: ToolErrorRate[];
  verificationSummary: VerificationSummary;
  verificationByKind: VerificationByKind[];
  sessionOutcomeCounts: SessionOutcomeCount[];
}

interface ToolEvent {
  sessionId: string;
  requestId: string;
  timestampMs: number;
  toolUseId: string | null;
  toolName: string;
  verificationKind: VerificationKind | null;
  result: ToolResultRow | null;
}

interface VerificationEvent {
  sessionId: string;
  timestampMs: number;
  kind: VerificationKind;
  status: VerificationStatus;
}

const EDIT_TOOL_NAMES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

const OUTCOME_ORDER: SessionOutcome[] = [
  'verified_pass',
  'fail_recovered',
  'fail_unrecovered',
  'edited_unverified',
  'ambiguous',
  'no_edit',
];

const KIND_ORDER: VerificationKind[] = ['test', 'typecheck', 'lint', 'build', 'other'];

export function analyzeToolOutcomes(
  toolUses: ToolUseRow[],
  toolResults: ToolResultRow[],
  sessionIds: string[],
): ToolOutcomeAnalytics {
  const firstResultByToolUseId = buildFirstResultMap(toolResults);
  const toolStats = new Map<string, ToolErrorRate>();
  const events: ToolEvent[] = [];

  for (const use of sortedToolUses(toolUses)) {
    const toolName = use.tool_name || 'unknown';
    const result = use.tool_use_id ? firstResultByToolUseId.get(use.tool_use_id) || null : null;
    const stat = getToolStat(toolStats, toolName);
    stat.total_calls += 1;

    if (result) {
      stat.matched_results += 1;
      if (result.is_error === true) {
        stat.errors += 1;
      } else {
        stat.successes += 1;
      }
    } else {
      stat.unknown += 1;
    }

    events.push({
      sessionId: use.session_id,
      requestId: use.request_id,
      timestampMs: toMs(use.timestamp),
      toolUseId: use.tool_use_id,
      toolName,
      verificationKind: use.verification_kind,
      result,
    });
  }

  const toolErrorRates = [...toolStats.values()]
    .map((stat) => ({
      ...stat,
      error_rate: stat.matched_results > 0 ? stat.errors / stat.matched_results : null,
    }))
    .toSorted(
      (a, b) =>
        b.errors - a.errors ||
        (b.error_rate ?? -1) - (a.error_rate ?? -1) ||
        b.total_calls - a.total_calls ||
        a.tool_name.localeCompare(b.tool_name),
    );

  return {
    toolErrorRates,
    ...analyzeVerification(events, sessionIds),
  };
}

function buildFirstResultMap(toolResults: ToolResultRow[]): Map<string, ToolResultRow> {
  const byId = new Map<string, ToolResultRow>();
  const sorted = [...toolResults].toSorted(
    (a, b) =>
      toMs(a.timestamp) - toMs(b.timestamp) ||
      Number(a.msg_ordinality || 0) - Number(b.msg_ordinality || 0) ||
      Number(a.content_ordinality || 0) - Number(b.content_ordinality || 0),
  );

  for (const result of sorted) {
    if (!result.tool_use_id || byId.has(result.tool_use_id)) continue;
    byId.set(result.tool_use_id, result);
  }

  return byId;
}

function sortedToolUses(toolUses: ToolUseRow[]): ToolUseRow[] {
  return [...toolUses].toSorted(
    (a, b) =>
      a.session_id.localeCompare(b.session_id) ||
      toMs(a.timestamp) - toMs(b.timestamp) ||
      Number(a.ordinality || 0) - Number(b.ordinality || 0),
  );
}

function getToolStat(map: Map<string, ToolErrorRate>, toolName: string): ToolErrorRate {
  const existing = map.get(toolName);
  if (existing) return existing;

  const next: ToolErrorRate = {
    tool_name: toolName,
    total_calls: 0,
    matched_results: 0,
    successes: 0,
    errors: 0,
    unknown: 0,
    error_rate: null,
  };
  map.set(toolName, next);
  return next;
}

function analyzeVerification(
  events: ToolEvent[],
  sessionIds: string[],
): Omit<ToolOutcomeAnalytics, 'toolErrorRates'> {
  const sessions = new Map<
    string,
    {
      hadEdit: boolean;
      firstEditMs: number | null;
      verificationEvents: VerificationEvent[];
    }
  >();

  for (const sessionId of sessionIds) {
    sessions.set(sessionId, { hadEdit: false, firstEditMs: null, verificationEvents: [] });
  }

  const kindStats = new Map<VerificationKind, VerificationByKind>();
  for (const kind of KIND_ORDER) {
    kindStats.set(kind, emptyKindStat(kind));
  }

  let verificationAttempts = 0;
  let verificationPasses = 0;
  let verificationFailures = 0;
  let verificationUnknown = 0;

  for (const event of events) {
    const session =
      sessions.get(event.sessionId) ||
      sessions
        .set(event.sessionId, { hadEdit: false, firstEditMs: null, verificationEvents: [] })
        .get(event.sessionId)!;

    if (EDIT_TOOL_NAMES.has(event.toolName)) {
      session.hadEdit = true;
      session.firstEditMs =
        session.firstEditMs === null
          ? event.timestampMs
          : Math.min(session.firstEditMs, event.timestampMs);
    }

    const kind = event.verificationKind;
    if (!kind || kind === 'other') continue;

    const status = event.result?.status ?? 'unknown';
    const verificationEvent: VerificationEvent = {
      sessionId: event.sessionId,
      timestampMs: event.timestampMs,
      kind,
      status,
    };
    session.verificationEvents.push(verificationEvent);

    verificationAttempts += 1;
    if (status === 'pass') verificationPasses += 1;
    else if (status === 'fail') verificationFailures += 1;
    else verificationUnknown += 1;

    const stat = kindStats.get(kind)!;
    stat.attempts += 1;
    if (status === 'pass') stat.passes += 1;
    else if (status === 'fail') stat.failures += 1;
    else stat.unknown += 1;
  }

  const outcomeCounts = new Map<SessionOutcome, number>();
  for (const outcome of OUTCOME_ORDER) {
    outcomeCounts.set(outcome, 0);
  }

  let verificationAttemptsAfterEdit = 0;

  for (const session of sessions.values()) {
    if (!session.hadEdit || session.firstEditMs === null) {
      increment(outcomeCounts, 'no_edit');
      continue;
    }

    const afterEdit = session.verificationEvents
      .filter((event) => event.timestampMs >= session.firstEditMs!)
      .toSorted((a, b) => a.timestampMs - b.timestampMs);
    verificationAttemptsAfterEdit += afterEdit.length;

    for (const event of afterEdit) {
      const stat = kindStats.get(event.kind)!;
      stat.after_edit_attempts += 1;
    }

    if (afterEdit.length === 0) {
      increment(outcomeCounts, 'edited_unverified');
      continue;
    }

    const known = afterEdit.filter((event) => event.status === 'pass' || event.status === 'fail');
    if (known.length === 0) {
      increment(outcomeCounts, 'ambiguous');
      continue;
    }

    const finalKnown = known.at(-1)!;
    if (finalKnown.status === 'fail') {
      increment(outcomeCounts, 'fail_unrecovered');
      continue;
    }

    const hadPriorFailure = known
      .slice(0, -1)
      .some((event) => event.status === 'fail' && event.timestampMs <= finalKnown.timestampMs);
    if (hadPriorFailure) {
      increment(outcomeCounts, 'fail_recovered');
    } else {
      increment(outcomeCounts, 'verified_pass');
    }
  }

  const noEditSessions = getOutcomeCount(outcomeCounts, 'no_edit');
  const unverifiedEditedSessions = getOutcomeCount(outcomeCounts, 'edited_unverified');
  const verifiedPassSessions = getOutcomeCount(outcomeCounts, 'verified_pass');
  const failRecoveredSessions = getOutcomeCount(outcomeCounts, 'fail_recovered');
  const failUnrecoveredSessions = getOutcomeCount(outcomeCounts, 'fail_unrecovered');
  const ambiguousSessions = getOutcomeCount(outcomeCounts, 'ambiguous');
  const editedSessions = sessions.size - noEditSessions;
  const verifiedEditedSessions =
    verifiedPassSessions + failRecoveredSessions + failUnrecoveredSessions + ambiguousSessions;

  const verificationByKind = KIND_ORDER.map((kind) => {
    const stat = kindStats.get(kind)!;
    const known = stat.passes + stat.failures;
    return {
      ...stat,
      pass_rate: known > 0 ? stat.passes / known : null,
      failure_rate: known > 0 ? stat.failures / known : null,
    };
  }).filter((stat) => stat.attempts > 0 || stat.after_edit_attempts > 0);

  return {
    verificationSummary: {
      sessions_analyzed: sessions.size,
      edited_sessions: editedSessions,
      no_edit_sessions: noEditSessions,
      verified_edited_sessions: verifiedEditedSessions,
      unverified_edited_sessions: unverifiedEditedSessions,
      verified_pass_sessions: verifiedPassSessions,
      fail_recovered_sessions: failRecoveredSessions,
      fail_unrecovered_sessions: failUnrecoveredSessions,
      ambiguous_sessions: ambiguousSessions,
      verification_attempts: verificationAttempts,
      verification_attempts_after_edit: verificationAttemptsAfterEdit,
      verification_passes: verificationPasses,
      verification_failures: verificationFailures,
      verification_unknown: verificationUnknown,
    },
    verificationByKind,
    sessionOutcomeCounts: OUTCOME_ORDER.map((outcome) => ({
      outcome,
      count: outcomeCounts.get(outcome) || 0,
    })),
  };
}

function emptyKindStat(kind: VerificationKind): VerificationByKind {
  return {
    kind,
    attempts: 0,
    after_edit_attempts: 0,
    passes: 0,
    failures: 0,
    unknown: 0,
    pass_rate: null,
    failure_rate: null,
  };
}

function increment(map: Map<SessionOutcome, number>, key: SessionOutcome): void {
  map.set(key, (map.get(key) || 0) + 1);
}

function getOutcomeCount(map: Map<SessionOutcome, number>, key: SessionOutcome): number {
  return map.get(key) || 0;
}

function toMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
