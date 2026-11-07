import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatExplorerDateTime,
  formatTime,
  formatTimestamp,
} from '@/lib/agentic-workload-explorer/format';

describe('formatTimestamp', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a date string', () => {
    const result = formatTimestamp('2026-03-15T14:30:00Z');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  it('formats a Date object', () => {
    const result = formatTimestamp(new Date('2026-12-25T08:00:00Z'));
    expect(result).toContain('Dec');
    expect(result).toContain('25');
  });

  it('includes time components', () => {
    const result = formatTimestamp('2026-06-01T00:00:00Z');
    expect(result).toMatch(/\d{1,2}:\d{2}/u);
  });

  it('includes timezone name', () => {
    const result = formatTimestamp('2026-01-01T00:00:00Z');
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('formatTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a date string to time only', () => {
    const result = formatTime('2026-03-15T14:30:45Z');
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/u);
  });

  it('formats a Date object', () => {
    const result = formatTime(new Date('2026-06-01T09:15:30Z'));
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/u);
  });

  it('includes seconds', () => {
    const result = formatTime('2026-01-01T12:00:30Z');
    expect(result).toMatch(/:\d{2}\s/u);
  });

  it('includes timezone name', () => {
    const result = formatTime('2026-01-01T00:00:00Z');
    expect(result.length).toBeGreaterThan(8);
  });
});

describe('formatExplorerDateTime', () => {
  const noonUtc = '2026-09-25T12:05:30Z';
  const hourly: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short',
  };

  it('passes English through to en-US formatting unchanged', () => {
    expect(formatExplorerDateTime(noonUtc, 'en', hourly)).toBe(
      new Date(noonUtc).toLocaleString('en-US', hourly),
    );
  });

  it('uses a zero-padded 24-hour clock and the English zone label in zh', () => {
    expect(formatExplorerDateTime(noonUtc, 'zh', hourly)).toBe('9月25日 12:00 UTC');
    expect(
      formatExplorerDateTime('2026-09-26T02:38:16Z', 'zh', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      }),
    ).toBe('02:38:16 UTC');
  });

  it('writes compact month/day for zh axis ticks', () => {
    expect(formatExplorerDateTime(noonUtc, 'zh', hourly, { axisTick: true })).toBe(
      '9/25 12:00 UTC',
    );
  });
});
