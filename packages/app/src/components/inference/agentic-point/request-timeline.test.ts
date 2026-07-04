import { describe, expect, it } from 'vitest';

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

import {
  buildRequestTimelineRows,
  computeStableRowIndex,
  conversationHref,
  parseTimelineViewSnapshot,
  requestIdleStats,
  splitTimelineCid,
  type TimelineViewSnapshot,
} from './request-timeline';

const request = (start: number, end: number): RequestRecord => ({
  cid: 'conversation',
  ti: start,
  wid: 'worker',
  ad: 0,
  phase: 'profiling',
  credit: start,
  start,
  ack: null,
  end,
  ttftMs: null,
  tpotMs: null,
  isl: null,
  osl: null,
  cancelled: false,
});

describe('requestIdleStats', () => {
  it('sums only gaps where no requests overlap', () => {
    expect(
      requestIdleStats([
        request(0, 10),
        request(5, 20),
        request(30, 40),
        request(35, 50),
        request(70, 80),
      ]),
    ).toEqual({ idleNs: 30, spanNs: 80 });
  });

  it('handles unsorted and nested requests without double-counting busy time', () => {
    expect(requestIdleStats([request(20, 30), request(0, 100), request(10, 40)])).toEqual({
      idleNs: 0,
      spanNs: 100,
    });
  });

  it('does not count time before the first start or after the final end', () => {
    expect(requestIdleStats([request(100, 200), request(300, 400)])).toEqual({
      idleNs: 100,
      spanNs: 300,
    });
  });

  it('returns zeroes for an empty timeline', () => {
    expect(requestIdleStats([])).toEqual({ idleNs: 0, spanNs: 0 });
  });
});

