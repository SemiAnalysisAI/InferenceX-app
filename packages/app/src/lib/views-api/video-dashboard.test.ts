import { describe, expect, it } from 'vitest';
import { videoDashboardProjection } from './video-dashboard';

describe('VideoGenX public metadata projection', () => {
  it('keeps an empty catalog unavailable rather than synthesizing zero metrics or comparison evidence', () => {
    const result = videoDashboardProjection([], 'v_hidden=h100,unknown&v_api=0');
    expect(result.workload).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.plot.plotted).toEqual([]);
    expect(result.params.hidden).toEqual(['h100']);
    expect(result.params.apiPrice).toBeGreaterThan(0);
    expect(result.kpis).toHaveLength(4);
    expect(result.kpis.every((row) => row.point === null && row.metrics === null)).toBe(true);
    expect(result.comparison).toEqual({ baseline: null, candidate: null, metrics: [] });
    expect(result.evidence.powerRange).toBeNull();
    expect(result.evidence.plateauSummary).toBeNull();
    expect(result.provenance).toEqual([]);
  });
});
