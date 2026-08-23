import { describe, it, expect } from 'vitest';

import { reconcileActiveSet, resolveAvailableSelection } from '@/hooks/useChartContext';

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

describe('resolveAvailableSelection', () => {
  it('waits through transient empty data without consuming URL intent', () => {
    const active = new Set(['h100']);
    const result = resolveAvailableSelection({
      active,
      available: new Set(),
      pending: new Set(['b200']),
      scopeChanged: true,
      settled: false,
    });
    expect(result).toEqual({ selection: active, consumedPending: false });
  });

  it('restores the valid part of pending URL intent once data settles', () => {
    const result = resolveAvailableSelection({
      active: new Set(),
      available: new Set(['h100', 'b200']),
      pending: new Set(['b200', 'removed']),
      scopeChanged: true,
      settled: true,
    });
    expect(result.selection).toEqual(new Set(['b200']));
    expect(result.consumedPending).toBe(true);
  });

  it('defaults a new scope to all available items', () => {
    const available = new Set(['h100', 'b200']);
    const result = resolveAvailableSelection({
      active: new Set(['old']),
      available,
      scopeChanged: true,
      settled: true,
    });
    expect(result.selection).toBe(available);
  });

  it('preserves a deliberate empty selection inside the same scope', () => {
    const active = new Set<string>();
    const result = resolveAvailableSelection({
      active,
      available: new Set(['h100', 'b200']),
      scopeChanged: false,
      settled: true,
    });
    expect(result.selection).toBe(active);
  });

  it('clears stale items for a settled empty scope', () => {
    const result = resolveAvailableSelection({
      active: new Set(['h100']),
      available: new Set(),
      scopeChanged: false,
      settled: true,
    });
    expect(result.selection).toEqual(new Set());
  });
});
