import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimestamp, formatTime } from '@/lib/agentic-workload-explorer/format';

describe('formatTimestamp', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a date string', () => {
    const result = formatTimestamp('2026-03-15T14:30:00Z');
    // Should contain month and day
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
    // Should have hour:minute format
    expect(result).toMatch(/\d{1,2}:\d{2}/u);
  });

  it('includes timezone name', () => {
    const result = formatTimestamp('2026-01-01T00:00:00Z');
    // Should have some timezone abbreviation (UTC, EST, PST, etc.)
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('formatTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a date string to time only', () => {
    const result = formatTime('2026-03-15T14:30:45Z');
    // Should contain hour:minute:second
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
    // Should have timezone abbreviation at the end
    expect(result.length).toBeGreaterThan(8);
  });
});
