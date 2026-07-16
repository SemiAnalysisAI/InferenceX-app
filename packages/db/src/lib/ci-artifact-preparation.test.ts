import { describe, expect, it } from 'vitest';

import type { ArtifactMeta } from './github-artifacts.js';
import { buildArtifactPlan, isIngestableAgenticBenchmarkData } from './ci-artifact-preparation.js';

const artifact = (id: number, name: string, created_at: string, expired = false): ArtifactMeta => ({
  id,
  name,
  created_at,
  expired,
  archive_download_url: `https://api.github.com/artifacts/${id}/zip`,
});

describe('buildArtifactPlan', () => {
  it('keeps the newest physical upload for each logical benchmark artifact', () => {
    const plan = buildArtifactPlan(
      '29413860950',
      '29508236865',
      [
        artifact(
          8343226821,
          'bmk_agentic_dsv4_tp8_conc16_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc16_mi355x-amds_01',
          '2026-07-15T12:43:07Z',
        ),
        artifact(
          8347624083,
          'agentic_dsv4_tp8_conc16_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc16_mi355x-amds_02',
          '2026-07-15T15:10:05Z',
        ),
        artifact(
          8350635857,
          'bmk_agentic_dsv4_tp8_conc16_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc16_mi355x-amds_02',
          '2026-07-15T16:51:38Z',
        ),
        artifact(
          8350639457,
          'agentic_dsv4_tp8_conc16_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc16_mi355x-amds_02',
          '2026-07-15T16:51:46Z',
        ),
        artifact(
          8345740968,
          'bmk_agentic_dsv4_tp8_conc32_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc32_mi355x-amds_04',
          '2026-07-15T14:10:11Z',
        ),
        artifact(
          8347672280,
          'agentic_dsv4_tp8_conc32_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc32_mi355x-amds_01',
          '2026-07-15T15:11:37Z',
        ),
        artifact(
          8350714141,
          'bmk_agentic_dsv4_tp8_conc32_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc32_mi355x-amds_05',
          '2026-07-15T16:54:24Z',
        ),
        artifact(
          8350718292,
          'agentic_dsv4_tp8_conc32_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc32_mi355x-amds_05',
          '2026-07-15T16:54:33Z',
        ),
        artifact(8350722709, 'changelog-metadata', '2026-07-15T16:54:42Z'),
      ],
      [artifact(9000000001, 'changelog-metadata', '2026-07-16T01:00:00Z')],
    );

    expect(plan.reused).toBe(true);
    expect(plan.artifacts.map((item) => item.id)).toEqual([
      8350639457, 8350718292, 8350635857, 8350714141, 9000000001,
    ]);
    expect(plan.artifacts.map((item) => item.name)).not.toContain(
      'bmk_agentic_dsv4_tp8_conc32_kvnone_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpatrue_disagg-false_spec-none_conc32_mi355x-amds_04',
    );
  });

  it('uses the publication run changelog and ignores source bundles during reuse', () => {
    const plan = buildArtifactPlan(
      '100',
      '200',
      [
        artifact(1, 'bmk_model_h200-cw_0', '2026-01-01T00:00:00Z'),
        artifact(2, 'changelog-metadata', '2026-01-01T00:01:00Z'),
        artifact(3, 'reused-ingest-artifacts', '2026-01-01T00:02:00Z'),
      ],
      [
        artifact(4, 'changelog-metadata', '2026-01-02T00:00:00Z'),
        artifact(5, 'changelog-metadata', '2026-01-03T00:00:00Z'),
      ],
    );

    expect(plan.artifacts.map((item) => item.id)).toEqual([1, 5]);
  });

  it('keeps legacy bundled and non-changelog artifacts for a normal run', () => {
    const plan = buildArtifactPlan('100', '100', [
      artifact(1, 'reused-ingest-artifacts', '2026-01-01T00:00:00Z'),
      artifact(2, 'changelog-metadata', '2026-01-01T00:01:00Z'),
      artifact(3, 'changelog-metadata', '2026-01-02T00:01:00Z'),
    ]);

    expect(plan.reused).toBe(false);
    expect(plan.artifacts.map((item) => item.id)).toEqual([3, 1]);
  });

  it('ignores expired artifacts and requires a merge-run changelog for reuse', () => {
    expect(() =>
      buildArtifactPlan(
        '100',
        '200',
        [artifact(1, 'bmk_model_h200-cw_0', '2026-01-01T00:00:00Z')],
        [artifact(2, 'changelog-metadata', '2026-01-02T00:00:00Z', true)],
      ),
    ).toThrow('No changelog-metadata artifact found on merge run 200');
  });

  it('rejects a reused run with no source artifacts before adding the merge changelog', () => {
    expect(() =>
      buildArtifactPlan(
        '100',
        '200',
        [artifact(1, 'changelog-metadata', '2026-01-01T00:00:00Z')],
        [artifact(2, 'changelog-metadata', '2026-01-02T00:00:00Z')],
      ),
    ).toThrow('No unexpired ingestable artifacts found on source run 100');
  });

  it('anchors raw agentic artifacts to the newest valid benchmark generation', () => {
    const plan = buildArtifactPlan(
      '100',
      '100',
      [
        artifact(1, 'bmk_agentic_model_conc64_b300-nv_05', '2026-01-01T00:00:00Z'),
        artifact(2, 'agentic_model_conc64_b300-nv_05', '2026-01-01T00:00:01Z'),
        artifact(3, 'server_logs_model_conc64_b300-nv_05', '2026-01-01T00:00:02Z'),
        artifact(4, 'agentic_model_conc64_b300-nv_13', '2026-01-02T00:00:00Z'),
        artifact(5, 'server_logs_model_conc64_b300-nv_13', '2026-01-02T00:00:01Z'),
      ],
      undefined,
      { validAgenticBenchmarkIds: new Set([1]) },
    );

    expect(plan.artifacts.map((item) => item.id)).toEqual([2, 1, 3]);
  });

  it('chooses the companion upload closest to an exact-name benchmark rerun', () => {
    const plan = buildArtifactPlan(
      '100',
      '100',
      [
        artifact(1, 'agentic_model_conc16_b200-nv_02', '2026-01-01T00:00:00Z'),
        artifact(2, 'bmk_agentic_model_conc16_b200-nv_02', '2026-01-02T00:00:00Z'),
        artifact(3, 'agentic_model_conc16_b200-nv_02', '2026-01-02T00:00:01Z'),
      ],
      undefined,
      { validAgenticBenchmarkIds: new Set([2]) },
    );

    expect(plan.artifacts.map((item) => item.id)).toEqual([3, 2]);
  });
});

describe('isIngestableAgenticBenchmarkData', () => {
  it('accepts completed agentic rows with successful requests and throughput', () => {
    expect(
      isIngestableAgenticBenchmarkData({
        scenario_type: 'agentic-coding',
        num_requests_successful: 42,
        request_metrics: { throughput: { mean: 12.5 } },
      }),
    ).toBe(true);
  });

  it('rejects always-uploaded rows from failed benchmark jobs', () => {
    expect(
      isIngestableAgenticBenchmarkData({
        scenario_type: 'agentic-coding',
        num_requests_successful: 0,
        request_metrics: { throughput: {} },
      }),
    ).toBe(false);
  });
});
