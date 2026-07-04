import { describe, expect, it } from 'vitest';

import type {
  StructureNode,
  SubagentNode,
  TurnNode,
} from '@semianalysisai/inferencex-db/etl/weka-structure';

import {
  buildRowOverlaps,
  buildVisibleRows,
  computeBraceLayout,
  findRequestOverlapGroups,
  formatElapsedTime,
  resolveDeepLinkTarget,
  timeLabel,
} from './trace-flamegraph-model';

describe('formatElapsedTime', () => {
  it('formats elapsed seconds below and above one hour', () => {
    expect(formatElapsedTime(0)).toBe('00:00');
    expect(formatElapsedTime(65.4)).toBe('01:05');
    expect(formatElapsedTime(3661.6)).toBe('1:01:02');
    expect(formatElapsedTime(86_541.149)).toBe('24:02:21');
  });

  it('clamps negative offsets to the conversation origin', () => {
    expect(formatElapsedTime(-5)).toBe('00:00');
  });
});

describe('timeLabel', () => {
  it('renders a range when the end is after the start, a point otherwise', () => {
    expect(timeLabel(65, 130)).toBe('+01:05–02:10');
    expect(timeLabel(65)).toBe('+01:05');
    expect(timeLabel(65, 65)).toBe('+01:05');
    expect(timeLabel(undefined, 130)).toBeUndefined();
    expect(timeLabel(Number.NaN, 130)).toBeUndefined();
  });
});

describe('findRequestOverlapGroups', () => {
  it('keeps non-transitive overlap chains as separate groups', () => {
    const groups = findRequestOverlapGroups([
      { key: 'A', startS: 1, endS: 8 },
      { key: 'B', startS: 5, endS: 11 },
      { key: 'C', startS: 9, endS: 15 },
    ]);

    expect(groups.map((group) => group.requestKeys)).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
    expect(groups.map(({ startS, endS }) => [startS, endS])).toEqual([
      [5, 8],
      [9, 11],
    ]);
  });

  it('does not consider touching or invalid intervals parallel', () => {
    expect(
      findRequestOverlapGroups([
        { key: 'A', startS: 1, endS: 5 },
        { key: 'B', startS: 5, endS: 8 },
        { key: 'missing-end', startS: 3 },
        { key: 'zero-duration', startS: 4, endS: 4 },
      ]),
    ).toEqual([]);
  });

  it('returns only the maximal simultaneous set for nested intervals', () => {
    const groups = findRequestOverlapGroups([
      { key: 'A', startS: 1, endS: 10 },
      { key: 'B', startS: 2, endS: 8 },
      { key: 'C', startS: 3, endS: 7 },
    ]);
    expect(groups).toMatchObject([{ requestKeys: ['A', 'B', 'C'], startS: 3, endS: 7 }]);
  });
});

const turn = (turnIndex: number, extra: Partial<TurnNode> = {}): TurnNode => ({
  kind: 'turn',
  turnIndex,
  in: 100,
  out: 10,
  cached: 0,
  uncached: 100,
  ...extra,
});
const subagent = (children: TurnNode[], extra: Partial<SubagentNode> = {}): SubagentNode => ({
  kind: 'subagent',
  label: 'Subagent',
  in: 100,
  out: 10,
  cached: 0,
  uncached: 100,
  children,
  ...extra,
});

describe('resolveDeepLinkTarget', () => {
  // Node layout mirroring a real Weka conversation: raw entries
  //   0: turn, 1: subagent (2 children), 2: turn
  const withRawIndexes: StructureNode[] = [
    turn(0, { rawIndex: 0 }),
    subagent([turn(1, { rawIndex: 1, innerIndex: 0 }), turn(2, { rawIndex: 1, innerIndex: 1 })], {
      agentId: 'subagent_001_abcd1234',
      rawIndex: 1,
    }),
    turn(3, { rawIndex: 2 }),
  ];
  // The same conversation as stored by the pre-rawIndex ingest (fields absent).
  const legacy: StructureNode[] = [
    turn(0),
    subagent([turn(1), turn(2)], { agentId: 'subagent_001_abcd1234' }),
    turn(3),
  ];

  it('resolves raw source coordinates against explicit rawIndex fields', () => {
    expect(resolveDeepLinkTarget(withRawIndexes, { raw: 2 })).toEqual({
      rowKey: 't-2',
      expandGroup: null,
    });
    expect(resolveDeepLinkTarget(withRawIndexes, { raw: 1, inner: 1 })).toEqual({
      rowKey: 'g-1-c-1',
      expandGroup: 1,
    });
  });

  it('falls back to node array position for structures ingested before rawIndex existed', () => {
    // One node per raw entry means position === raw index, so the deep link
    // must still resolve exactly (regression: it previously returned null and
    // the flamegraph neither scrolled nor highlighted anything).
    expect(resolveDeepLinkTarget(legacy, { raw: 2, turn: 1 })).toEqual({
      rowKey: 't-2',
      expandGroup: null,
    });
    expect(resolveDeepLinkTarget(legacy, { raw: 0, turn: 0 })).toEqual({
      rowKey: 't-0',
      expandGroup: null,
    });
  });

  it('resolves subagent children positionally when innerIndex is absent', () => {
    expect(resolveDeepLinkTarget(legacy, { raw: 1, inner: 1, turn: 1 })).toEqual({
      rowKey: 'g-1-c-1',
      expandGroup: 1,
    });
  });

  it('returns null for out-of-range raw coordinates instead of guessing', () => {
    expect(resolveDeepLinkTarget(legacy, { raw: 9 })).toBeNull();
    expect(resolveDeepLinkTarget(legacy, { raw: 1, inner: 5 })).toBeNull();
    // raw pointing at a subagent marker without inner does not match a turn.
    expect(resolveDeepLinkTarget(legacy, { raw: 1 })).toBeNull();
  });

  it('keeps the positional turn/agent fallback for links without raw coordinates', () => {
    expect(resolveDeepLinkTarget(legacy, { turn: 1 })).toEqual({
      rowKey: 't-2',
      expandGroup: null,
    });
    expect(resolveDeepLinkTarget(legacy, { turn: 1, agent: 'subagent_001_abcd1234' })).toEqual({
      rowKey: 'g-1-c-1',
      expandGroup: 1,
    });
    expect(resolveDeepLinkTarget(legacy, {})).toBeNull();
  });
});

