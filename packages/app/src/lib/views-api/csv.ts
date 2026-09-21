import { cachedText } from '@/lib/api-cache';
import { escapeCsvCell } from '@/lib/csv-export';

/**
 * Minimal RFC 4180 CSV serialization for views-API alternate representations.
 *
 * Header row from the union of row keys (first-seen order), CRLF line endings,
 * and the same cell quoting as the dashboard's chart export (`escapeCsvCell`).
 * Deliberately not the `tco-feed` Power Query contract (LF, unquoted, fixed
 * columns) and without the download license preamble.
 */

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

export function csvResponse(rows: readonly Readonly<Record<string, unknown>>[]): Response {
  return cachedText(toCsv(rows), 'text/csv; charset=utf-8');
}
