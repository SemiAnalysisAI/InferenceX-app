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
});
