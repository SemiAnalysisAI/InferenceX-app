import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { prepareTraceReplay } from './trace-replay-ingest';
import type { ServerMetricsContext } from './server-metrics-adapters';

export interface TraceReplayWorkerRequest {
  id: number;
  profilePath: string | null;
  serverMetricsCsvPath: string | null;
  serverMetricsJsonPath: string | null;
  metricsContext: ServerMetricsContext;
}

export type TraceReplayWorkerResponse =
  | { id: number; ok: true; prepared: Awaited<ReturnType<typeof prepareTraceReplay>> }
  | { id: number; ok: false; error: string };

const port = parentPort;
if (!port) throw new Error('trace-replay-worker must run in a worker thread');

port.on('message', async (request: TraceReplayWorkerRequest) => {
  try {
    const prepared = await prepareTraceReplay(
      request.profilePath ? fs.readFileSync(request.profilePath) : null,
      request.serverMetricsCsvPath ? fs.readFileSync(request.serverMetricsCsvPath) : null,
      request.serverMetricsJsonPath ? fs.readFileSync(request.serverMetricsJsonPath) : null,
      request.metricsContext,
    );
    const response = {
      id: request.id,
      ok: true,
      prepared,
    } satisfies TraceReplayWorkerResponse;
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort has no targetOrigin parameter.
    port.postMessage(response);
  } catch (error) {
    const response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    } satisfies TraceReplayWorkerResponse;
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node MessagePort has no targetOrigin parameter.
    port.postMessage(response);
  }
});
