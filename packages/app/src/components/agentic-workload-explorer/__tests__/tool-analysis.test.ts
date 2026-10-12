import { describe, expect, it } from 'vitest';
import {
  analyzeToolOutcomes,
  type ToolResultRow,
  type ToolUseRow,
  type VerificationKind,
  type VerificationStatus,
} from '@semianalysisai/inferencex-db/proxytrace/tool-analysis';

function toolUse(
  sessionId: string,
  requestId: string,
  timestamp: string,
  toolUseId: string,
  toolName: string,
  verificationKind: VerificationKind | null = null,
): ToolUseRow {
  return {
    session_id: sessionId,
    request_id: requestId,
    timestamp,
    ordinality: 1,
    tool_use_id: toolUseId,
    tool_name: toolName,
    verification_kind: verificationKind,
    duration_ms: 100,
    cost_usd: 0.01,
  };
}

function toolResult(
  sessionId: string,
  requestId: string,
  timestamp: string,
  toolUseId: string,
  isError: boolean,
  status: VerificationStatus,
): ToolResultRow {
  return {
    session_id: sessionId,
    request_id: requestId,
    timestamp,
    msg_ordinality: 1,
    content_ordinality: 1,
    tool_use_id: toolUseId,
    is_error: isError,
    status,
  };
}

describe('analyzeToolOutcomes', () => {
  it('pairs tool results and detects recovered verification failures', () => {
    const toolUses: ToolUseRow[] = [
      toolUse('s1', 'r1', '2025-01-01T00:00:00Z', 'edit-1', 'Edit'),
      toolUse('s1', 'r2', '2025-01-01T00:01:00Z', 'bash-1', 'Bash', 'test'),
      toolUse('s1', 'r3', '2025-01-01T00:02:00Z', 'edit-2', 'Edit'),
      toolUse('s1', 'r4', '2025-01-01T00:03:00Z', 'bash-2', 'Bash', 'test'),
    ];

    const toolResults: ToolResultRow[] = [
      toolResult('s1', 'r3', '2025-01-01T00:02:00Z', 'bash-1', true, 'fail'),
      // Same historical tool_result appears in later request history; only the first counts.
      toolResult('s1', 'r4', '2025-01-01T00:03:00Z', 'bash-1', true, 'fail'),
      toolResult('s1', 'r5', '2025-01-01T00:04:00Z', 'bash-2', false, 'pass'),
    ];

    const result = analyzeToolOutcomes(toolUses, toolResults, ['s1']);

    const bash = result.toolErrorRates.find((row) => row.tool_name === 'Bash');
    expect(bash).toMatchObject({
      total_calls: 2,
      matched_results: 2,
      successes: 1,
      errors: 1,
      unknown: 0,
    });
    expect(bash?.error_rate).toBe(0.5);

    expect(result.sessionOutcomeCounts.find((row) => row.outcome === 'fail_recovered')).toEqual({
      outcome: 'fail_recovered',
      count: 1,
    });
    expect(result.verificationSummary).toMatchObject({
      edited_sessions: 1,
      verified_edited_sessions: 1,
      fail_recovered_sessions: 1,
      verification_attempts_after_edit: 2,
    });
  });

  it('classifies edited sessions without later verification separately from no-edit sessions', () => {
    const result = analyzeToolOutcomes(
      [
        toolUse('s1', 'r1', '2025-01-01T00:00:00Z', 'edit-1', 'Edit'),
        toolUse('s2', 'r2', '2025-01-01T00:00:00Z', 'read-1', 'Read'),
      ],
      [],
      ['s1', 's2', 's3'],
    );

    expect(result.sessionOutcomeCounts.find((row) => row.outcome === 'edited_unverified')).toEqual({
      outcome: 'edited_unverified',
      count: 1,
    });
    expect(result.sessionOutcomeCounts.find((row) => row.outcome === 'no_edit')).toEqual({
      outcome: 'no_edit',
      count: 2,
    });
  });
});
