import { describe, expect, it } from 'vitest';

import {
  createIngestRunReport,
  INGEST_REPORT_CATEGORIES,
  INGEST_REPORT_OUTCOMES,
  renderIngestRunReportMarkdown,
} from './ingest-run-report';

describe('ingest run report', () => {
  it('starts every category and outcome at zero', () => {
    const report = createIngestRunReport(40141873883, 1);
    for (const category of INGEST_REPORT_CATEGORIES) {
      for (const outcome of INGEST_REPORT_OUTCOMES) {
        expect(report.counts[category][outcome]).toBe(0);
      }
    }
    expect(report.status).toBe('succeeded');
  });

  it('renders one table row per category with counts in outcome order', () => {
    const report = createIngestRunReport(40141873883, 2);
    report.counts.benchmark.new = 3;
    report.counts.benchmark.duplicate = 1;
    report.counts.trace.skipped = 2;
    report.prLinks = ['https://github.com/SemiAnalysisAI/InferenceX/pull/4456'];
    const markdown = renderIngestRunReportMarkdown(report);
    expect(markdown).toContain('run 40141873883 attempt 2');
    expect(markdown).toContain('| benchmark | 3 | 1 | 0 | 0 | 0 |');
    expect(markdown).toContain('| trace | 0 | 0 | 2 | 0 | 0 |');
    expect(markdown).toContain('PR: https://github.com/SemiAnalysisAI/InferenceX/pull/4456');
  });

  it('keeps failure text and unmapped names inside one table-safe line', () => {
    const report = createIngestRunReport(1, 1);
    report.status = 'failed';
    report.error = 'boom | `x`\nnext';
    report.unmapped.models = ['a|b'];
    const markdown = renderIngestRunReportMarkdown(report);
    expect(markdown).toContain('Status: **failed**');
    expect(markdown).toContain("Error: `boom   'x' next`");
    expect(markdown).toContain('- unmapped models: a b');
  });
});
