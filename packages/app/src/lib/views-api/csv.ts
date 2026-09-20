import { cachedText } from '@/lib/api-cache';

/**
 * Minimal RFC 4180 CSV serialization for views-API alternate representations.
 *
 * Mirrors the `tco-feed` CSV contract: header row from the union of row keys
 * (first-seen order), empty string for null/undefined, quotes only when needed.
 */

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

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
  const lines = [columns.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function csvResponse(rows: readonly Readonly<Record<string, unknown>>[]): Response {
  return cachedText(toCsv(rows), 'text/csv; charset=utf-8');
}
