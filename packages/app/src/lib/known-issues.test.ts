import { describe, expect, it } from 'vitest';

import {
  type KnownConfigIssue,
  KNOWN_CONFIG_ISSUES,
  knownIssueCsvNote,
  matchKnownConfigIssues,
  pointMatchesIssue,
  runIdFromRunUrl,
} from './known-issues';

const DSR1 = 'DeepSeek-R1-0528';

const GB300_AFFECTED_RUN = '21785935852';
const GB300_AFFECTED_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${GB300_AFFECTED_RUN}/attempts/2`;
const GB300_AFFECTED_URL_FEB5 =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/21726915223/attempts/1';
const GB300_FIXED_URL =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/99999999999/attempts/1';

const MI355X_AFFECTED_URL_MAR13 =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/23052579053';
const MI355X_AFFECTED_URL_MAY7 =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/25471873049';
const MI355X_AFFECTED_URL_MAY31 =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26714221123';
const MI355X_UNFLAGGED_URL =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26491418772';

const gb300Issue = KNOWN_CONFIG_ISSUES.find((i) => i.hwKey === 'gb300_dynamo-trt_mtp')!;
const mi355xIssue = KNOWN_CONFIG_ISSUES.find((i) => i.hwKey === 'mi355x_mori-sglang_mtp')!;

describe('runIdFromRunUrl', () => {
  it('extracts the run id, ignoring the /attempts suffix and host', () => {
    expect(runIdFromRunUrl(GB300_AFFECTED_URL)).toBe(GB300_AFFECTED_RUN);
    expect(runIdFromRunUrl('https://example.test/x/runs/777/attempts/3')).toBe('777');
  });

  it('returns null for missing or unparseable URLs', () => {
    expect(runIdFromRunUrl(undefined)).toBeNull();
    expect(runIdFromRunUrl(null)).toBeNull();
    expect(runIdFromRunUrl('https://github.com/o/r/actions')).toBeNull();
  });
});

// pointMatchesIssue holds the real matching logic; matchKnownConfigIssues just
// wraps it in a model filter + dedup, so the behavior matrix lives here.
describe('pointMatchesIssue', () => {
  it('matches each affected run of a run-scoped issue and nothing else', () => {
    for (const run_url of [GB300_AFFECTED_URL, GB300_AFFECTED_URL_FEB5]) {
      expect(
        pointMatchesIssue(gb300Issue, { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8', run_url }),
      ).toBe(true);
    }
    expect(
      pointMatchesIssue(gb300Issue, {
        hwKey: 'gb300_dynamo-trt_mtp',
        precision: 'fp8',
        run_url: GB300_FIXED_URL,
      }),
    ).toBe(false);

    for (const run_url of [
      MI355X_AFFECTED_URL_MAR13,
      MI355X_AFFECTED_URL_MAY7,
      MI355X_AFFECTED_URL_MAY31,
    ]) {
      expect(
        pointMatchesIssue(mi355xIssue, {
          hwKey: 'mi355x_mori-sglang_mtp',
          precision: 'fp4',
          run_url,
        }),
      ).toBe(true);
    }
    expect(
      pointMatchesIssue(mi355xIssue, {
        hwKey: 'mi355x_mori-sglang_mtp',
        precision: 'fp4',
        run_url: MI355X_UNFLAGGED_URL,
      }),
    ).toBe(false);
  });

  it('ignores the /attempts/<n> suffix when matching the run id', () => {
    const reattempt = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${GB300_AFFECTED_RUN}/attempts/1`;
    expect(
      pointMatchesIssue(gb300Issue, {
        hwKey: 'gb300_dynamo-trt_mtp',
        precision: 'fp8',
        run_url: reattempt,
      }),
    ).toBe(true);
  });

  it('does not match a run-scoped issue when the point has no run_url', () => {
    expect(pointMatchesIssue(gb300Issue, { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8' })).toBe(
      false,
    );
  });

  it('does not match on a wrong precision or hwKey', () => {
    expect(
      pointMatchesIssue(gb300Issue, {
        hwKey: 'gb300_dynamo-trt_mtp',
        precision: 'fp4',
        run_url: GB300_AFFECTED_URL,
      }),
    ).toBe(false);
    expect(
      pointMatchesIssue(gb300Issue, {
        hwKey: 'b200_trt_mtp',
        precision: 'fp8',
        run_url: GB300_AFFECTED_URL,
      }),
    ).toBe(false);
  });

  it('matches an issue with no affectedRuns on any point regardless of run', () => {
    const unscoped: KnownConfigIssue = {
      hwKey: 'foo_bar_mtp',
      model: gb300Issue.model,
      precisions: ['fp8'],
      summary: 'Accuracy issues',
      filed: 'Jan 1, 2026',
      url: 'https://example.test/issue',
      issueRef: 'example/repo#1',
    };
    expect(pointMatchesIssue(unscoped, { hwKey: 'foo_bar_mtp', precision: 'fp8' })).toBe(true);
    expect(
      pointMatchesIssue(unscoped, {
        hwKey: 'foo_bar_mtp',
        precision: 'fp8',
        run_url: GB300_FIXED_URL,
      }),
    ).toBe(true);
  });
});

describe('matchKnownConfigIssues', () => {
  it('resolves a matching point to its issue, per config', () => {
    const gb = matchKnownConfigIssues(DSR1, [
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8', run_url: GB300_AFFECTED_URL },
    ]);
    expect(gb).toHaveLength(1);
    expect(gb[0].issueRef).toBe('NVIDIA/srt-slurm#51');

    const amd = matchKnownConfigIssues(DSR1, [
      { hwKey: 'mi355x_mori-sglang_mtp', precision: 'fp4', run_url: MI355X_AFFECTED_URL_MAY7 },
    ]);
    expect(amd).toHaveLength(1);
    expect(amd[0].issueRef).toBe('sgl-project/sglang#27194');
  });

  it('filters by model and returns each issue at most once', () => {
    expect(
      matchKnownConfigIssues('DeepSeek-V4-Pro', [
        { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8', run_url: GB300_AFFECTED_URL },
      ]),
    ).toHaveLength(0);

    const both = matchKnownConfigIssues(DSR1, [
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8', run_url: GB300_AFFECTED_URL },
      { hwKey: 'gb300_dynamo-trt_mtp', precision: 'fp8', run_url: GB300_AFFECTED_URL },
      { hwKey: 'mi355x_mori-sglang_mtp', precision: 'fp4', run_url: MI355X_AFFECTED_URL_MAY7 },
    ]);
    expect(both).toHaveLength(2);
  });

  it('returns nothing for an empty point list', () => {
    expect(matchKnownConfigIssues(DSR1, [])).toHaveLength(0);
  });
});

describe('knownIssueCsvNote', () => {
  it('includes the config label, filing date, issue ref, and URL', () => {
    const note = knownIssueCsvNote(gb300Issue, 'GB300 NVL72 (Dynamo TRT, MTP)');
    expect(note).toContain('WARNING: GB300 NVL72 (Dynamo TRT, MTP)');
    expect(note).toContain('filed since Apr 21, 2026');
    expect(note).toContain('NVIDIA/srt-slurm#51');
    expect(note).toContain('https://github.com/NVIDIA/srt-slurm/issues/51');
  });
});
