import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import type { PreparedTraceReplay } from './trace-replay-ingest';
import type {
  PreparedTraceReplayWire,
  TraceReplayWorkerJob,
  TraceReplayWorkerRequest,
  TraceReplayWorkerResponse,
} from './trace-replay-worker-protocol';

const DEFAULT_MAX_WORKERS = 4;
const OVERRIDE_MAX_WORKERS = 8;

/**
 * Reserve roughly three quarters of the vCPUs for Bun, gzip, database IO, and
 * runner overhead. Four GiB-scale parser workers are enough to saturate the
 * current 16-vCPU ingest runner without multiplying memory use excessively.
 */
export function resolveTraceReplayWorkerCount(
  vcpus = availableParallelism(),
  override = process.env.INGEST_TRACE_WORKERS,
): number {
  const normalizedVcpus = Math.max(1, Math.floor(vcpus));
  if (override !== undefined) {
    const parsed = Number(override);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return Math.min(parsed, normalizedVcpus, OVERRIDE_MAX_WORKERS);
    }
  }
  return Math.max(1, Math.min(DEFAULT_MAX_WORKERS, Math.floor(normalizedVcpus / 4)));
}

interface PendingTask<T = unknown> {
  id: number;
  job: TraceReplayWorkerJob;
  consume: (prepared: PreparedTraceReplay) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  task: PendingTask | null;
}

const BUFFER_FIELDS = [
  'profileGz',
  'serverMetricsCsv',
  'serverMetricsJsonGz',
  'aggregateStatsJson',
  'chartSeriesJson',
  'requestTimelineJson',
] as const;

function fromWire(wire: PreparedTraceReplayWire): PreparedTraceReplay {
  const prepared = { ...wire } as unknown as PreparedTraceReplay;
  for (const field of BUFFER_FIELDS) {
    const value = wire[field];
    prepared[field] = value
      ? Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength)
      : null;
  }
  return prepared;
}

/**
 * A fixed worker pool whose slot remains reserved until `consume` finishes.
 * This bounds prepared-buffer memory to the worker count even when Postgres is
 * slower than computation, instead of allowing completed GiB-scale jobs to
 * accumulate in an unbounded upload queue.
 */
export class TraceReplayWorkerPool {
  private readonly queue: PendingTask[] = [];
  private readonly slots: WorkerSlot[] = [];
  private nextTaskId = 1;
  private closing = false;
  readonly size: number;

  constructor(size: number) {
    if (!Number.isSafeInteger(size) || size < 1) {
      throw new Error(`Worker count must be a positive integer, received ${size}`);
    }
    this.size = size;
  }

  run<T>(
    job: TraceReplayWorkerJob,
    consume: (prepared: PreparedTraceReplay) => Promise<T>,
  ): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Trace replay worker pool is closing'));
    this.ensureWorkers();
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id: this.nextTaskId++,
        job,
        consume: consume as (prepared: PreparedTraceReplay) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    const closeError = new Error('Trace replay worker pool closed before queued work completed');
    for (const task of this.queue.splice(0)) task.reject(closeError);
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
    this.slots.length = 0;
  }

  private ensureWorkers(): void {
    while (this.slots.length < this.size) {
      const worker = new Worker(new URL('trace-replay-worker.ts', import.meta.url));
      const slot: WorkerSlot = { worker, task: null };
      worker.on('message', (response: TraceReplayWorkerResponse) => {
        void this.handleResponse(slot, response);
      });
      worker.on('error', (error) =>
        this.handleWorkerFailure(slot, error instanceof Error ? error : new Error(String(error))),
      );
      worker.on('exit', (code) => {
        if (!this.closing && code !== 0) {
          this.handleWorkerFailure(slot, new Error(`Trace replay worker exited with code ${code}`));
        }
      });
      this.slots.push(slot);
    }
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.task) continue;
      const task = this.queue.shift();
      if (!task) return;
      slot.task = task;
      const request: TraceReplayWorkerRequest = { id: task.id, job: task.job };
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- node:worker_threads has no targetOrigin parameter
      slot.worker.postMessage(request);
    }
  }

  private async handleResponse(
    slot: WorkerSlot,
    response: TraceReplayWorkerResponse,
  ): Promise<void> {
    const task = slot.task;
    if (!task || response.id !== task.id) {
      this.handleWorkerFailure(slot, new Error(`Unexpected trace worker response ${response.id}`));
      return;
    }

    try {
      if (!response.ok) {
        const error = new Error(response.error.message);
        error.stack = response.error.stack ?? error.stack;
        throw error;
      }
      task.resolve(await task.consume(fromWire(response.prepared)));
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      slot.task = null;
      this.dispatch();
    }
  }

  private handleWorkerFailure(slot: WorkerSlot, error: Error): void {
    if (!this.slots.includes(slot)) return;
    slot.task?.reject(error);
    slot.task = null;
    const index = this.slots.indexOf(slot);
    this.slots.splice(index, 1);
    void slot.worker.terminate();
    if (!this.closing) {
      this.ensureWorkers();
      this.dispatch();
    }
  }
}