describe('buildVisibleRows', () => {
  const nodes: StructureNode[] = [
    turn(0, { startS: 0, endS: 10, model: 'claude' }),
    subagent([turn(1), turn(2)], { label: 'Subagent: search', durationMs: 12_000 }),
    turn(3),
  ];

  it('hides collapsed subagent children and keys rows by node position', () => {
    const rows = buildVisibleRows(nodes, new Set(), new Map());
    expect(rows.map((r) => r.key)).toEqual(['t-0', 'g-1', 't-2']);
    expect(rows[0]).toMatchObject({
      label: 'Turn 1',
      sublabel: 'claude',
      timeLabel: '+00:00–00:10',
      total: 110,
      isGroup: false,
    });
    expect(rows[1]).toMatchObject({
      label: 'Subagent: search',
      sublabel: '2 turns · 12s',
      isGroup: true,
      isExpanded: false,
      groupIndex: 1,
    });
  });

  it('inserts indented child rows for expanded groups and attaches overlaps', () => {
    const overlap = {
      id: 'main-1',
      label: 'P1',
      color: '#06b6d4',
      startS: 0,
      endS: 1,
      peerCount: 1,
    };
    const rows = buildVisibleRows(nodes, new Set([1]), new Map([['g-1-c-0', [overlap]]]));
    expect(rows.map((r) => r.key)).toEqual(['t-0', 'g-1', 'g-1-c-0', 'g-1-c-1', 't-2']);
    expect(rows[2]).toMatchObject({ label: '↳ subturn 1', indent: 1, overlaps: [overlap] });
    expect(rows[3]!.overlaps).toEqual([]);
  });
});

describe('buildRowOverlaps and computeBraceLayout', () => {
  it('brackets parallel main turns and spans a non-member row as pass-through', () => {
    const nodes: StructureNode[] = [
      turn(0, { startS: 0, endS: 10 }),
      turn(1), // untimed — sits inside the bracket span without being a member
      turn(2, { startS: 5, endS: 30 }), // overlaps turn 0 and turn 3
      turn(3, { startS: 28, endS: 40 }),
    ];
    const overlaps = buildRowOverlaps(nodes);
    expect([...overlaps.keys()].toSorted()).toEqual(['t-0', 't-2', 't-3']);

    const rows = buildVisibleRows(nodes, new Set(), overlaps);
    const layout = computeBraceLayout(rows);
    // Two overlap groups sharing rows 0–2 and 2–3 need two side-by-side lanes.
    expect(layout.laneCount).toBe(2);
    expect(layout.overflowLanes).toBe(0);
    const roles = layout.rowSegs.map((segs) =>
      segs.map(({ lane, seg }) => `${lane}:${seg.role}${seg.isMember ? '' : ':nonmember'}`),
    );
    expect(roles[0]).toEqual(['0:first']);
    expect(roles[1]).toEqual(['0:through:nonmember']);
    expect(roles[2]!.toSorted()).toEqual(['0:last', '1:first']);
    expect(roles[3]).toEqual(['1:last']);
  });

  it('reports no lanes for a fully serial conversation', () => {
    const nodes: StructureNode[] = [
      turn(0, { startS: 0, endS: 5 }),
      turn(1, { startS: 5, endS: 9 }),
    ];
    const rows = buildVisibleRows(nodes, new Set(), buildRowOverlaps(nodes));
    expect(computeBraceLayout(rows)).toEqual({ laneCount: 0, overflowLanes: 0, rowSegs: [[], []] });
  });
});