describe('subagent timeline hierarchy', () => {
  it('parses aux lanes separately from their parent subagent id', () => {
    expect(splitTimelineCid('conv::sa:subagent_001_abcd:aux:011')).toEqual({
      parent: 'conv',
      subagentBase: 'subagent_001_abcd',
      stream: null,
      aux: '011',
    });
  });

  it('renders aux requests as always-visible children of their subagent', () => {
    const records = [
      { ...request(0, 10), cid: 'conv' },
      { ...request(10, 30), cid: 'conv::sa:subagent_001_abcd' },
      { ...request(12, 20), cid: 'conv::sa:subagent_001_abcd:aux:011' },
      { ...request(14, 24), cid: 'conv::sa:subagent_001_abcd:aux:012' },
      { ...request(40, 50), cid: 'conv::sa:subagent_002_ef01' },
    ];

    const rows = buildRequestTimelineRows(records, 'conversation', new Set());
    expect(rows.map(({ kind, depth }) => ({ kind, depth }))).toEqual([
      { kind: 'parent', depth: 0 },
      { kind: 'subagent', depth: 1 },
      { kind: 'aux', depth: 2 },
      { kind: 'aux', depth: 2 },
      { kind: 'subagent', depth: 1 },
    ]);
    expect(rows[1]!.requests.map((record) => record.cid)).toEqual(['conv::sa:subagent_001_abcd']);
    expect(rows[1]!.auxCount).toBe(2);
    expect(rows[2]!.label).toBe('aux 011 · parallel');
    expect(rows[3]!.label).toBe('aux 012 · parallel');
  });

  it('keeps aux lanes visible while primary streams remain collapsed', () => {
    const records = [
      { ...request(10, 20), cid: 'conv::sa:subagent_001_abcd:s0' },
      { ...request(12, 22), cid: 'conv::sa:subagent_001_abcd:s1' },
      { ...request(14, 18), cid: 'conv::sa:subagent_001_abcd:aux:001' },
    ];

    const rows = buildRequestTimelineRows(records, 'conversation', new Set());
    expect(rows.map((row) => row.kind)).toEqual(['parent', 'subagent', 'aux']);
    expect(rows[1]!.requests).toHaveLength(2);
    expect(rows[2]!.requests).toHaveLength(1);
  });

  it('parses aux lanes hanging directly off the main conversation', () => {
    expect(splitTimelineCid('conv::aux:000')).toEqual({
      parent: 'conv',
      subagentBase: null,
      stream: null,
      aux: '000',
    });
    expect(splitTimelineCid('conv::aux:red:002')).toEqual({
      parent: 'conv',
      subagentBase: null,
      stream: null,
      aux: 'red:002',
    });
    expect(splitTimelineCid('conv::sa:subagent_001_abcd:aux:red:002')).toEqual({
      parent: 'conv',
      subagentBase: 'subagent_001_abcd',
      stream: null,
      aux: 'red:002',
    });
  });

  it('nests main-agent aux lanes under the parent conversation row', () => {
    const records = [
      { ...request(0, 10), cid: 'conv' },
      { ...request(2, 8), cid: 'conv::aux:001' },
      { ...request(4, 12), cid: 'conv::aux:red:002' },
      { ...request(20, 30), cid: 'conv::sa:subagent_001_abcd' },
    ];

    const rows = buildRequestTimelineRows(records, 'conversation', new Set());
    expect(rows.map(({ kind, depth }) => ({ kind, depth }))).toEqual([
      { kind: 'parent', depth: 0 },
      { kind: 'aux', depth: 1 },
      { kind: 'aux', depth: 1 },
      { kind: 'subagent', depth: 1 },
    ]);
    expect(rows[0]!.requests.map((record) => record.cid)).toEqual(['conv']);
    expect(rows[1]!.label).toBe('aux 001 · parallel');
    expect(rows[1]!.parentRowKey).toBe('conv');
    expect(rows[2]!.label).toBe('aux red:002 · parallel');
    // Aux lanes inherit the parent conversation's color.
    expect(rows[1]!.color).toBe(rows[0]!.color);
    expect(rows[2]!.color).toBe(rows[0]!.color);
  });

  it('groups main-agent aux requests with their parent for stable order/color', () => {
    const records = [
      { ...request(50, 60), cid: 'other' },
      { ...request(0, 10), cid: 'conv::aux:000' },
      { ...request(5, 15), cid: 'conv' },
    ];
    const index = computeStableRowIndex(records, 'conversation');
    // 'conv' groups with its aux lane (earliest start 0) and sorts before 'other'.
    expect([...index.keys()].toSorted()).toEqual(['conv', 'other']);
    expect(index.get('conv')).toBe(0);
    expect(index.get('other')).toBe(1);
  });

  it('deep-links a main-agent aux request to the parent conversation without sa', () => {
    expect(conversationHref('slug', { ...request(0, 10), cid: 'abc123::aux:red:002', ti: 3 })).toBe(
      '/datasets/slug/conversations/abc123?turn=3',
    );
  });
});

describe('conversationHref', () => {
  it('builds a turn-carrying dataset link for a main-conversation request', () => {
    expect(
      conversationHref('cc-traces-weka-062126', { ...request(0, 10), cid: 'abc123', ti: 4 }),
    ).toBe('/datasets/cc-traces-weka-062126/conversations/abc123?turn=4');
  });

  it('carries the subagent id and strips the ::sa suffix from the conv id', () => {
    expect(
      conversationHref('slug', {
        ...request(0, 10),
        cid: 'abc123::sa:subagent_001_bf1c5c16:s2',
        ti: 7,
      }),
    ).toBe('/datasets/slug/conversations/abc123?turn=7&sa=subagent_001_bf1c5c16');
  });

  it('uses raw source provenance for flattened-agent dataset links', () => {
    expect(
      conversationHref('slug', {
        ...request(0, 10),
        cid: '02bc0afb13f7a2d9efa86c28511261d85c0e::fa:003',
        ti: 3,
        srcTrace: '02bc0afb13f7a2d9efa86c28511261d85c0e',
        srcOuter: 204,
        srcKind: 'weka_flat',
      }),
    ).toBe('/datasets/slug/conversations/02bc0afb13f7a2d9efa86c28511261d85c0e?turn=3&raw=204');
  });

  it('uses raw nested source provenance for subagent child links', () => {
    expect(
      conversationHref('slug', {
        ...request(0, 10),
        cid: '117ebe75819d050f308a0a81647893abd02d::sa:subagent_010_32ee2daa',
        ti: 16,
        srcTrace: '117ebe75819d050f308a0a81647893abd02d',
        srcOuter: 39,
        srcInner: 16,
        srcKind: 'weka_subagent',
      }),
    ).toBe(
      '/datasets/slug/conversations/117ebe75819d050f308a0a81647893abd02d?turn=16&raw=39&inner=16',
    );
  });
});

