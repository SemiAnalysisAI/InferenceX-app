import { describe, it, expect } from 'vitest';

import type { GithubArtifact } from '@/lib/github-artifacts';
import { type EvalArtifactConfig, findEvalSampleArtifact } from '@/lib/eval-samples-live';

function makeArtifact(name: string, id = 1): GithubArtifact {
  return {
    id,
    name,
    archive_download_url: `https://example.com/${name}.zip`,
  } as GithubArtifact;
}

const baseConfig: EvalArtifactConfig = {
  model: 'dsr1',
  framework: 'sglang',
  hardware: 'mi355x',
  precision: 'fp4',
  specMethod: 'mtp',
  disagg: false,
  conc: 128,
};

describe('findEvalSampleArtifact', () => {
  it('matches a single-conc non-disagg artifact', () => {
    const artifacts = [
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang_tp8-ep1-dpafalse_disagg-false_spec-mtp_conc128_mi355x-amds_01',
      ),
    ];
    const result = findEvalSampleArtifact(artifacts, baseConfig);
    expect(result?.id).toBe(1);
  });

  it('accepts the legacy `sglang-disagg` alias when the config framework is `mori-sglang`', () => {
    // Eval rows are normalized via FRAMEWORK_ALIASES (sglang-disagg → mori-sglang),
    // but artifact names keep the raw alias. The matcher must accept either.
    const artifacts = [
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang-disagg_prefill-tp8-ep1-dpfalse-nw1_decode-tp8-ep1-dpfalse-nw2_disagg-true_spec-mtp_conc64x128x256_mi355x-amds_08',
      ),
    ];
    const result = findEvalSampleArtifact(artifacts, {
      ...baseConfig,
      framework: 'mori-sglang',
      disagg: true,
      conc: 128,
    });
    expect(result?.id).toBe(1);
  });

  it('matches a conc value embedded in an x-separated list (disagg artifacts)', () => {
    const artifacts = [
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang-disagg_prefill-tp8-ep8-dptrue-nw2_decode-tp8-ep8-dptrue-nw1_disagg-true_spec-mtp_conc1024x2048x4096_mi355x-amds_06',
      ),
    ];
    const result = findEvalSampleArtifact(artifacts, {
      ...baseConfig,
      framework: 'mori-sglang',
      disagg: true,
      conc: 2048,
    });
    expect(result?.id).toBe(1);
  });

  it('rejects when the requested conc is not in the list', () => {
    const artifacts = [
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang-disagg_prefill-tp8-ep8-dptrue-nw2_decode-tp8-ep8-dptrue-nw1_disagg-true_spec-mtp_conc1024x2048x4096_mi355x-amds_06',
      ),
    ];
    const result = findEvalSampleArtifact(artifacts, {
      ...baseConfig,
      framework: 'mori-sglang',
      disagg: true,
      conc: 64,
    });
    expect(result).toBeNull();
  });

  it('avoids substring conc collisions (conc=12 must not match conc128)', () => {
    const artifacts = [
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang_tp8-ep1-dpafalse_disagg-false_spec-mtp_conc128_mi355x-amds_01',
      ),
    ];
    const result = findEvalSampleArtifact(artifacts, { ...baseConfig, conc: 12 });
    expect(result).toBeNull();
  });

  it('skips eval_results_ and eval_gpu_metrics_ artifacts', () => {
    const artifacts = [
      makeArtifact('eval_results_all'),
      makeArtifact('eval_gpu_metrics_dsr1_8k1k_fp4_sglang_spec-mtp_conc128_mi355x-amds'),
    ];
    expect(findEvalSampleArtifact(artifacts, baseConfig)).toBeNull();
  });

  it('prefers artifacts whose disagg token matches the config', () => {
    const artifacts = [
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang_tp8-ep1_disagg-false_spec-mtp_conc128_mi355x-amds_01',
        1,
      ),
      makeArtifact(
        'eval_dsr1_8k1k_dsr1_8k1k_fp4_sglang_tp8-ep1_disagg-true_spec-mtp_conc128_mi355x-amds_02',
        2,
      ),
    ];
    const result = findEvalSampleArtifact(artifacts, { ...baseConfig, disagg: true });
    expect(result?.id).toBe(2);
  });
});
