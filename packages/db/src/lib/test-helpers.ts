// Stand-ins for the Vitest helpers bun:test lacks (vi.stubEnv, vi.unstubAllEnvs, vi.waitFor).
import { setTimeout as sleep } from 'node:timers/promises';

const originalEnv = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else process.env[name] = value;
}

/** Sets an environment variable until `unstubAllEnvs()`; `undefined` removes it. */
export function stubEnv(name: string, value: string | undefined): void {
  if (!originalEnv.has(name)) originalEnv.set(name, process.env[name]);
  setEnv(name, value);
}

/** Restores every variable changed through `stubEnv()` since the last call. */
export function unstubAllEnvs(): void {
  for (const [name, value] of originalEnv) setEnv(name, value);
  originalEnv.clear();
}

/** Retries `callback` every `interval` ms until it stops throwing, rethrowing its last error after `timeout` ms. */
export async function waitFor<T>(
  callback: () => T | Promise<T>,
  { timeout = 1000, interval = 50 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const deadline = performance.now() + timeout;
  for (;;) {
    try {
      return await callback();
    } catch (error) {
      if (performance.now() >= deadline) throw error;
      await sleep(interval);
    }
  }
}
