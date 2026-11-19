export function csvLicensePreamble(): string {
  return [
    '# Licensed under Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0',
    `# Copyright ${new Date().getFullYear()} SemiAnalysis LLC. Data from InferenceX (https://github.com/SemiAnalysisAI/InferenceX).`,
    '# Attribution to InferenceX is required for any derivative work.',
  ].join('\n');
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  notes: string[] = [],
): string {
  const noteLines = notes.map((note) => `# ${note}`);
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [csvLicensePreamble(), ...noteLines, headerLine, ...dataLines].join('\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  notes: string[] = [],
): void {
  const csv = buildCsv(headers, rows, notes);
  downloadCsv(filename, csv);
}
