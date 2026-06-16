import { describe, expect, it } from 'vitest';

import {
  buildRunNumbering,
  comparisonEntryDate,
  comparisonEntryLabel,
  comparisonEntrySortValue,
  isRunComparisonEntry,
  makeRunComparisonEntry,
  parseComparisonEntry,
  resolveComparisonEntries,
} from './comparisonEntry';

describe('comparisonEntry', () => {
  const runEntry = makeRunComparisonEntry('2026-06-14', '27489075807');

  it('round-trips a run entry through make/parse', () => {
    expect(runEntry).toBe('2026-06-14~r27489075807');
    expect(parseComparisonEntry(runEntry)).toEqual({
      raw: runEntry,
      date: '2026-06-14',
      runId: '27489075807',
    });
  });

  it('parses the legacy baked-index form, ignoring the index', () => {
    const legacy = '2026-06-14~r27489075807~3of3';
    expect(isRunComparisonEntry(legacy)).toBe(true);
    expect(parseComparisonEntry(legacy)).toEqual({
      raw: legacy,
      date: '2026-06-14',
      runId: '27489075807',
    });
  });

  it('treats a plain date as a non-run entry', () => {
    expect(parseComparisonEntry('2026-06-14')).toEqual({ raw: '2026-06-14', date: '2026-06-14' });
    expect(isRunComparisonEntry('2026-06-14')).toBe(false);
    expect(comparisonEntryDate(runEntry)).toBe('2026-06-14');
  });

  it('numbers run entries sequentially in chronological order, gap-free', () => {
    // Two non-adjacent run ids (e.g. skipping a same-day MTP run) must still be #1, #2.
    const a = makeRunComparisonEntry('2026-06-14', '27485974465'); // earlier
    const b = makeRunComparisonEntry('2026-06-14', '27489075807'); // later
    const numbering = buildRunNumbering(['2026-06-13', b, a]);
    expect(numbering.get(a)).toBe(1);
    expect(numbering.get(b)).toBe(2);
    expect(numbering.has('2026-06-13')).toBe(false); // plain dates unnumbered
  });

  it('labels run entries with their sequential number and plain dates as-is', () => {
    const a = makeRunComparisonEntry('2026-06-14', '27485974465');
    const numbering = buildRunNumbering([a]);
    expect(comparisonEntryLabel(a, numbering)).toBe('2026-06-14 #1');
    expect(comparisonEntryLabel('2026-06-14', numbering)).toBe('2026-06-14');
    expect(comparisonEntryLabel(a)).toBe('2026-06-14'); // no numbering → bare date
  });

  it('sorts by date then run id (plain date first within a day)', () => {
    const later = makeRunComparisonEntry('2026-06-14', '300');
    const earlier = makeRunComparisonEntry('2026-06-14', '100');
    const sorted = ['2026-06-13', later, earlier, '2026-06-14'].toSorted((a, b) => {
      const [ta, ia] = comparisonEntrySortValue(a);
      const [tb, ib] = comparisonEntrySortValue(b);
      return ta - tb || ia - ib;
    });
    expect(sorted).toEqual(['2026-06-13', '2026-06-14', earlier, later]);
  });

  describe('resolveComparisonEntries', () => {
    const range = { startDate: '2026-06-13', endDate: '2026-06-14' };

    it('keeps both range endpoints when no run entries overlap', () => {
      expect(resolveComparisonEntries([], range)).toEqual(['2026-06-13', '2026-06-14']);
    });

    it('drops a range endpoint whose date has specific run entries', () => {
      const r1 = makeRunComparisonEntry('2026-06-14', '100');
      const r2 = makeRunComparisonEntry('2026-06-14', '200');
      // 2026-06-14 endpoint dropped (runs cover it); 2026-06-13 endpoint kept.
      expect(resolveComparisonEntries([r1, r2], range)).toEqual(['2026-06-13', r1, r2]);
    });

    it('returns just the added entries when no range is set', () => {
      const r1 = makeRunComparisonEntry('2026-06-14', '100');
      expect(resolveComparisonEntries([r1], { startDate: '', endDate: '' })).toEqual([r1]);
    });
  });

  it('contains no characters that break a CSS class selector', () => {
    expect(runEntry).not.toMatch(/[.#\s]/u);
  });
});
