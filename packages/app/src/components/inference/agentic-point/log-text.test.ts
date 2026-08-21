import { describe, expect, it } from 'vitest';

import {
  buildLogLines,
  isNearLogBottom,
  logLineSeverity,
  readableLogText,
  utf16IndexAtCodePointOffset,
} from './log-text';

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

describe('logLineSeverity', () => {
  it('classifies conventional uppercase level tokens', () => {
    expect(logLineSeverity('ERROR 2026-06-12 engine iteration timed out')).toBe('error');
    expect(logLineSeverity('Traceback (most recent call last)')).toBe('error');
    expect(logLineSeverity('WARNING [scheduler.py:1120] preempted')).toBe('warn');
    expect(logLineSeverity('DEBUG [loggers.py:12] step=1')).toBe('debug');
    expect(logLineSeverity('INFO [api_server.py:1421] ready')).toBe('info');
  });

  it('ignores level words that only appear far into a long line', () => {
    expect(logLineSeverity(`INFO ${'x'.repeat(400)} ERROR`)).toBe('info');
  });
});

describe('buildLogLines', () => {
  it('splits plain text into lines without a trailing empty line', () => {
    const lines = buildLogLines([{ text: 'INFO one\nWARNING two\n', highlighted: false }]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      text: 'INFO one',
      pieces: [{ text: 'INFO one', highlighted: false }],
      severity: 'info',
    });
    expect(lines[1]?.severity).toBe('warn');
  });

  it('keeps a mid-line highlight inside the line it starts on', () => {
    const lines = buildLogLines([
      { text: 'INFO before ', highlighted: false },
      { text: 'router ready', highlighted: true },
      { text: ' after\nnext line', highlighted: false },
    ]);
    expect(lines).toHaveLength(2);
    // `text` rejoins the pieces, so the memoized plain-row path and the
    // per-piece highlight path always render the same characters.
    expect(lines[0]?.text).toBe('INFO before router ready after');
    expect(lines[0]?.pieces).toEqual([
      { text: 'INFO before ', highlighted: false },
      { text: 'router ready', highlighted: true },
      { text: ' after', highlighted: false },
    ]);
    expect(lines[1]?.pieces).toEqual([{ text: 'next line', highlighted: false }]);
  });

  it('preserves blank lines and an empty highlight so the jump target renders', () => {
    expect(buildLogLines([{ text: 'a\n\nb', highlighted: false }])).toHaveLength(3);
    const empty = buildLogLines([{ text: '', highlighted: true }]);
    expect(empty[0]?.pieces).toEqual([{ text: '', highlighted: true }]);
  });
});
