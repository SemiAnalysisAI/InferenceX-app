import { describe, expect, it, vi } from 'vitest';

import { printIngestSummaryFooter } from './ingest-summary';
import { createSkipTracker } from './skip-tracker';

const totals = {
  configs: 1,
  benchmarkResults: 2,
  runStats: 3,
  evalResults: 4,
  evalSamples: 5,
  changelogEntries: 6,
};

function printedLines(unexpectedMetrics: string[]): string[] {
  const tracker = createSkipTracker();
  for (const key of unexpectedMetrics) tracker.unexpectedMetrics.add(key);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    printIngestSummaryFooter(totals, tracker);
    return log.mock.calls.map(([line]) => String(line));
  } finally {
    log.mockRestore();
  }
}

const UNEXPECTED_HEADER = 'Auto-captured unexpected metrics';

describe('printIngestSummaryFooter unexpected metrics', () => {
  it('lists every unexpected metric sorted under its header', () => {
    const lines = printedLines(['tpot_p99', 'goodput']);
    const header = lines.findIndex((line) => line.includes(UNEXPECTED_HEADER));

    expect(lines[0]).toBe('\n  DB totals:');
    expect(header).toBeGreaterThan(0);
    expect(lines.slice(header + 1)).toEqual(['    goodput', '    tpot_p99']);
  });

  it('lists a single unexpected metric', () => {
    const lines = printedLines(['goodput']);
    const header = lines.findIndex((line) => line.includes(UNEXPECTED_HEADER));

    expect(lines.slice(header + 1)).toEqual(['    goodput']);
  });

  it('prints no unexpected metrics section when every metric is known', () => {
    expect(printedLines([]).some((line) => line.includes(UNEXPECTED_HEADER))).toBe(false);
  });
});
