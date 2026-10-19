import type { PreparedTraceReplay } from './trace-replay-ingest';
import type { ServerMetricsContext } from './server-metrics-adapters';

export interface TraceReplayWorkerJob {
  profileExportJsonl: string | null;
  serverMetricsCsv: string | null;
  serverMetricsJson: string | null;
  metricsContext: ServerMetricsContext;
}

export interface TraceReplayWorkerRequest {
  id: number;
  job: TraceReplayWorkerJob;
}

export const PREPARED_TRACE_REPLAY_BUFFER_FIELDS = [
  'profileGz',
  'serverMetricsCsv',
  'serverMetricsJsonGz',
  'aggregateStatsJson',
  'chartSeriesJson',
  'requestTimelineGz',
] as const satisfies readonly (keyof PreparedTraceReplay)[];

type BufferField = (typeof PREPARED_TRACE_REPLAY_BUFFER_FIELDS)[number];

export type PreparedTraceReplayWire = Omit<PreparedTraceReplay, BufferField> &
  Record<BufferField, Uint8Array | null>;

export type TraceReplayWorkerResponse =
  | { id: number; ok: true; prepared: PreparedTraceReplayWire }
  | { id: number; ok: false; error: { message: string; stack?: string } };
