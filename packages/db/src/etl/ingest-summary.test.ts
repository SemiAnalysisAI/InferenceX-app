import { afterEach, describe, expect, it, vi } from 'vitest';

import { printIngestSummaryFooter } from './ingest-summary';
import { createSkipTracker } from './skip-tracker';

const TOTALS = {
  configs: 1,
  benchmarkResults: 2,
  runStats: 3,
  evalResults: 4,
  evalSamples: 5,
  changelogEntries: 6,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('printIngestSummaryFooter', () => {
  it('reports unsupported versions and quarantined rows with the other skips', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tracker = createSkipTracker();
    tracker.skips.unmappedHw = 1;
    tracker.skips.unsupportedVersion = 2;
    tracker.skips.quarantined = 3;

    printIngestSummaryFooter(TOTALS, tracker);

    const output = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('Skipped: 6 rows');
    expect(output).toMatch(/unsupported result_schema_version\s*: 2/u);
    expect(output).toMatch(/quarantined by InferenceX\s*: 3/u);
  });
});
