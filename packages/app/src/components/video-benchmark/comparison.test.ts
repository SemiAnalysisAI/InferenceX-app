import { describe, expect, it } from 'vitest';
import { comparisonRefs, rememberComparison } from './comparison';

describe('shared CI comparison identities', () => {
  it('retains the previous artifact when another run is opened', () => {
    const url = rememberComparison(
      new URL('https://example.test/video?view=tradeoff&run=123&artifact=40&cell=c2'),
      '456',
      '41',
    );
    expect(url.searchParams.get('compare')).toBe('123.40,456.41');
    expect(url.searchParams.get('view')).toBe('tradeoff');
    expect(url.searchParams.get('cell')).toBe('c2');
    expect(rememberComparison(url, '456', '41').searchParams.get('compare')).toBe('123.40,456.41');
  });

  it('saves the first loaded artifact before navigation replaces its run identity', () => {
    const url = rememberComparison(
      new URL('https://example.test/video?run=123&artifact=40'),
      '123',
      '40',
    );
    expect(url.searchParams.get('compare')).toBe('123.40');
    expect(comparisonRefs(null)).toEqual([]);
  });

  it.each([
    '123',
    '123.40,',
    '0.40',
    '123.40&run=999',
    Array.from({ length: 9 }, (_, i) => `${i + 1}.40`).join(','),
  ])('rejects malformed or oversized requests: %s', (value) => {
    expect(() => comparisonRefs(value)).toThrow();
  });
});
