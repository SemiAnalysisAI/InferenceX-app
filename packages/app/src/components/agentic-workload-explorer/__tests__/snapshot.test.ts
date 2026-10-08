import { describe, expect, it } from 'vitest';
import {
  formatSnapshotTime,
  LAST_DAY_LABEL,
  PREV_DAY_LABEL,
  SNAPSHOT_END_CLOCK,
  SNAPSHOT_RANGE_LABEL,
  snapshotNow,
} from '@/lib/agentic-workload-explorer/snapshot';

describe('snapshot helpers', () => {
  it('anchors "now" to the snapshot end, not the wall clock', () => {
    expect(snapshotNow().toISOString()).toBe('2026-09-26T08:07:23.000Z');
  });

  it('formats absolute UTC timestamps', () => {
    expect(formatSnapshotTime('2026-09-25T14:02:59Z')).toBe('Sep 25, 14:02 UTC');
    expect(formatSnapshotTime('2026-06-08T00:05:00Z')).toBe('Jun 8, 00:05 UTC');
  });

  it('labels the snapshot range and its last days', () => {
    expect(SNAPSHOT_RANGE_LABEL).toBe('Jun 8 – Sep 26, 2026');
    expect(SNAPSHOT_END_CLOCK).toBe('08:07 UTC');
    expect(LAST_DAY_LABEL).toBe('Sep 26');
    expect(PREV_DAY_LABEL).toBe('Sep 25');
  });
});
