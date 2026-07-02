import { describe, it, expect } from 'vitest';

import { reconcileActiveSet, serializeActiveSet, parseActiveParam } from '@/hooks/useChartContext';

describe('reconcileActiveSet', () => {
  it('initializes with all available items when no previous selection', () => {
    const available = new Set(['h100', 'a100', 'b200']);
    const result = reconcileActiveSet(new Set(), available, true);
    expect(result).toBe(available);
  });

  it('preserves selection (same reference) when all items still available', () => {
    const prev = new Set(['h100', 'a100']);
    const available = new Set(['h100', 'a100', 'b200']);
    expect(reconcileActiveSet(prev, available, true)).toBe(prev);
  });

  it('removes items no longer in available set', () => {
    const prev = new Set(['h100', 'a100', 'b200']);
    const available = new Set(['h100', 'b200']);
    expect(reconcileActiveSet(prev, available, true)).toEqual(new Set(['h100', 'b200']));
  });

  it('resets to all available when entire selection gone and resetOnChange=true', () => {
    const available = new Set(['h100', 'b200']);
    const result = reconcileActiveSet(new Set(['removed-gpu']), available, true);
    expect(result).toBe(available);
  });

  it('returns empty set when entire selection gone and resetOnChange=false', () => {
    const available = new Set(['h100', 'b200']);
    const result = reconcileActiveSet(new Set(['removed-gpu']), available, false);
    expect(result).toEqual(new Set());
  });
});

// ===========================================================================
// serializeActiveSet — extracted from the eActiveStr / rActiveStr memos in
// EvaluationContext + ReliabilityContext. Produces the `e_active` / `r_active`
// URL value; must return '' when the active set is the implicit "all visible".
// ===========================================================================
describe('serializeActiveSet', () => {
  it('returns empty string for an empty active set', () => {
    expect(serializeActiveSet(new Set(), new Set(['a', 'b']))).toBe('');
  });

  it('returns empty string when active exactly equals itemsWithData (all visible)', () => {
    const items = new Set(['h100', 'a100', 'b200']);
    expect(serializeActiveSet(new Set(['h100', 'a100', 'b200']), items)).toBe('');
  });

  it('returns empty string regardless of insertion order when sets match', () => {
    const items = new Set(['a100', 'b200', 'h100']);
    expect(serializeActiveSet(new Set(['h100', 'b200', 'a100']), items)).toBe('');
  });

  it('serializes a sorted, comma-joined subset', () => {
    const items = new Set(['h100', 'a100', 'b200']);
    expect(serializeActiveSet(new Set(['b200', 'a100']), items)).toBe('a100,b200');
  });

  it('serializes a single-item selection', () => {
    const items = new Set(['h100', 'a100', 'b200']);
    expect(serializeActiveSet(new Set(['h100']), items)).toBe('h100');
  });

  it('serializes when sizes match but members differ (not the all-visible case)', () => {
    // Same size as itemsWithData but a different member → not "all visible".
    const items = new Set(['h100', 'a100', 'b200']);
    expect(serializeActiveSet(new Set(['h100', 'a100', 'x999']), items)).toBe('a100,h100,x999');
  });

  it('serializes when active is larger than itemsWithData', () => {
    const items = new Set(['h100']);
    expect(serializeActiveSet(new Set(['h100', 'a100']), items)).toBe('a100,h100');
  });
});

// ===========================================================================
// parseActiveParam — extracted from the pendingActive URL initializer. Parses
// the `e_active` / `r_active` param into a Set, using null as the "no pending
// restore" sentinel.
// ===========================================================================
describe('parseActiveParam', () => {
  it('returns null for undefined', () => {
    expect(parseActiveParam(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseActiveParam('')).toBeNull();
  });

  it('returns null when the value is only separators (no real items)', () => {
    expect(parseActiveParam(',,')).toBeNull();
  });

  it('parses a comma-separated list into a Set', () => {
    expect(parseActiveParam('h100,a100')).toEqual(new Set(['h100', 'a100']));
  });

  it('drops empty segments from trailing/leading/double commas', () => {
    expect(parseActiveParam('h100,,a100,')).toEqual(new Set(['h100', 'a100']));
  });

  it('parses a single item', () => {
    expect(parseActiveParam('b200')).toEqual(new Set(['b200']));
  });

  it('round-trips with serializeActiveSet for a subset selection', () => {
    const items = new Set(['h100', 'a100', 'b200']);
    const active = new Set(['b200', 'a100']);
    const serialized = serializeActiveSet(active, items);
    expect(parseActiveParam(serialized)).toEqual(active);
  });

  it('round-trips the all-visible case to null (empty serialization)', () => {
    const items = new Set(['h100', 'a100']);
    const serialized = serializeActiveSet(new Set(['h100', 'a100']), items);
    expect(serialized).toBe('');
    expect(parseActiveParam(serialized)).toBeNull();
  });
});
