import { describe, expect, it } from 'vitest';

import { readableLogText } from './log-text';

describe('readableLogText', () => {
  it('removes ANSI color and OSC title sequences', () => {
    expect(readableLogText('\u001B[1;33mwarning\u001B[0m\n\u001B]0;worker-1\u0007ready')).toBe(
      'warning\nready',
    );
  });

  it('normalizes carriage-return line endings without changing tabs', () => {
    expect(readableLogText('one\r\ntwo\rthree\tvalue')).toBe('one\ntwo\nthree\tvalue');
  });
});
