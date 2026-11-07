import { describe, expect, it } from 'vitest';
import {
  formatSnapshotTime,
  lastDayLabel,
  prevDayLabel,
  SNAPSHOT_END_CLOCK,
  snapshotNow,
  snapshotRangeLabel,
} from '@/lib/agentic-workload-explorer/snapshot';

describe('snapshot helpers', () => {
  it('anchors "now" to the snapshot end, not the wall clock', () => {
    expect(snapshotNow().toISOString()).toBe('2026-09-26T08:07:23.000Z');
  });

  it('formats absolute UTC timestamps', () => {
    expect(formatSnapshotTime('2026-09-25T14:02:59Z')).toBe('Sep 25, 14:02 UTC');
    expect(formatSnapshotTime('2026-06-08T00:05:00Z')).toBe('Jun 8, 00:05 UTC');
    expect(formatSnapshotTime('2026-09-25T14:02:59Z', 'zh')).toBe('9月25日 14:02 UTC');
  });

  it('labels the snapshot range and its last days', () => {
    expect(snapshotRangeLabel()).toBe('Jun 8 – Sep 26, 2026');
    expect(snapshotRangeLabel('zh')).toBe('6月8日 – 2026年9月26日');
    expect(SNAPSHOT_END_CLOCK).toBe('08:07 UTC');
    expect(lastDayLabel()).toBe('Sep 26');
    expect(prevDayLabel()).toBe('Sep 25');
    expect(lastDayLabel('zh')).toBe('9月26日');
  });
});
