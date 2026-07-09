import { Worker } from 'node:worker_threads';

import type { PreparedTraceReplay } from './trace-replay-ingest';
import type { ServerMetricsContext } from './server-metrics-adapters';
import type { TraceReplayWorkerRequest, TraceReplayWorkerResponse } from './trace-replay-worker';

export interface TraceReplayWork {
  profilePath: string | null;
  serverMetricsCsvPath: string | null;
  serverMetricsJsonPath: string | null;
  metricsContext: ServerMetricsContext;
}

interface QueuedWork extends TraceReplayWork {
  id: number;
  resolve: (prepared: PreparedTraceReplay) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  current: QueuedWork | null;
}

function hydratePrepared(prepared: TraceReplayWorkerResponse & { ok: true }): PreparedTraceReplay {
  return {
    ...prepared.prepared,
    profileGz: prepared.prepared.profileGz ? Buffer.from(prepared.prepared.profileGz) : null,
    serverMetricsCsv: prepared.prepared.serverMetricsCsv
      ? Buffer.from(prepared.prepared.serverMetricsCsv)
      : null,
    metricsJsonGz: prepared.prepared.metricsJsonGz
      ? Buffer.from(prepared.prepared.metricsJsonGz)
      : null,
  };
}

export class TraceReplayWorkerPool {
  readonly #slots: WorkerSlot[] = [];
  readonly #queue: QueuedWork[] = [];
  #nextId = 1;
  #closed = false;

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 1) throw new Error(`Invalid worker pool size: ${size}`);
    for (let index = 0; index < size; index++) this.#slots.push(this.#createSlot());
  }

  prepare(work: TraceReplayWork): Promise<PreparedTraceReplay> {
    if (this.#closed) return Promise.reject(new Error('Trace replay worker pool is closed'));
    return new Promise((resolve, reject) => {
      this.#queue.push({ ...work, id: this.#nextId++, resolve, reject });
      this.#dispatch();
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all(this.#slots.map((slot) => slot.worker.terminate()));
  }

  #createSlot(): WorkerSlot {
    const slot: WorkerSlot = {
      worker: new Worker(new URL('trace-replay-worker-bootstrap.mjs', import.meta.url)),
      current: null,
    };
    slot.worker.on('message', (response: TraceReplayWorkerResponse) => {
      const current = slot.current;
      if (!current || response.id !== current.id) return;
      slot.current = null;
      if (response.ok) current.resolve(hydratePrepared(response));
      else current.reject(new Error(response.error));
      this.#dispatch();
    });
    slot.worker.on('error', (error) => {
      slot.current?.reject(error instanceof Error ? error : new Error(String(error)));
      slot.current = null;
      if (!this.#closed) {
        const index = this.#slots.indexOf(slot);
        this.#slots[index] = this.#createSlot();
        this.#dispatch();
      }
    });
    return slot;
  }

  #dispatch(): void {
    for (const slot of this.#slots) {
      if (slot.current || this.#queue.length === 0) continue;
      const work = this.#queue.shift()!;
      slot.current = work;
      const request: TraceReplayWorkerRequest = {
        id: work.id,
        profilePath: work.profilePath,
        serverMetricsCsvPath: work.serverMetricsCsvPath,
        serverMetricsJsonPath: work.serverMetricsJsonPath,
        metricsContext: work.metricsContext,
      };
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node Worker has no targetOrigin parameter.
      slot.worker.postMessage(request);
    }
  }
}
