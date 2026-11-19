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
