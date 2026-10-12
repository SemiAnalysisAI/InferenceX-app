// Coalesces concurrent inline (request-thread) computes sharing the same
// cache key: N parallel callers within one instance run the compute once and
// all await the same promise.
const inFlightComputes = new Map<string, Promise<unknown>>();

export function coalesceCompute<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const existing = inFlightComputes.get(key);
  if (existing) return existing as Promise<T>;
  const promise = compute().finally(() => {
    inFlightComputes.delete(key);
  });
  inFlightComputes.set(key, promise);
  return promise;
}
