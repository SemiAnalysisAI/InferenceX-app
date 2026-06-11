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
    summary: 'Accuracy issues',
    filed: 'Apr 21, 2026',
    url: 'https://github.com/NVIDIA/srt-slurm/issues/51',
    issueRef: 'NVIDIA/srt-slurm#51',
  },
  {
    hwKey: 'mi355x_mori-sglang_mtp',
    model: Model.DeepSeek_R1,
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
}

/**
 * Return the known issues whose (model, hwKey, precision) matches at least one
 * visible chart point. Order follows KNOWN_CONFIG_ISSUES; each issue appears at
 * most once.
 */
export function matchKnownConfigIssues(
  model: string,
  points: MatchablePoint[],
): KnownConfigIssue[] {
  return KNOWN_CONFIG_ISSUES.filter(
    (issue) =>
      issue.model === model &&
      points.some(
        (p) =>
          String(p.hwKey) === issue.hwKey &&
          (!issue.precisions || issue.precisions.includes(p.precision)),
      ),
  );
}

/** Format a known issue as a CSV header comment line. */
export function knownIssueCsvNote(issue: KnownConfigIssue, configLabel: string): string {
  return `WARNING: ${configLabel} — ${issue.summary.toLowerCase()} reported, filed since ${issue.filed} (${issue.issueRef}): ${issue.url}`;
}
