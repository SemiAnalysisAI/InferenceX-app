/**
 * Known upstream issues affecting specific benchmark configurations.
 *
 * Entries are matched against the series visible on an inference chart.
 * Matches render an on-chart warning box (which is captured by PNG export)
 * and are stamped into the CSV export header.
 */

import { Model } from '@/lib/data-mappings';

export interface KnownConfigIssue {
  /** Availability hardware key the issue applies to ({hardware}_{framework}[_mtp]) */
  hwKey: string;
  /** Model the issue applies to */
  model: Model;
  /** Precisions the issue applies to; omit to match every precision */
  precisions?: string[];
  /** GitHub Actions run IDs (the numeric `/runs/<id>` segment) the issue applies to; omit to match every run */
  affectedRuns?: string[];
  /** Short description shown in the warning box, e.g. "Accuracy issues" */
  summary: string;
  /** Human-readable filing date, e.g. "Apr 21, 2026" */
  filed: string;
  /** Upstream issue URL */
  url: string;
  /** Short issue reference, e.g. "NVIDIA/srt-slurm#51" */
  issueRef: string;
}

export const KNOWN_CONFIG_ISSUES: KnownConfigIssue[] = [
  {
    hwKey: 'gb300_dynamo-trt_mtp',
    model: Model.DeepSeek_R1,
    precisions: ['fp8'],
    affectedRuns: ['21726915223', '21785935852'],
    summary: 'Accuracy issues',
    filed: 'Apr 21, 2026',
    url: 'https://github.com/NVIDIA/srt-slurm/issues/51',
    issueRef: 'NVIDIA/srt-slurm#51',
  },
  {
    hwKey: 'mi355x_mori-sglang_mtp',
    model: Model.DeepSeek_R1,
    precisions: ['fp4'],
    affectedRuns: ['23052579053', '25471873049', '26714221123'],
    summary: 'Accuracy issues',
    filed: 'Jun 4, 2026',
    url: 'https://github.com/sgl-project/sglang/issues/27194',
    issueRef: 'sgl-project/sglang#27194',
  },
];

/** Minimal point shape needed for matching. */
export interface MatchablePoint {
  hwKey: string | number;
  precision: string;
  /** Run URL of the GitHub Actions run that produced this point, if known. */
  run_url?: string;
}

/** Numeric GitHub Actions run id from a run URL (ignores any `/attempts/<n>` suffix), or null. */
export function runIdFromRunUrl(runUrl: string | null | undefined): string | null {
  return runUrl?.match(/\/runs\/(?<runId>\d+)/u)?.groups?.runId ?? null;
}

/**
 * Whether a chart point falls under a known issue (hwKey + precision + run scope).
 * Shared by matchKnownConfigIssues and the on-chart warning-arrow point filters so
 * both agree on which points an issue covers. Run-scoped issues never match a point
 * whose run id is unknown.
 */
export function pointMatchesIssue(issue: KnownConfigIssue, p: MatchablePoint): boolean {
  if (String(p.hwKey) !== issue.hwKey) return false;
  if (issue.precisions && !issue.precisions.includes(p.precision)) return false;
  if (issue.affectedRuns) {
    const runId = runIdFromRunUrl(p.run_url);
    if (runId === null || !issue.affectedRuns.includes(runId)) return false;
  }
  return true;
}

/**
 * Return the known issues whose (model, hwKey, precision, run) matches at least
 * one visible chart point. Order follows KNOWN_CONFIG_ISSUES; each issue appears
 * at most once.
 */
export function matchKnownConfigIssues(
  model: string,
  points: MatchablePoint[],
): KnownConfigIssue[] {
  return KNOWN_CONFIG_ISSUES.filter(
    (issue) => issue.model === model && points.some((p) => pointMatchesIssue(issue, p)),
  );
}

/** Format a known issue as a CSV header comment line. */
export function knownIssueCsvNote(issue: KnownConfigIssue, configLabel: string): string {
  return `WARNING: ${configLabel} — ${issue.summary.toLowerCase()} reported, filed since ${issue.filed} (${issue.issueRef}): ${issue.url}`;
}
