import { describe, expect, it } from 'vitest';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import fixture from '../../../cypress/fixtures/api/video-history.json';
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
  it('keeps a different deployment in chart selection but out of the shared evidence cohort', () => {
    const page = structuredClone(fixture) as unknown as VideoHistoryPage;
    for (const entry of page.entries)
      for (const source of entry.sources)
        for (const observation of source.observations) {
          if (!observation.hardware.includes('B200')) continue;
          observation.participating = 8;
          observation.server = { tp: 4, ulysses: 2, attention: null };
        }
    const result = videoDashboardProjection([page], '');
    expect(result.rows.some((row) => row.point.hardwareKey === 'b200')).toBe(true);
    expect(result.evidence.plateau).toHaveLength(6);
    expect(result.evidence.plateau.some((row) => row.hardwareKey === 'b200')).toBe(false);
    expect(result.evidence.plateauSummary?.queued).toBe(4);
    expect(result.evidence.facts.participating).toBe(4);
    expect(result.evidence.power).toHaveLength(2);
    expect(result.evidence.scaling).toHaveLength(1);
  });
});
