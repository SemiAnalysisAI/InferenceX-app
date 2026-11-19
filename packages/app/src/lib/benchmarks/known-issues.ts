import { Model } from '@/lib/catalog/data-mappings';

export interface KnownConfigIssue {
  hwKey: string;
  model: Model;
  precisions?: string[];
  affectedRuns?: string[];
  summary: string;
  filed: string;
  url: string;
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

export interface MatchablePoint {
  hwKey: string | number;
  precision: string;
  run_url?: string;
}

export function runIdFromRunUrl(runUrl: string | null | undefined): string | null {
  return runUrl?.match(/\/runs\/(?<runId>\d+)/u)?.groups?.runId ?? null;
}

export function pointMatchesIssue(issue: KnownConfigIssue, p: MatchablePoint): boolean {
  if (String(p.hwKey) !== issue.hwKey) return false;
  if (issue.precisions && !issue.precisions.includes(p.precision)) return false;
  if (issue.affectedRuns) {
    const runId = runIdFromRunUrl(p.run_url);
    if (runId === null || !issue.affectedRuns.includes(runId)) return false;
  }
  return true;
}

export function matchKnownConfigIssues(
  model: string,
  points: MatchablePoint[],
): KnownConfigIssue[] {
  return KNOWN_CONFIG_ISSUES.filter(
    (issue) => issue.model === model && points.some((p) => pointMatchesIssue(issue, p)),
  );
}

export function knownIssueCsvNote(issue: KnownConfigIssue, configLabel: string): string {
  return `WARNING: ${configLabel} — ${issue.summary.toLowerCase()} reported, filed since ${issue.filed} (${issue.issueRef}): ${issue.url}`;
}
