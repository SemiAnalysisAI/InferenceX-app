import { parentPort } from 'node:worker_threads';

import { prepareTraceReplay, type PreparedTraceReplay } from './trace-replay-ingest';
import type {
  PreparedTraceReplayWire,
  TraceReplayWorkerRequest,
  TraceReplayWorkerResponse,
} from './trace-replay-worker-protocol';

const port = parentPort;
if (!port) throw new Error('trace-replay-worker must run in a worker thread');

const BUFFER_FIELDS = [
  'profileGz',
  'serverMetricsCsv',
  'serverMetricsJsonGz',
  'aggregateStatsJson',
  'chartSeriesJson',
  'requestTimelineJson',
] as const;

function toWire(prepared: PreparedTraceReplay): {
  prepared: PreparedTraceReplayWire;
  transfer: ArrayBuffer[];
} {
  const wire = { ...prepared } as unknown as PreparedTraceReplayWire;
  const transfer: ArrayBuffer[] = [];
  for (const field of BUFFER_FIELDS) {
    const buffer = prepared[field];
    if (!buffer) continue;
    const transferable =
      buffer.buffer instanceof ArrayBuffer &&
      buffer.byteOffset === 0 &&
      buffer.byteLength === buffer.buffer.byteLength
        ? new Uint8Array(buffer.buffer)
        : Uint8Array.from(buffer);
    wire[field] = transferable;
    transfer.push(transferable.buffer);
  }
  return { prepared: wire, transfer };
}

port.on('message', async ({ id, job }: TraceReplayWorkerRequest) => {
  try {
    const result = await prepareTraceReplay(
      job.profileExportJsonl,
      job.serverMetricsCsv,
      job.serverMetricsJson,
      job.metricsContext,
    );
    const { prepared, transfer } = toWire(result);
    const response: TraceReplayWorkerResponse = { id, ok: true, prepared };
    port.postMessage(response, transfer);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const response: TraceReplayWorkerResponse = {
      id,
      ok: false,
      error: { message: normalized.message, stack: normalized.stack },
    };
    port.postMessage(response);
  }
});
