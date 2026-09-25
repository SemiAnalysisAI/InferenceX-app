import { describe, expect, it } from 'vitest';

import { prioritizeRuns } from './powerTimeline';

describe('prioritizeRuns', () => {
  const requests = ['1', '2', '3', '4', '5'].map((runId) => ({
    runId,
    prefix: '',
    sources: [],
  }));

  it('moves overlay runs ahead of official runs and keeps both orders', () => {
    expect(prioritizeRuns(requests, new Set(['5', '3'])).map((request) => request.runId)).toEqual([
      '3',
      '5',
      '1',
      '2',
      '4',
    ]);
  });
});
