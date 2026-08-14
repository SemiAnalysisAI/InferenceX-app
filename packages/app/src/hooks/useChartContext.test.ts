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

  it('never re-widens, so a shrink-then-grow round trip loses the pruned keys', () => {
    // Why InferenceContext must not hand this function a metric-filtered set:
    // selecting a Measured Energy axis drops the configs without telemetry,
    // and switching back cannot bring them back — with every survivor still
    // available, reconcile returns the shrunken set unchanged.
    const full = new Set(['b200_sglang', 'b200_vllm', 'h200_sglang']);
    const withTelemetry = new Set(['b200_sglang']);

    const pruned = reconcileActiveSet(full, withTelemetry, true);
    expect(pruned).toEqual(new Set(['b200_sglang']));

    expect(reconcileActiveSet(pruned, full, true)).toBe(pruned);
  });
});
