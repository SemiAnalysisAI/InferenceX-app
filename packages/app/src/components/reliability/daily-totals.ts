import type { ReliabilityRow } from '@/lib/api/api';

export function sumReliabilityByDay(rows: readonly ReliabilityRow[]): ReliabilityRow[] {
  const days = new Map<string, ReliabilityRow>();
  for (const { hardware, date, n_success, total } of rows) {
    const key = `${date}|${hardware}`;
    const day = days.get(key);
    if (day) {
      day.n_success += n_success;
      day.total += total;
    } else {
      days.set(key, { hardware, date, n_success, total });
    }
  }
  return [...days.values()].filter((day) => day.total !== 0 || day.n_success !== 0);
}