describe('stable row order + color across phase filters', () => {
  // Same conversations appear in both warmup and profiling. Their global
  // first-start order is A (0) < B (10) < C (only profiling, 50). The bug:
  // filtering to a phase re-sorted + re-colored by the visible subset, so a
  // conversation jumped rows and swapped color when toggling phases.
  const rec = (
    cid: string,
    phase: RequestRecord['phase'],
    start: number,
    end: number,
  ): RequestRecord => ({ ...request(start, end), cid, phase });
  const full: RequestRecord[] = [
    rec('A', 'warmup', 0, 5),
    rec('A', 'profiling', 100, 110),
    rec('B', 'warmup', 10, 15),
    rec('B', 'profiling', 120, 130),
    rec('C', 'profiling', 50, 60), // profiling-only; earliest profiling start
  ];

  it('keeps each conversation in the same position and color when the phase changes', () => {
    const index = computeStableRowIndex(full, 'conversation');
    const warmupRows = buildRequestTimelineRows(
      full.filter((r) => r.phase === 'warmup'),
      'conversation',
      new Set(),
      index,
    ).filter((r) => r.kind === 'parent');
    const profilingRows = buildRequestTimelineRows(
      full.filter((r) => r.phase === 'profiling'),
      'conversation',
      new Set(),
      index,
    ).filter((r) => r.kind === 'parent');

    // Position: A before B in both phases (C only shows in profiling, and sorts
    // after A/B by its global index — NOT first by its earlier profiling start).
    expect(warmupRows.map((r) => r.label)).toEqual(['A', 'B']);
    expect(profilingRows.map((r) => r.label)).toEqual(['A', 'B', 'C']);

    // Color: identical per conversation across phases, distinct between them.
    const warmupColors = Object.fromEntries(warmupRows.map((r) => [r.label, r.color]));
    const profilingColors = Object.fromEntries(profilingRows.map((r) => [r.label, r.color]));
    expect(warmupColors.A).toBe(profilingColors.A);
    expect(warmupColors.B).toBe(profilingColors.B);
    expect(warmupColors.A).not.toBe(warmupColors.B);
  });

  it('phase-spanning conversations occupy the same ABSOLUTE row in both phase views', () => {
    // Warmup-only conversations start earliest — under a plain global-start
    // ordering they'd sit above the shared ones in the warmup view but be
    // absent from the profiling view, sliding every shared row up when the
    // toggle flips. Spanning conversations must sort first so the leading block
    // is identical in both views and a carried-over conversation never moves.
    const data: RequestRecord[] = [
      rec('W1', 'warmup', 0, 2),
      rec('W2', 'warmup', 3, 4),
      rec('A', 'warmup', 5, 8),
      rec('A', 'profiling', 100, 110),
      rec('B', 'warmup', 10, 15),
      rec('B', 'profiling', 120, 130),
      rec('P', 'profiling', 50, 60),
    ];
    const index = computeStableRowIndex(data, 'conversation');
    const parentLabels = (phase: RequestRecord['phase']) =>
      buildRequestTimelineRows(
        data.filter((r) => r.phase === phase),
        'conversation',
        new Set(),
        index,
      )
        .filter((r) => r.kind === 'parent')
        .map((r) => r.label);
    // Shared block [A, B] leads both views at rows 0 and 1; phase-unique
    // conversations fill in below.
    expect(parentLabels('warmup')).toEqual(['A', 'B', 'W1', 'W2']);
    expect(parentLabels('profiling')).toEqual(['A', 'B', 'P']);
  });

  it('without a shared index, the same subset re-sorts by its own start times (regression guard)', () => {
    // Sanity: the legacy self-contained path (no index arg) orders by the
    // subset's own first-start, which is exactly why the shared index is needed.
    const profilingOnly = buildRequestTimelineRows(
      full.filter((r) => r.phase === 'profiling'),
      'conversation',
      new Set(),
    ).filter((r) => r.kind === 'parent');
    // C (start 50) sorts first here, ahead of A (100) and B (120).
    expect(profilingOnly.map((r) => r.label)).toEqual(['C', 'A', 'B']);
  });
});

