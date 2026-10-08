import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatDuration,
  truncateHash,
  truncateSessionId,
  formatInteractivity,
  formatPrefillSpeed,
  formatPrefillSpeedCompact,
  computePrefillSpeed,
  formatJsonCompact,
} from '@/lib/agentic-workload-explorer/format';

describe('formatNumber', () => {
  it('returns plain number for values under 1000', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(10000)).toBe('10.0K');
    expect(formatNumber(999999)).toBe('1000.0K');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(1000000)).toBe('1.0M');
    expect(formatNumber(2500000)).toBe('2.5M');
    expect(formatNumber(100000000)).toBe('100.0M');
  });

  it('handles decimal inputs', () => {
    expect(formatNumber(1500.7)).toBe('1.5K');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(30000)).toBe('30.0s');
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats minutes', () => {
    expect(formatDuration(60000)).toBe('1.0m');
    expect(formatDuration(90000)).toBe('1.5m');
    expect(formatDuration(3600000)).toBe('60.0m');
  });
});

describe('truncateHash', () => {
  it('truncates to default 8 characters', () => {
    expect(truncateHash('abcdefghijklmnop')).toBe('abcdefgh...');
  });

  it('truncates to custom length', () => {
    expect(truncateHash('abcdefghijklmnop', 4)).toBe('abcd...');
  });

  it('handles short strings', () => {
    expect(truncateHash('abc')).toBe('abc...');
  });

  it('handles empty string', () => {
    expect(truncateHash('')).toBe('...');
  });
});

describe('truncateSessionId', () => {
  it('returns first segment of hyphenated id', () => {
    expect(truncateSessionId('abc123-def-456')).toBe('abc123...');
  });

  it('handles id without hyphens', () => {
    expect(truncateSessionId('nodashes')).toBe('nodashes...');
  });

  it('handles empty string', () => {
    expect(truncateSessionId('')).toBe('...');
  });
});

describe('formatInteractivity', () => {
  it('returns --- for zero tpotMs', () => {
    expect(formatInteractivity(0)).toBe('---');
  });

  it('returns --- for negative tpotMs', () => {
    expect(formatInteractivity(-10)).toBe('---');
  });

  it('converts 100ms TPOT to 10.0 tok/s', () => {
    expect(formatInteractivity(100)).toBe('10.0 output tok/s/user');
  });

  it('converts 50ms TPOT to 20.0 tok/s', () => {
    expect(formatInteractivity(50)).toBe('20.0 output tok/s/user');
  });
});

describe('formatPrefillSpeed', () => {
  it('returns --- for zero', () => {
    expect(formatPrefillSpeed(0)).toBe('---');
  });

  it('returns --- for negative', () => {
    expect(formatPrefillSpeed(-100)).toBe('---');
  });

  it('returns --- for Infinity', () => {
    expect(formatPrefillSpeed(Infinity)).toBe('---');
  });

  it('formats sub-1K values with unit', () => {
    expect(formatPrefillSpeed(500)).toBe('500 input tok/s/query');
  });

  it('formats thousands with K suffix and unit', () => {
    expect(formatPrefillSpeed(1500)).toBe('1.5K input tok/s/query');
  });

  it('formats millions with M suffix and unit', () => {
    expect(formatPrefillSpeed(2_500_000)).toBe('2.5M input tok/s/query');
  });
});

describe('formatPrefillSpeedCompact', () => {
  it('returns --- for zero', () => {
    expect(formatPrefillSpeedCompact(0)).toBe('---');
  });

  it('returns --- for negative', () => {
    expect(formatPrefillSpeedCompact(-50)).toBe('---');
  });

  it('formats sub-1K values without unit', () => {
    expect(formatPrefillSpeedCompact(500)).toBe('500');
  });

  it('formats thousands with K suffix without unit', () => {
    expect(formatPrefillSpeedCompact(1500)).toBe('1.5K');
  });

  it('formats millions with M suffix without unit', () => {
    expect(formatPrefillSpeedCompact(2_500_000)).toBe('2.5M');
  });
});

describe('computePrefillSpeed', () => {
  it('returns null for null ttftMs', () => {
    expect(computePrefillSpeed(100000, 0, null)).toBeNull();
  });

  it('returns null for zero ttftMs', () => {
    expect(computePrefillSpeed(100000, 0, 0)).toBeNull();
  });

  it('returns null for negative ttftMs', () => {
    expect(computePrefillSpeed(100000, 0, -100)).toBeNull();
  });

  it('returns null when total cache is zero', () => {
    expect(computePrefillSpeed(0, 0, 500)).toBeNull();
  });

  it('returns null when cache values are null and zero', () => {
    expect(computePrefillSpeed(null, null, 500)).toBeNull();
  });

  it('computes speed from cacheRead and ttftMs', () => {
    // 100000 tokens / (500ms / 1000) = 200000 tok/s
    expect(computePrefillSpeed(100000, 0, 500)).toBe(200000);
  });

  it('sums cacheRead and cacheWrite', () => {
    // (50000 + 50000) / (500ms / 1000) = 200000 tok/s
    expect(computePrefillSpeed(50000, 50000, 500)).toBe(200000);
  });
});

describe('formatJsonCompact', () => {
  it('formats a simple object with standard indent', () => {
    const obj = { foo: 'bar', num: 42 };
    expect(formatJsonCompact(obj)).toBe(JSON.stringify(obj, null, 2));
  });

  it('collapses hash_ids array to single line', () => {
    const obj = { hash_ids: ['abc123', 'def456', 'ghi789'] };
    const result = formatJsonCompact(obj);
    expect(result).toContain('"hash_ids": ["abc123", "def456", "ghi789"]');
    // Should NOT have newlines inside the hash_ids array
    const hashIdsMatch = result.match(/"hash_ids":\s*\[.*\]/u);
    expect(hashIdsMatch).toBeTruthy();
    expect(hashIdsMatch![0]).not.toContain('\n');
  });

  it('preserves other arrays normally', () => {
    const obj = { items: [1, 2, 3] };
    const result = formatJsonCompact(obj);
    // Standard JSON.stringify expands arrays vertically
    expect(result).toBe(JSON.stringify(obj, null, 2));
  });
});
