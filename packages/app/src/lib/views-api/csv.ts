import { cachedText } from '@/lib/cache/api-cache';
import { escapeCsvCell } from '@/lib/export/csv-export';

export function toCsv(rows: readonly Readonly<Record<string, unknown>>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [columns.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function csvResponse(
  rows: readonly Readonly<Record<string, unknown>>[],
  options?: { tag?: string; cacheControl?: string },
): Response {
  return cachedText(toCsv(rows), 'text/csv; charset=utf-8', options);
}