describe('parseTimelineViewSnapshot', () => {
  const full: TimelineViewSnapshot = {
    viewStart: 1_000,
    viewEnd: 5_000,
    rowMode: 'worker',
    phaseFilter: 'warmup',
    expanded: ['conv::sa:subagent_001_abcd'],
    scrollTop: 240,
    scrollLeft: 80,
  };

  it('round-trips a full snapshot', () => {
    expect(parseTimelineViewSnapshot(JSON.stringify(full))).toEqual(full);
  });

  it('round-trips the profiling phase and rejects the removed "all" value', () => {
    expect(
      parseTimelineViewSnapshot(JSON.stringify({ ...full, phaseFilter: 'profiling' }))?.phaseFilter,
    ).toBe('profiling');
    // 'all' is no longer a valid phase — coerces back to the profiling default.
    expect(
      parseTimelineViewSnapshot(JSON.stringify({ ...full, phaseFilter: 'all' }))?.phaseFilter,
    ).toBe('profiling');
  });

  it('returns null for absent or unparseable input', () => {
    expect(parseTimelineViewSnapshot(null)).toBeNull();
    expect(parseTimelineViewSnapshot('')).toBeNull();
    expect(parseTimelineViewSnapshot('{not json')).toBeNull();
    expect(parseTimelineViewSnapshot('42')).toBeNull();
  });

  it('preserves a null viewEnd (not zoomed) and rejects non-finite viewEnd', () => {
    const restored = parseTimelineViewSnapshot(JSON.stringify({ ...full, viewEnd: null }));
    expect(restored?.viewEnd).toBeNull();
    // NaN / Infinity don't survive JSON, but a malformed string value must coerce to null.
    expect(parseTimelineViewSnapshot('{"viewEnd":"oops"}')?.viewEnd).toBeNull();
  });

  it('falls back to defaults for invalid enums and missing numbers', () => {
    expect(parseTimelineViewSnapshot('{}')).toEqual({
      viewStart: 0,
      viewEnd: null,
      rowMode: 'conversation',
      phaseFilter: 'profiling',
      expanded: [],
      scrollTop: 0,
      scrollLeft: 0,
    });
    const bogus = parseTimelineViewSnapshot(
      JSON.stringify({ rowMode: 'nope', phaseFilter: 'nope', viewStart: 'x', scrollTop: null }),
    )!;
    expect(bogus.rowMode).toBe('conversation');
    expect(bogus.phaseFilter).toBe('profiling');
    expect(bogus.viewStart).toBe(0);
    expect(bogus.scrollTop).toBe(0);
  });

  it('drops non-string entries from the expanded list', () => {
    expect(parseTimelineViewSnapshot('{"expanded":["a",1,null,"b"]}')!.expanded).toEqual([
      'a',
      'b',
    ]);
    expect(parseTimelineViewSnapshot('{"expanded":"nope"}')!.expanded).toEqual([]);
  });
});
