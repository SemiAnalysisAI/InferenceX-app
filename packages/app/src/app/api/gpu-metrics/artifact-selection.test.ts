import { describe, expect, it } from 'vitest';

import { isRequestedArtifact, isWantedBundle } from './artifact-selection';

describe('PowerX artifact selection', () => {
  it('matches a bundle at either the sweep or per-concurrency prefix', () => {
    expect(isWantedBundle('power_audit_dsr1_fp4_b200', 'dsr1_')).toBe(true);
    expect(isWantedBundle('power_audit_dsr1_fp4_b200', 'dsr1_fp4_b200_sa-bench_conc32')).toBe(true);
    expect(isWantedBundle('power_audit_dsr1_fp4_b200', 'dsr1_fp4_h200')).toBe(false);
    expect(isWantedBundle('gpu_metrics_dsr1_fp4_b200', null)).toBe(false);
  });

  it('selects exact CSV identities while allowing their containing sweep bundle', () => {
    const sources = ['power_validation_dsr1_fp4_b200_sa-bench_conc32.json'];
    expect(isRequestedArtifact('gpu_metrics_dsr1_fp4_b200_sa-bench_conc32', sources)).toBe(true);
    expect(isRequestedArtifact('gpu_metrics_dsr1_fp4_b200_sa-bench_conc320', sources)).toBe(false);
    expect(isRequestedArtifact('power_audit_dsr1_fp4_b200', sources)).toBe(true);
    expect(isRequestedArtifact('power_audit_dsr1_fp4_h200', sources)).toBe(false);
  });

  it('distinguishes unknown requested identities from no missing identities', () => {
    expect(isRequestedArtifact('gpu_metrics_dsr1_fp4_b200', null)).toBe(true);
    expect(isRequestedArtifact('gpu_metrics_dsr1_fp4_b200', [])).toBe(false);
    expect(isWantedBundle('power_audit_dsr1_fp4_b200', null)).toBe(true);
  });
});
