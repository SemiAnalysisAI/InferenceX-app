import { describe, expect, it } from 'bun:test';

import { shouldRequestTrendHistory } from './trend-history-gate';

describe('shouldRequestTrendHistory', () => {
  it('waits for the sequence to resolve', () => {
    expect(
      shouldRequestTrendHistory({
        sequenceResolved: false,
        chartDataLoading: true,
        hasInteractivityChart: false,
      }),
    ).toBe(false);
  });

  it('starts alongside the benchmark rows, before the chart is known', () => {
    expect(
      shouldRequestTrendHistory({
        sequenceResolved: true,
        chartDataLoading: true,
        hasInteractivityChart: false,
      }),
    ).toBe(true);
  });

  it('keeps requesting once the rows produce an interactivity chart', () => {
    expect(
      shouldRequestTrendHistory({
        sequenceResolved: true,
        chartDataLoading: false,
        hasInteractivityChart: true,
      }),
    ).toBe(true);
  });

  it('stops when the rows loaded without an interactivity chart, so the no-data state shows', () => {
    expect(
      shouldRequestTrendHistory({
        sequenceResolved: true,
        chartDataLoading: false,
        hasInteractivityChart: false,
      }),
    ).toBe(false);
  });
});
