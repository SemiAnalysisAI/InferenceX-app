import { describe, it, expect } from 'vitest';

import {
  reconcileActiveSet,
  reconcileRememberingHidden,
  resolveAvailableSelection,
} from '@/hooks/useChartContext';

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
    const full = new Set(['b200_sglang', 'b200_vllm', 'h200_sglang']);
    const withTelemetry = new Set(['b200_sglang']);

    const pruned = reconcileActiveSet(full, withTelemetry, true);
    expect(pruned).toEqual(new Set(['b200_sglang']));

    expect(reconcileActiveSet(pruned, full, true)).toBe(pruned);
  });
});

describe('reconcileRememberingHidden', () => {
  const oct17 = new Set(['gb300', 'h200', 'tpuv7', 'mi355x']);
  const oct15 = new Set(['gb300', 'h200', 'mi355x']);

  it('restores a picked key when it regains data after a date without it', () => {
    const picked = new Set(['gb300', 'tpuv7', 'mi355x']);
    const onOct15 = reconcileRememberingHidden(picked, null, oct15, true);
    expect(onOct15.selection).toEqual(new Set(['gb300', 'mi355x']));

    const backOnOct17 = reconcileRememberingHidden(onOct15.selection, onOct15, oct17, true);
    expect(backOnOct17.selection).toEqual(picked);
  });

  it('keeps remembering across several dates without the key', () => {
    const picked = new Set(['gb300', 'tpuv7']);
    const first = reconcileRememberingHidden(picked, null, oct15, true);
    const second = reconcileRememberingHidden(first.selection, first, new Set(['gb300']), true);
    const back = reconcileRememberingHidden(second.selection, second, oct17, true);
    expect(back.selection).toEqual(picked);
  });

  it('does not restore a key once the reader changes the selection in between', () => {
    const onOct15 = reconcileRememberingHidden(new Set(['gb300', 'tpuv7']), null, oct15, true);
    const readerPick = new Set(['h200']);
    const back = reconcileRememberingHidden(readerPick, onOct15, oct17, true);
    expect(back.selection).toEqual(readerPick);
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
