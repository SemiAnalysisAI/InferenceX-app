/**
 * Receipts written at the end of a CI ingest.
 *
 * The PowerX publication manifest feeds `verify-power-publication.ts`, so its
 * `ingestErrors` must name PowerX publication problems only. Every other
 * failed database write goes to the database write receipt, which the
 * workflow's "Check database writes" step reports on its own.
 */

import {
  powerWorkloadOf,
  type PowerPublicationManifest,
  type PowerPublicationPoint,
} from './power-publication';
import type { DbWriteFailure, SkipTracker } from './skip-tracker';
import type { TelemetryReceipt } from './telemetry-receipt';

export interface DatabaseWriteReceipt {
  version: 1;
  runId: number;
  runAttempt: number;
  /** Fatal: the "Check database writes" step fails when this is non-empty. */
  errors: DbWriteFailure[];
  /** Known, non-fatal write failures; reported as annotations only. */
  warnings: DbWriteFailure[];
}

export interface IngestReceiptInput {
  runId: number;
  runAttempt: number;
  points: readonly PowerPublicationPoint[];
  /** PowerX publication errors collected during the ingest. */
  publicationErrors: readonly string[];
  tracker: Pick<SkipTracker, 'skips' | 'dbWriteErrors' | 'dbWriteWarnings'>;
  /** Telemetry artifacts that were produced but held no telemetry files. */
  telemetryNotCollectedArtifacts?: number;
  telemetry?: TelemetryReceipt;
}

export function buildPowerPublicationManifest(input: IngestReceiptInput): PowerPublicationManifest {
  const { skips } = input.tracker;
  return {
    version: 1,
    runId: input.runId,
    runAttempt: input.runAttempt,
    points: [...input.points],
    // Database write failures are reported by the write receipt instead. A
    // write failure that leaves a hole in a PowerX curve is already among the
    // publication errors (config) or caught by the verifier (missing row).
    ingestErrors: [...input.publicationErrors],
    // Reported but not fatal — see Skips.telemetryError.
    telemetryWarnings: [
      ...(skips.telemetryError
        ? [`${skips.telemetryError} telemetry errors (gpu_metrics digest or AgentX window)`]
        : []),
      ...(input.telemetryNotCollectedArtifacts
        ? [`${input.telemetryNotCollectedArtifacts} telemetry artifact(s) held no telemetry`]
        : []),
    ],
    ...(input.telemetry ? { telemetry: input.telemetry } : {}),
  };
}

export function buildDatabaseWriteReceipt(input: IngestReceiptInput): DatabaseWriteReceipt {
  return {
    version: 1,
    runId: input.runId,
    runAttempt: input.runAttempt,
    errors: [...input.tracker.dbWriteErrors],
    warnings: [...input.tracker.dbWriteWarnings],
  };
}

/**
 * PowerX publication error for a failed config write, or undefined when the
 * row is not a PowerX workload. The row never reaches the manifest, so without
 * this the verifier cannot see the hole in the PowerX curve.
 */
export function configWriteFailurePublicationError(
  row: Parameters<typeof powerWorkloadOf>[0],
  relativeFile: string,
): string | undefined {
  const workload = powerWorkloadOf(row);
  return workload
    ? `Config write failed for ${workload.scenario} result: ${relativeFile}`
    : undefined;
}
