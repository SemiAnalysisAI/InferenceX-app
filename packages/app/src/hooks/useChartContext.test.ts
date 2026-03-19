import { describe, it, expect } from 'vitest';

import { reconcileActiveSet } from '@/hooks/useChartContext';

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
