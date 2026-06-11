import { describe, expect, it } from 'vitest';

import { KNOWN_CONFIG_ISSUES, knownIssueCsvNote, matchKnownConfigIssues } from './known-issues';

const DSR1 = 'DeepSeek-R1-0528';

describe('matchKnownConfigIssues', () => {
  it('matches the GB300 Dynamo TRT MTP entry for DeepSeek R1 FP4', () => {
    const issues = matchKnownConfigIssues(DSR1, [
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp4' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].url).toBe('https://github.com/NVIDIA/srt-slurm/issues/51');
  });

  it('does not match GB300 Dynamo TRT MTP for non-FP4 precisions', () => {
    const issues = matchKnownConfigIssues(DSR1, [
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('matches the MI355X MoRI SGLang MTP entry for DeepSeek R1 FP8', () => {
    const issues = matchKnownConfigIssues(DSR1, [
      { hwKey: 'mi355x_mori-sglang_mtp', precision: 'fp8' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].url).toBe('https://github.com/sgl-project/sglang/issues/27194');
  });

  it('does not match MI355X MoRI SGLang MTP for non-FP8 precisions', () => {
    const issues = matchKnownConfigIssues(DSR1, [
      { hwKey: 'mi355x_mori-sglang_mtp', precision: 'fp4' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('does not match other models', () => {
    const issues = matchKnownConfigIssues('DeepSeek-V4-Pro', [
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp4' },
      { hwKey: 'mi355x_mori-sglang_mtp', precision: 'fp4' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('does not match unaffected configs (non-MTP, other hardware)', () => {
    const issues = matchKnownConfigIssues(DSR1, [
      { hwKey: 'gb300_dynamo-trt', precision: 'fp4' },
      { hwKey: 'mi355x_sglang', precision: 'fp4' },
      { hwKey: 'b200_trt_mtp', precision: 'fp4' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('returns each issue at most once even with many matching points', () => {
    const issues = matchKnownConfigIssues(DSR1, [
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp4' },
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp4' },
      { hwKey: 'mi355x_mori-sglang_mtp', precision: 'fp8' },
    ]);
    expect(issues).toHaveLength(2);
  });

  it('returns nothing for an empty point list', () => {
    expect(matchKnownConfigIssues(DSR1, [])).toHaveLength(0);
  });
});

describe('knownIssueCsvNote', () => {
  it('includes the config label, filing date, issue ref, and URL', () => {
    const note = knownIssueCsvNote(KNOWN_CONFIG_ISSUES[0], 'GB300 NVL72 (Dynamo TRT, MTP)');
    expect(note).toContain('WARNING: GB300 NVL72 (Dynamo TRT, MTP)');
    expect(note).toContain('filed since Apr 21, 2026');
    expect(note).toContain('NVIDIA/srt-slurm#51');
    expect(note).toContain('https://github.com/NVIDIA/srt-slurm/issues/51');
  });
});
