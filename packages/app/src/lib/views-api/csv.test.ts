import { describe, expect, it, vi } from 'vitest';

// api-cache transitively imports next/cache + blob deps that don't load in the
// unit-test environment; route tests mock it the same way.
vi.mock('@/lib/api-cache', () => ({
  cachedText: (data: string, contentType: string) =>
    new Response(data, { headers: { 'Content-Type': contentType } }),
}));

const { toCsv, csvResponse } = await import('./csv');

describe('toCsv', () => {
  it('builds a header from the union of row keys in first-seen order', () => {
    const csv = toCsv([
      { a: 1, b: 'x' },
      { a: 2, c: true },
    ]);
    expect(csv).toBe('a,b,c\r\n1,x,\r\n2,,true\r\n');
  });

  it('escapes quotes, commas, and newlines per RFC 4180', () => {
    const csv = toCsv([{ label: 'B200 (vLLM), "MXFP8"', note: 'line1\nline2' }]);
    expect(csv).toBe('label,note\r\n"B200 (vLLM), ""MXFP8""","line1\nline2"\r\n');
  });

  it('serializes null and undefined as empty cells', () => {
    expect(toCsv([{ a: null, b: undefined, c: 0 }])).toBe('a,b,c\r\n,,0\r\n');
  });
});

describe('csvResponse', () => {
  it('returns text/csv with the serialized body', async () => {
    const response = csvResponse([{ a: 1 }]);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(await response.text()).toBe('a\r\n1\r\n');
  });
});
