import { describe, expect, it } from 'vitest';

import { processRedactionKey, redactText } from './log-redaction';
import vectors from './log-redaction.vectors.json';

const key = Buffer.from(vectors.key, 'utf8');
const TAG = /^\*\*\*REDACTED-[0-9a-f]{6}\*\*\*$/u;

describe('redactText', () => {
  it.each(vectors.cases)('$name', ({ input, output }) => {
    expect(redactText(input, key)).toBe(output);
  });

  it.each(vectors.cases)('leaves its own output unchanged: $name', ({ output }) => {
    expect(redactText(output, key)).toBe(output);
  });

  it('tags a public address inside a quoted JSON value that is more than the address', () => {
    expect(redactText('{"cmd": "8.8.8.8 --port 53"}', key)).toMatch(
      /^\{"cmd": "\*\*\*REDACTED-[0-9a-f]{6}\*\*\* --port 53"\}$/u,
    );
  });

  it('keeps a public address that is the whole value of a non-address JSON key', () => {
    expect(redactText('{"version": "8.8.8.8"}', key)).toBe('{"version": "8.8.8.8"}');
    expect(redactText('{"peer_host": "8.8.8.8"}', key)).toMatch(
      /^\{"peer_host": "\*\*\*REDACTED-[0-9a-f]{6}\*\*\*"\}$/u,
    );
  });

  it('keeps IPv6 forms that are not valid addresses', () => {
    expect(redactText('ctx 1:2:3:4:5:6:7:8:9 and 12:34:56', key)).toBe(
      'ctx 1:2:3:4:5:6:7:8:9 and 12:34:56',
    );
  });

  it('gives an address unlinkable tags under different keys', () => {
    const a = redactText('10.0.0.21', key);
    const b = redactText('10.0.0.21', processRedactionKey);
    expect(a).toMatch(TAG);
    expect(b).toMatch(TAG);
    expect(b).not.toBe(a);
  });
});
