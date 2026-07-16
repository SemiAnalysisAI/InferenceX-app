import { describe, expect, it } from 'vitest';

import { buildArtifactPlan } from './ci-artifact-preparation.js';
import type { ArtifactMeta } from './github-artifacts.js';

const artifact = (id: number, name: string, created_at: string, expired = false): ArtifactMeta => ({
  id,
  name,
  created_at,
  expired,
  archive_download_url: `https://api.github.com/artifacts/${id}/zip`,
});

describe('buildArtifactPlan', () => {
  it('matches normal ingestion by keeping the newest upload for each exact name', () => {
    const plan = buildArtifactPlan('100', '100', [
      artifact(1, 'bmk_model_runner_01', '2026-01-01T00:00:00Z'),
      artifact(2, 'bmk_model_runner_01', '2026-01-02T00:00:00Z'),
      artifact(3, 'bmk_model_runner_02', '2026-01-01T00:00:00Z'),
    ]);

    expect(plan.artifacts.map((item) => item.id)).toEqual([2, 3]);
    expect(plan.reused).toBe(false);
  });

  it('uses the merge-run changelog for reused sweeps', () => {
    const plan = buildArtifactPlan(
      '100',
      '200',
      [
        artifact(1, 'bmk_model', '2026-01-01T00:00:00Z'),
        artifact(2, 'changelog-metadata', '2026-01-01T00:01:00Z'),
      ],
      [
        artifact(3, 'changelog-metadata', '2026-01-02T00:00:00Z'),
        artifact(4, 'changelog-metadata', '2026-01-03T00:00:00Z'),
      ],
    );

    expect(plan.artifacts.map((item) => item.id)).toEqual([1, 4]);
    expect(plan.reused).toBe(true);
  });

  it('rejects reuse without source artifacts or a merge changelog', () => {
    expect(() =>
      buildArtifactPlan(
        '100',
        '200',
        [artifact(1, 'changelog-metadata', '2026-01-01T00:00:00Z')],
        [artifact(2, 'changelog-metadata', '2026-01-02T00:00:00Z', true)],
      ),
    ).toThrow('No unexpired artifacts found on source run 100');

    expect(() =>
      buildArtifactPlan('100', '200', [artifact(1, 'bmk_model', '2026-01-01T00:00:00Z')], []),
    ).toThrow('No changelog-metadata artifact found on merge run 200');
  });
});
