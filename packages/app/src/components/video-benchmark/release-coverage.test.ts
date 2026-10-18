import { describe, expect, it } from 'vitest';
import fixture from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage, VideoHistorySource } from './history';
import { videoReleaseCoverage } from './release-coverage';
import { VIDEO_MODELS } from './models';
import { videoDashboardProjection } from '@/lib/views-api/video-dashboard';

describe('four-cell published coverage', () => {
  it('preserves low-sample and failed cells, deduplicates re-exports, and reports missing cells without inheriting H3', () => {
    const page = structuredClone(fixture) as unknown as VideoHistoryPage;
    const source = page.entries
      .flatMap((entry) => entry.sources)
      .find((item) => item.observations.length > 0)!;
    const base: VideoHistorySource = {
      ...source,
      model: VIDEO_MODELS.h3.modelId,
      producer: {
        modelRevision: 'a'.repeat(40),
        planSha256: 'b'.repeat(64),
        engine: { name: 'sglang', revision: 'c'.repeat(40) },
      },
      observations: source.observations.map((observation) => ({
        ...observation,
        valid: 4,
        samples: 4,
      })),
    };
    const failed: VideoHistorySource = {
      ...base,
      id: 'failed-wan',
      model: VIDEO_MODELS.wan22.modelId,
      execution: 'failed',
      observations: [],
      error: 'Generation failed before the first request',
    };
    page.entries = [{ ...page.entries[0], sources: [base, failed] }];
    const rows = videoReleaseCoverage([page, page]);
    expect(rows.map(({ model, engine, status }) => [model, engine, status])).toEqual([
      ['h3', 'sglang', 'history_only'],
      ['h3', 'vllm-omni', 'not_published'],
      ['wan22', 'sglang', 'failed'],
      ['wan22', 'vllm-omni', 'not_published'],
    ]);
    expect(rows[0].sources).toHaveLength(1);
    expect(videoDashboardProjection([page, page], '?v_model=wan22').releaseCoverage).toEqual(rows);
  });
});
