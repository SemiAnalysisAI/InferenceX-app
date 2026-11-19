import { describe, expect, it } from 'vitest';

import { pgCaseVariants, pgLowerText } from './server-log-pg-lower';

describe('pgLowerText', () => {
  it('matches PostgreSQL 17 lower() under the builtin C.UTF-8 locale', () => {
    expect(pgLowerText('ABC ΟΔΟΣ İ ẞ \u212A \u{10400} \uA7CB ǅ ﬃ ı ĂĄ')).toBe(
      'abc οδοσ i ß k \u{10428} \uA7CB ǆ ﬃ ı ăą',
    );
  });

  it('lowers ASCII around non-ASCII runs', () => {
    expect(pgLowerText('ÀB')).toBe('àb');
    expect(pgLowerText('AÀ')).toBe('aà');
  });
});

const variants = (ch: string) =>
  pgCaseVariants(ch.codePointAt(0)!)
    .map((code) => String.fromCodePoint(code))
    .sort()
    .join('');

describe('pgCaseVariants', () => {
  it('lists every code point with the same lowercase', () => {
    expect(variants('i')).toBe('Iiİ');
    expect(variants('\u212A')).toBe('Kk\u212A');
    expect(variants('A')).toBe('Aa');
    expect(variants('z')).toBe('Zz');
    expect(variants('Z')).toBe('Zz');
    expect(variants('`')).toBe('`');
  });
});
