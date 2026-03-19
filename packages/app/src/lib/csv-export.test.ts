import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildCsv, csvLicensePreamble, downloadCsv, exportToCsv } from './csv-export';

describe('buildCsv', () => {
  /** Strip the license preamble to isolate data assertions */
  function dataLines(csv: string): string {
    return csv
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n');
  }

  it('prepends the license preamble', () => {
    const result = buildCsv(['A'], [['1']]);
    expect(result.startsWith(csvLicensePreamble())).toBe(true);
  });

  it('generates correct CSV from headers and rows', () => {
    const headers = ['Name', 'Value', 'Active'];
    const rows = [
      ['H100 SXM', 42.5, true],
      ['B200 NVL72', 88.1, false],
    ];

    const result = buildCsv(headers, rows);
    const lines = dataLines(result).split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Name,Value,Active');
    expect(lines[1]).toBe('H100 SXM,42.5,true');
    expect(lines[2]).toBe('B200 NVL72,88.1,false');
  });

  it('escapes cells containing commas', () => {
    const result = buildCsv(['Label'], [['H100, SXM']]);
    expect(dataLines(result)).toBe('Label\n"H100, SXM"');
  });

  it('escapes cells containing double quotes', () => {
    const result = buildCsv(['Label'], [['He said "hello"']]);
    expect(dataLines(result)).toBe('Label\n"He said ""hello"""');
  });

  it('escapes cells containing newlines', () => {
    const result = buildCsv(['Label'], [['line1\nline2']]);
    expect(dataLines(result)).toBe('Label\n"line1\nline2"');
  });

  it('handles null and undefined values as empty strings', () => {
    const result = buildCsv(['A', 'B', 'C'], [[null, undefined, 'value']]);
    expect(dataLines(result)).toBe('A,B,C\n,,value');
  });

  it('handles empty rows', () => {
    const result = buildCsv(['A', 'B'], []);
    expect(dataLines(result)).toBe('A,B');
  });

  it('handles numeric zero and boolean false correctly', () => {
    const result = buildCsv(['Num', 'Bool'], [[0, false]]);
    expect(dataLines(result)).toBe('Num,Bool\n0,false');
  });

  it('handles mixed data types in rows', () => {
    const result = buildCsv(['String', 'Number', 'Boolean', 'Null'], [['gpu', 3.14, true, null]]);
    expect(dataLines(result)).toBe('String,Number,Boolean,Null\ngpu,3.14,true,');
  });
});

describe('downloadCsv', () => {
  let mockClick: ReturnType<typeof vi.fn>;
  let mockLink: Record<string, unknown>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let capturedBlob: Blob | undefined;

  beforeEach(() => {
    mockClick = vi.fn();
    mockLink = { href: '', download: '', click: mockClick };
    mockCreateObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    mockRevokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockLink),
    });
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });
  });

  afterEach(() => {
    capturedBlob = undefined;
    vi.unstubAllGlobals();
  });

  it('creates a Blob with correct content and type', () => {
    downloadCsv('test.csv', 'a,b\n1,2');

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(capturedBlob).toBeInstanceOf(Blob);
    expect(capturedBlob!.type).toBe('text/csv;charset=utf-8;');
  });

  it('sets href from createObjectURL and triggers click', () => {
    downloadCsv('export.csv', 'col1\nval1');

    expect(mockLink.href).toBe('blob:mock-url');
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL after click', () => {
    downloadCsv('export.csv', 'data');

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('keeps .csv extension when filename already ends with .csv', () => {
    downloadCsv('report.csv', 'data');

    expect(mockLink.download).toBe('report.csv');
  });

  it('appends .csv extension when filename lacks it', () => {
    downloadCsv('report', 'data');

    expect(mockLink.download).toBe('report.csv');
  });

  it('appends .csv even when filename has a different extension', () => {
    downloadCsv('data.txt', 'content');

    expect(mockLink.download).toBe('data.txt.csv');
  });

  it('creates an anchor element', () => {
    downloadCsv('test.csv', 'x');

    expect(document.createElement).toHaveBeenCalledWith('a');
  });

  it('blob contains the exact CSV content', async () => {
    const csvContent = 'Name,Value\nH100,42\nA100,38';
    downloadCsv('gpus.csv', csvContent);

    const text = await capturedBlob!.text();
    expect(text).toBe(csvContent);
  });
});

describe('exportToCsv', () => {
  let mockClick: ReturnType<typeof vi.fn>;
  let mockLink: Record<string, unknown>;
  let capturedBlob: Blob | undefined;

  beforeEach(() => {
    mockClick = vi.fn();
    mockLink = { href: '', download: '', click: mockClick };
    capturedBlob = undefined;

    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockLink),
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      }),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds CSV and triggers download in one call', async () => {
    const headers = ['GPU', 'TTFT'];
    const rows = [
      ['H100 SXM', 12.5],
      ['B200 NVL72', 8.3],
    ];

    exportToCsv('benchmarks', headers, rows);

    expect(mockLink.download).toBe('benchmarks.csv');
    expect(mockClick).toHaveBeenCalledTimes(1);

    const text = await capturedBlob!.text();
    expect(text).toContain('GPU,TTFT\nH100 SXM,12.5\nB200 NVL72,8.3');
    expect(text.startsWith(csvLicensePreamble())).toBe(true);
  });

  it('handles empty rows', async () => {
    exportToCsv('empty.csv', ['A', 'B'], []);

    const text = await capturedBlob!.text();
    expect(text).toContain('A,B');
    expect(text.startsWith(csvLicensePreamble())).toBe(true);
  });

  it('escapes special characters in the combined flow', async () => {
    exportToCsv('special', ['Label'], [['value, with "quotes"']]);

    const text = await capturedBlob!.text();
    expect(text).toContain('Label\n"value, with ""quotes"""');
  });

  it('preserves .csv suffix when already present', () => {
    exportToCsv('data.csv', ['X'], [['1']]);
    expect(mockLink.download).toBe('data.csv');
  });
});
