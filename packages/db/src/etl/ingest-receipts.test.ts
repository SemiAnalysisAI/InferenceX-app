import { describe, expect, it } from 'vitest';
import {
  buildDatabaseWriteReceipt,
  buildPowerPublicationManifest,
  configWriteFailurePublicationError,
} from './ingest-receipts';
import { createSkipTracker } from './skip-tracker';

function pgError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('ingest receipt routing', () => {
  it('keeps database write failures out of the PowerX manifest', () => {
    const tracker = createSkipTracker();
    tracker.recordDbError(
      'trace_replay',
      'dsv41flash_conc4096',
      pgError('total size of jsonb array elements exceeds the maximum', '54000'),
    );
    tracker.recordDbError(
      'server_logs',
      'qwen3.5_8k1k_conc12288',
      pgError('write CONNECTION_CLOSED', 'CONNECTION_CLOSED'),
    );
    tracker.recordDbError('trace_replay', 'glm5_conc64', new Error('Authentication timed out'));
    const input = {
      runId: 38644884678,
      runAttempt: 1,
      points: [],
      publicationErrors: ['Unmapped or failed 8k1k result: bmk_x/result.json'],
      tracker,
    };

    const manifest = buildPowerPublicationManifest(input);
    expect(manifest.ingestErrors).toEqual(['Unmapped or failed 8k1k result: bmk_x/result.json']);

    const receipt = buildDatabaseWriteReceipt(input);
    expect(receipt).toMatchObject({ version: 1, runId: 38644884678, runAttempt: 1 });
    expect(
      [...receipt.errors, ...receipt.warnings].map(({ kind, subject, code }) => ({
        kind,
        subject,
        code,
      })),
    ).toEqual(
      expect.arrayContaining([
        { kind: 'server_logs', subject: 'qwen3.5_8k1k_conc12288', code: 'CONNECTION_CLOSED' },
        { kind: 'trace_replay', subject: 'glm5_conc64', code: undefined },
        { kind: 'trace_replay', subject: 'dsv41flash_conc4096', code: '54000' },
      ]),
    );
  });

  it('routes the known trace_replay size limit to receipt warnings', () => {
    const tracker = createSkipTracker();
    tracker.recordDbError(
      'trace_replay',
      'dsv41flash conc 4096',
      pgError('total size of jsonb array elements exceeds the maximum', '54000'),
    );
    const receipt = buildDatabaseWriteReceipt({
      runId: 1,
      runAttempt: 1,
      points: [],
      publicationErrors: [],
      tracker,
    });
    expect(receipt.errors).toEqual([]);
    expect(receipt.warnings.map(({ kind, code }) => ({ kind, code }))).toEqual([
      { kind: 'trace_replay', code: '54000' },
    ]);
  });

  it('reports telemetry artifacts without telemetry as a separate warning line', () => {
    const tracker = createSkipTracker();
    tracker.recordTelemetryError('gpu_metrics for x', new Error('bad digest'));
    const manifest = buildPowerPublicationManifest({
      runId: 1,
      runAttempt: 1,
      points: [],
      publicationErrors: [],
      tracker,
      telemetryNotCollectedArtifacts: 2,
    });
    expect(manifest.ingestErrors).toEqual([]);
    expect(manifest.telemetryWarnings).toEqual([
      '1 telemetry errors (gpu_metrics digest or AgentX window)',
      '2 telemetry artifact(s) held no telemetry',
    ]);
  });

  it('writes empty receipts for a clean ingest', () => {
    const input = {
      runId: 1,
      runAttempt: 2,
      points: [],
      publicationErrors: [],
      tracker: createSkipTracker(),
    };
    expect(buildPowerPublicationManifest(input)).toEqual({
      version: 1,
      runId: 1,
      runAttempt: 2,
      points: [],
      ingestErrors: [],
      telemetryWarnings: [],
    });
    expect(buildDatabaseWriteReceipt(input)).toEqual({
      version: 1,
      runId: 1,
      runAttempt: 2,
      errors: [],
      warnings: [],
    });
  });
});

describe('configWriteFailurePublicationError', () => {
  it('reports a failed config write for PowerX workloads', () => {
    expect(
      configWriteFailurePublicationError(
        { benchmarkType: 'single_turn', isl: 8192, osl: 1024 },
        'bmk_x/r.json',
      ),
    ).toBe('Config write failed for 8k1k result: bmk_x/r.json');
    expect(
      configWriteFailurePublicationError(
        { benchmarkType: 'agentic_traces', isl: null, osl: null },
        'agentic/r.json',
      ),
    ).toBe('Config write failed for agentic result: agentic/r.json');
  });

  it('ignores rows outside the PowerX workloads', () => {
    expect(
      configWriteFailurePublicationError(
        { benchmarkType: 'single_turn', isl: 1024, osl: 8192 },
        'bmk_y/r.json',
      ),
    ).toBeUndefined();
  });
});
