import { describe, expect, it } from 'vitest';

import { isNearLogBottom, readableLogText, utf16IndexAtCodePointOffset } from './log-text';

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

describe('utf16IndexAtCodePointOffset', () => {
  it('maps database character offsets across non-BMP characters', () => {
    const value = 'before 🚀 match';
    expect(utf16IndexAtCodePointOffset(value, 9)).toBe(10);
    expect(value.slice(utf16IndexAtCodePointOffset(value, 9)!)).toBe('match');
  });

  it('accepts the end boundary and rejects invalid or out-of-range offsets', () => {
    expect(utf16IndexAtCodePointOffset('a🚀', 2)).toBe(3);
    expect(utf16IndexAtCodePointOffset('a🚀', 3)).toBeNull();
    expect(utf16IndexAtCodePointOffset('text', -1)).toBeNull();
  });
});

describe('isNearLogBottom', () => {
  it('does not auto-load an unscrollable log with one very long line', () => {
    expect(isNearLogBottom({ scrollTop: 0, clientHeight: 448, scrollHeight: 448 })).toBe(false);
  });

  it('loads only after a vertically overflowing viewport is scrolled near the bottom', () => {
    expect(isNearLogBottom({ scrollTop: 100, clientHeight: 448, scrollHeight: 1_000 })).toBe(false);
    expect(isNearLogBottom({ scrollTop: 500, clientHeight: 448, scrollHeight: 1_000 })).toBe(true);
  });
});
