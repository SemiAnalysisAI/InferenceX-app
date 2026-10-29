import { describe, expect, it } from 'vitest';

import type { GPUDataPoint } from '@/components/calculator/types';
import {
  type CompareTableData,
  type CompareTableViewInput,
  compareTableDataFromPoints,
  resolveCompareTableView,
} from '@/lib/compare/compare-table-view';

function makePoint(interactivity: number, throughput: number): GPUDataPoint {
  return {
    hwKey: 'h100',
    interactivity,
    throughput,
    outputThroughput: throughput,
    inputThroughput: 0,
    concurrency: 64,
    tp: 8,
    precision: 'fp8',
    costh: 1.5,
    costr: 1.2,
    costhi: 0.8,
    costri: 0.6,
    costhOutput: 2.2,
    costrOutput: 1.8,
    tpPerMw: 1200,
    inputTpPerMw: 300,
    outputTpPerMw: 1100,
  };
}

const CLIENT_A = [makePoint(40, 900), makePoint(60, 700), makePoint(80, 500)];
const CLIENT_B = [makePoint(50, 800), makePoint(70, 600), makePoint(90, 400)];

const SSR_TABLE: CompareTableData = {
  defaultTargets: [13, 15, 18],
  ssrRows: [13, 15, 18].map((target) => ({ target, a: null, b: null })),
  interactivityRange: { min: 10, max: 20 },
};

function input(overrides: Partial<CompareTableViewInput> = {}): CompareTableViewInput {
  return {
    ssrTableData: SSR_TABLE,
    ssrSequence: '1k1k',
    selectedSequence: '1k1k',
    effectiveSequence: '1k1k',
    sequenceResolved: true,
    pointsA: [],
    pointsB: [],
    clientInteractivityRange: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('compareTableDataFromPoints', () => {
  it('places targets across the overlap of both sides', () => {
    const data = compareTableDataFromPoints(CLIENT_A, CLIENT_B);
    expect(data.interactivityRange).toEqual({ min: 50, max: 80 });
    expect(data.defaultTargets).toEqual([58, 65, 73]);
    expect(data.ssrRows.every((row) => row.a !== null && row.b !== null)).toBe(true);
  });

  it('returns no targets without points', () => {
    expect(compareTableDataFromPoints([], []).defaultTargets).toEqual([]);
  });
});

describe('resolveCompareTableView', () => {
  it('shows the server table while the client selects the server sequence', () => {
    const view = resolveCompareTableView(
      input({ pointsA: CLIENT_A, clientInteractivityRange: { min: 40, max: 90 } }),
    );
    expect(view).toMatchObject({
      status: 'table',
      key: 'ssr',
      data: SSR_TABLE,
      interactivityRange: { min: 40, max: 90 },
      pointsA: CLIENT_A,
    });
  });

  it('keeps the server table during hydration, before availability resolves', () => {
    const view = resolveCompareTableView(
      input({
        effectiveSequence: '8k1k',
        sequenceResolved: false,
        pointsA: CLIENT_A,
        clientInteractivityRange: { min: 40, max: 90 },
      }),
    );
    // Rows fetched for the app default sequence must not fill the server table.
    expect(view).toMatchObject({
      status: 'table',
      key: 'ssr',
      interactivityRange: SSR_TABLE.interactivityRange,
      pointsA: [],
      pointsB: [],
    });
  });

  it('shows the server empty state only for the server sequence', () => {
    const empty = { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } };
    expect(resolveCompareTableView(input({ ssrTableData: empty })).status).toBe('ssr-empty');
    expect(
      resolveCompareTableView(
        input({
          ssrTableData: empty,
          selectedSequence: '8k1k',
          effectiveSequence: '8k1k',
          pointsA: CLIENT_A,
          pointsB: CLIENT_B,
        }),
      ),
    ).toMatchObject({ status: 'table', key: 'client:8k1k' });
  });

  it('shows loading instead of server cells while a shared sequence is pending', () => {
    expect(
      resolveCompareTableView(
        input({ selectedSequence: '8k1k', effectiveSequence: '8k1k', sequenceResolved: false }),
      ).status,
    ).toBe('loading');
    expect(
      resolveCompareTableView(
        input({ selectedSequence: '8k1k', effectiveSequence: '8k1k', loading: true }),
      ).status,
    ).toBe('loading');
  });

  it('shows the error state when the selected sequence fails to load', () => {
    expect(
      resolveCompareTableView(
        input({
          selectedSequence: '8k1k',
          effectiveSequence: '8k1k',
          loading: true,
          error: 'HTTP 500',
        }),
      ).status,
    ).toBe('error');
  });

  it('shows the selection empty state when the selected sequence has no rows for the pair', () => {
    expect(
      resolveCompareTableView(input({ selectedSequence: '8k1k', effectiveSequence: '8k1k' }))
        .status,
    ).toBe('empty');
  });

  it('builds the table from client rows for another sequence', () => {
    const view = resolveCompareTableView(
      input({
        selectedSequence: '8k1k',
        effectiveSequence: '8k1k',
        pointsA: CLIENT_A,
        pointsB: CLIENT_B,
        clientInteractivityRange: { min: 40, max: 90 },
      }),
    );
    expect(view).toMatchObject({
      status: 'table',
      key: 'client:8k1k',
      data: compareTableDataFromPoints(CLIENT_A, CLIENT_B),
      interactivityRange: { min: 50, max: 80 },
    });
  });

  it('follows availability when it resolves a shared sequence to another one', () => {
    expect(
      resolveCompareTableView(input({ selectedSequence: '8k1k', effectiveSequence: '1k1k' }))
        .status,
    ).toBe('table');
  });

  it('keeps the server empty state until the client knows its sequence when the server had none', () => {
    const empty = { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } };
    expect(
      resolveCompareTableView(
        input({ ssrTableData: empty, ssrSequence: null, sequenceResolved: false }),
      ).status,
    ).toBe('ssr-empty');
    expect(
      resolveCompareTableView(input({ ssrTableData: empty, ssrSequence: null, loading: true }))
        .status,
    ).toBe('loading');
  });
});
