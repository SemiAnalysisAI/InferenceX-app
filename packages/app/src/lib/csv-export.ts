/**
 * CSV export utility for chart data.
 * Converts structured data into CSV format and triggers a browser download.
 */

/** License preamble prepended to every exported CSV file */
export function csvLicensePreamble(): string {
  return [
    '# Licensed under Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0',
    `# Copyright ${new Date().getFullYear()} SemiAnalysis LLC. Data from InferenceX (https://github.com/SemiAnalysisAI/InferenceX).`,
    '# Attribution to InferenceX is required for any derivative work.',
  ].join('\n');
}

/** Escape a cell value for CSV: wrap in quotes if it contains commas, quotes, or newlines */
function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from headers and rows */
export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [csvLicensePreamble(), headerLine, ...dataLines].join('\n');
}

/** Trigger a CSV file download in the browser */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Build CSV content and trigger download in one call */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): void {
  const csv = buildCsv(headers, rows);
  downloadCsv(filename, csv);
}
