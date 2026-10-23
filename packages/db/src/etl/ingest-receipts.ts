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
  errors: DbWriteFailure[];
  warnings: DbWriteFailure[];
}

export interface IngestReceiptInput {
  runId: number;
  runAttempt: number;
  points: readonly PowerPublicationPoint[];
  publicationErrors: readonly string[];
  publicationWarnings?: readonly string[];
  tracker: Pick<SkipTracker, 'skips' | 'dbWriteErrors' | 'dbWriteWarnings'>;
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
    ingestErrors: [...input.publicationErrors],
    publicationWarnings: [...(input.publicationWarnings ?? [])],
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

export function configWriteFailurePublicationError(
  row: Parameters<typeof powerWorkloadOf>[0],
  relativeFile: string,
): string | undefined {
  const workload = powerWorkloadOf(row);
  return workload
    ? `Config write failed for ${workload.scenario} result: ${relativeFile}`
    : undefined;
}
