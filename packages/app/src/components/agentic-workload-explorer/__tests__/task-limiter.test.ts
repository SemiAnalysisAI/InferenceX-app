import { describe, expect, it } from 'vitest';
import { createTaskLimiter } from '@/lib/agentic-workload-explorer/task-limiter';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createTaskLimiter', () => {
  it('never exceeds its concurrency ceiling and starts a queued task after rejection', async () => {
    const run = createTaskLimiter(2);
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: string[] = [];
    let active = 0;
    let peakActive = 0;

    const task = (id: string, gate: Deferred<string>) => async () => {
      started.push(id);
      active += 1;
      peakActive = Math.max(peakActive, active);
      try {
        return await gate.promise;
      } finally {
        active -= 1;
      }
    };

    const requests = [run(task('a', gates[0])), run(task('b', gates[1])), run(task('c', gates[2]))];
    const settledPromise = Promise.allSettled(requests);

    await flushMicrotasks();
    expect(started).toEqual(['a', 'b']);
    expect(active).toBe(2);
    expect(peakActive).toBe(2);

    gates[0].reject(new Error('a failed'));
    await expect(requests[0]).rejects.toThrow('a failed');
    await Promise.resolve();

    expect(started).toEqual(['a', 'b', 'c']);
    expect(active).toBe(2);
    expect(peakActive).toBe(2);

    gates[1].resolve('b completed');
    gates[2].resolve('c completed');

    await expect(settledPromise).resolves.toEqual([
      { status: 'rejected', reason: new Error('a failed') },
      { status: 'fulfilled', value: 'b completed' },
      { status: 'fulfilled', value: 'c completed' },
    ]);
    expect(active).toBe(0);
    expect(peakActive).toBe(2);
  });
});
