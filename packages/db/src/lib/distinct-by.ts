export function distinctBy<T>(rows: Iterable<T>, key: (row: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    if (!seen.has(k)) seen.set(k, row);
  }
  return [...seen.values()];
}

export function mergeDistinctRows<T>(parts: readonly (readonly T[])[]): T[] {
  return distinctBy(parts.flat(), (row) => JSON.stringify(row));
}
