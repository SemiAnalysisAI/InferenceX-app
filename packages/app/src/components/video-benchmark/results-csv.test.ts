import { describe, expect, it } from 'vitest';
import retainedHistory from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import { namedRunPoints, videoPoints } from './points';
import { DEFAULT_RESULTS_STATE, resultProjection } from './results';
import { RESULT_CSV_COLUMNS, resultCsvRows } from './results-csv';

describe('VideoGenX overview CSV rows', () => {
  it('keeps exact named provenance, both GPU bases, units, and unknown values', () => {
    const history = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
    for (const entry of history.entries) entry.approved = false;
    const runId = history.entries.find((entry) =>
      entry.sources.some((source) => source.hardware.includes('B200')),
    )!.runId;
    const projection = resultProjection(
      videoPoints([history]),
      { ...DEFAULT_RESULTS_STATE, unofficialRun: runId, costTier: 'r' },
      namedRunPoints([history], runId),
    );
    const rows = resultCsvRows(projection);
    expect(RESULT_CSV_COLUMNS).toEqual(Object.keys(rows[0]));
    expect(rows).toHaveLength(projection.overlayCells.length);
    expect(rows).toHaveLength(1);
    const cell = projection.overlayCells[0];
    expect(rows[0]).toMatchObject({
      channel: 'named',
      approved: false,
      published_at: null,
      run_id: runId,
      artifact_id: cell.point.artifactId,
      source_manifest_sha256: cell.point.id.split(':')[0],
      point_id: cell.point.id,
      workload_key: cell.point.workloadKey,
      participating_gpus: cell.point.participating,
      allocated_gpus: cell.point.allocated,
      cost_tier: 'r',
      participating_cost_usd_per_video: cell.cost.participating?.perVideo ?? null,
      allocated_cost_usd_per_video: cell.cost.allocated?.perVideo ?? null,
      gpu_board_energy_j_per_clip: cell.joulesPerClip,
      participating_profit_usd_per_hour: null,
      allocated_profit_usd_per_hour: null,
    });
  });
});
