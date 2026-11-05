/**
 * Per-run ingest report: what one `ingest-ci-run` invocation wrote, as counts
 * per category. The workflow publishes it as the job summary, retains the JSON
 * as an artifact, and forwards it to InferenceX so the merged PR gets a comment.
 *
 * Units per category:
 *   benchmark — benchmark_results rows
 *   eval      — eval_results rows (aggregate and per-config)
 *   trace     — agentic benchmark rows linked to a trace_replay blob
 *   power     — gpu_metrics telemetry series (unmapped: power result rows the
 *               mapper could not place)
 */

export const INGEST_REPORT_CATEGORIES = ['benchmark', 'eval', 'trace', 'power'] as const;
export type IngestReportCategory = (typeof INGEST_REPORT_CATEGORIES)[number];

export const INGEST_REPORT_OUTCOMES = [
  'new',
  'duplicate',
  'skipped',
  'unmapped',
  'failed',
] as const;
export type IngestReportOutcome = (typeof INGEST_REPORT_OUTCOMES)[number];

export type IngestReportCounts = Record<IngestReportCategory, Record<IngestReportOutcome, number>>;

export interface IngestRunReport {
  version: 1;
  runId: number;
  runAttempt: number;
  status: 'succeeded' | 'failed' | 'purged';
  error: string | null;
  evalsOnly: boolean;
  prLinks: string[];
  counts: IngestReportCounts;
  detail: {
    benchmarkFiles: number;
    unreadableBenchmarkFiles: number;
    rawBenchmarkRows: number;
    coveredByPerJobFiles: number;
    purgedPoints: number;
    failedRunRows: number;
    runStatsNew: number;
    runStatsDuplicate: number;
    evalSamplesNew: number;
    evalSampleFiles: number;
    gpuMetricSamplesNew: number;
    powerPublicationPoints: number;
    changelogEntriesWritten: number;
  };
  unmapped: { models: string[]; hardware: string[]; precisions: string[]; datasets: string[] };
}

export function createIngestRunReport(runId: number, runAttempt: number): IngestRunReport {
  const counts = Object.fromEntries(
    INGEST_REPORT_CATEGORIES.map((category) => [
      category,
      Object.fromEntries(INGEST_REPORT_OUTCOMES.map((outcome) => [outcome, 0])),
    ]),
  ) as IngestReportCounts;
  return {
    version: 1,
    runId,
    runAttempt,
    status: 'succeeded',
    error: null,
    evalsOnly: false,
    prLinks: [],
    counts,
    detail: {
      benchmarkFiles: 0,
      unreadableBenchmarkFiles: 0,
      rawBenchmarkRows: 0,
      coveredByPerJobFiles: 0,
      purgedPoints: 0,
      failedRunRows: 0,
      runStatsNew: 0,
      runStatsDuplicate: 0,
      evalSamplesNew: 0,
      evalSampleFiles: 0,
      gpuMetricSamplesNew: 0,
      powerPublicationPoints: 0,
      changelogEntriesWritten: 0,
    },
    unmapped: { models: [], hardware: [], precisions: [], datasets: [] },
  };
}

function cell(text: string): string {
  return text.replaceAll(/[|\r\n]/gu, ' ');
}

/** Render the report as GitHub-flavored Markdown for $GITHUB_STEP_SUMMARY. */
export function renderIngestRunReportMarkdown(report: IngestRunReport): string {
  const status =
    report.status === 'succeeded'
      ? 'succeeded'
      : report.status === 'purged'
        ? 'skipped (run attempt purged via run-overrides)'
        : 'failed';
  const lines = [
    `### Ingest report: run ${report.runId} attempt ${report.runAttempt}`,
    '',
    `Status: **${status}**${report.evalsOnly ? ' (evals-only run)' : ''}`,
  ];
  if (report.error) lines.push('', `Error: \`${cell(report.error).replaceAll('`', "'")}\``);
  if (report.prLinks.length > 0) lines.push('', `PR: ${report.prLinks.join(', ')}`);
  lines.push(
    '',
    `| Category | ${INGEST_REPORT_OUTCOMES.join(' | ')} |`,
    `| --- | ${INGEST_REPORT_OUTCOMES.map(() => '---:').join(' | ')} |`,
    ...INGEST_REPORT_CATEGORIES.map(
      (category) =>
        `| ${category} | ${INGEST_REPORT_OUTCOMES.map((o) => report.counts[category][o]).join(' | ')} |`,
    ),
    '',
    '<details><summary>Detail</summary>',
    '',
    ...Object.entries(report.detail).map(([key, value]) => `- ${key}: ${value}`),
  );
  for (const [kind, names] of Object.entries(report.unmapped)) {
    if (names.length > 0) lines.push(`- unmapped ${kind}: ${cell(names.join(', '))}`);
  }
  lines.push('', '</details>', '');
  return lines.join('\n');
}
