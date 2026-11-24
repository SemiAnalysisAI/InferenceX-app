import { describe, expect, it } from 'bun:test';

import type { AvailabilityRow } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { prerenderedCompareSlugs } from './compare-availability';

const row = (model: string, hardware: string, date: string): AvailabilityRow => ({
  model,
  hardware,
  date,
  isl: null,
  osl: null,
  precision: 'fp4',
  framework: 'vllm',
  spec_method: 'none',
  disagg: false,
  benchmark_type: 'agentic_traces',
});

const rows = [
  row('dsr1', 'b200', '2026-10-01'),
  row('dsr1', 'h200', '2026-10-01'),
  row('dsr1', 'mi355x', '2026-09-01'),
  row('kimik3.1', 'b300', '2026-11-20'),
  row('kimik3.1', 'gb300', '2026-11-20'),
  row('kimik3.1', 'tpuv7', '2026-11-21'),
  row('glm5.3flash', 'b200', '2026-11-22'),
  row('glm5.3flash', 'b300', '2026-11-22'),
];

describe('prerenderedCompareSlugs', () => {
  it('lists the newest public models first, pairing only chips with a chip page', () => {
    expect(prerenderedCompareSlugs(rows)).toEqual([
      'kimi-k31-pro-b300-vs-gb300',
      'deepseek-r1-b200-vs-h200',
      'deepseek-r1-b200-vs-mi355x',
      'deepseek-r1-h200-vs-mi355x',
    ]);
  });

  it('stops at the limit', () => {
    expect(prerenderedCompareSlugs(rows, 2)).toEqual([
      'kimi-k31-pro-b300-vs-gb300',
      'deepseek-r1-b200-vs-h200',
    ]);
  });
});
