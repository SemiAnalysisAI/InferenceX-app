import { describe, expect, it } from 'bun:test';

import { redactText } from './log-redaction';
import vectors from './log-redaction.vectors.json';

describe('redactText', () => {
  it.each(vectors.cases)('$name', ({ input, output }) => {
    expect(redactText(input)).toBe(output);
  });

  it.each(vectors.cases)('leaves its own output unchanged: $name', ({ output }) => {
    expect(redactText(output)).toBe(output);
  });

  it('stays linear on long runs without whitespace and on huge single lines', () => {
    // Unbounded scheme and per-match line scans took seconds here and grow with the square.
    const dotted = 'a.'.repeat(100_000);
    const pipLine = 'x (198.51.100.7) '.repeat(20_000);
    const started = performance.now();
    expect(redactText(dotted)).toBe(dotted);
    expect(redactText(pipLine)).toBe('x (***REDACTED***) '.repeat(20_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
