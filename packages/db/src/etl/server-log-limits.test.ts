import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_SERVER_LOG_FILE_BYTES,
  capServerLogText,
  maxServerLogFileBytes,
} from './server-log-limits';

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

describe('maxServerLogFileBytes', () => {
  it('defaults to 128 MiB', () => {
    expect(maxServerLogFileBytes({})).toBe(DEFAULT_MAX_SERVER_LOG_FILE_BYTES);
    expect(DEFAULT_MAX_SERVER_LOG_FILE_BYTES).toBe(128 * 1024 * 1024);
  });

  it('accepts a valid override and ignores invalid or tiny ones', () => {
    expect(maxServerLogFileBytes({ SERVER_LOG_MAX_FILE_BYTES: '1048576' })).toBe(1048576);
    expect(maxServerLogFileBytes({ SERVER_LOG_MAX_FILE_BYTES: 'abc' })).toBe(
      DEFAULT_MAX_SERVER_LOG_FILE_BYTES,
    );
    expect(maxServerLogFileBytes({ SERVER_LOG_MAX_FILE_BYTES: '100' })).toBe(
      DEFAULT_MAX_SERVER_LOG_FILE_BYTES,
    );
  });
});

describe('capServerLogText', () => {
  it('returns text within budget unchanged', () => {
    const text = 'line\n'.repeat(1000);
    const capped = capServerLogText(text, 1024 * 1024);
    expect(capped.truncated).toBe(false);
    expect(capped.text).toBe(text);
  });

  it('keeps head and tail on line boundaries within the byte budget', () => {
    const lines = Array.from({ length: 200_000 }, (_, i) => `decode step ${i} ok`);
    const text = `${lines.join('\n')}\n`;
    const maxBytes = 256 * 1024;
    const capped = capServerLogText(text, maxBytes);

    expect(capped.truncated).toBe(true);
    expect(capped.originalBytes).toBe(bytes(text));
    expect(bytes(capped.text)).toBeLessThanOrEqual(maxBytes);
    expect(capped.storedBytes).toBe(bytes(capped.text));
    expect(capped.text.startsWith('decode step 0 ok\n')).toBe(true);
    expect(capped.text.endsWith('decode step 199999 ok\n')).toBe(true);
    expect(capped.text).toContain('[InferenceX ingest truncated this log');

    const [head, tail] = capped.text.split(/\n\n\[InferenceX ingest truncated[^\]]*\]\n\n/u);
    expect(head.endsWith('ok\n')).toBe(true);
    expect(tail.startsWith('decode step ')).toBe(true);
  });

  it('respects the byte budget for multi-byte text', () => {
    const text = '日志行✓\n'.repeat(100_000);
    const maxBytes = 128 * 1024;
    const capped = capServerLogText(text, maxBytes);
    expect(capped.truncated).toBe(true);
    expect(bytes(capped.text)).toBeLessThanOrEqual(maxBytes);
    expect(capped.text).not.toContain('\uFFFD');
  });

  it('caps text without newlines', () => {
    const text = 'x'.repeat(1024 * 1024);
    const capped = capServerLogText(text, 128 * 1024);
    expect(capped.truncated).toBe(true);
    expect(bytes(capped.text)).toBeLessThanOrEqual(128 * 1024);
  });
});
