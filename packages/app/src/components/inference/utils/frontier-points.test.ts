import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import {
  FRONTIER_EXPORT_HEADERS,
  frontierExportRow,
  frontierHardwareCounts,
  frontierScope,
} from './frontier-points';
import { globalParetoFrontier } from './global-pareto';

const metric = (y: number) => ({ y, roof: false });
const RUN = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs';
function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 100,
    y: 1,
    hwKey: 'b200_sglang',
    framework: 'sglang',
    date: '2026-09-18',
    tp: 4,
    physicalChips: 4,
    decode_tp: 4,
    precision: 'fp8',
    conc: 1,
    run_url: `${RUN}/35317697106/attempts/1`,
    image: 'lmsysorg/sglang:nightly-dev-cu13-20260918-20518d85',
    tpPerGpu: metric(50),
    tpPerMw: metric(50),
    costh: metric(1),
    costr: metric(1),
    costhi: metric(1),
    costri: metric(1),
    ...overrides,
  };
}

// Interactivity (x, higher is better) vs J/output token (y, lower is better).
const b200 = [
  point({ id: 1, conc: 128, x: 31.6, y: 0.824 }),
  point({ id: 2, conc: 1, x: 186.9, y: 9.065 }),
];
const gb300 = [
  point({
    id: 3,
    hwKey: 'gb300_dynamo-sglang',
    framework: 'dynamo-sglang',
    disagg: true,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    conc: 1,
    x: 206.3,
    y: 12.275,
    run_url: `${RUN}/35319969159/attempts/1`,
  }),
  point({
    id: 6,
    hwKey: 'gb300_dynamo-sglang',
    framework: 'dynamo-sglang',
    disagg: true,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    conc: 4,
    x: 172.2,
    y: 4.634,
    run_url: `${RUN}/35319969159/attempts/1`,
  }),
  point({
    id: 4,
    hwKey: 'gb300_dynamo-sglang',
    framework: 'dynamo-sglang',
    disagg: true,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    conc: 64,
    x: 72.2,
    y: 1.311,
    run_url: `${RUN}/35319969159/attempts/1`,
  }),
];
const mi355x = [
  point({
    id: 5,
    hwKey: 'mi355x_sglang',
    conc: 4,
    x: 110.1,
    y: 4.937,
    run_url: `${RUN}/33348766792/attempts/2`,
    image: 'lmsysorg/sglang-rocm:v0.5.18-rocm720-mi35x-20260828',
  }),
];
const eligible = [...b200, ...gb300, ...mi355x];

describe('frontier provenance', () => {
  it('describes the competing scope and which hardware owns the frontier', () => {
    const frontier = globalParetoFrontier(eligible, true, false);
    // MI355X c4 is dominated by GB300 c4 (faster and cheaper).
    expect(frontier.map((entry) => entry.id)).toEqual([1, 4, 6, 2, 3]);
    expect(frontierHardwareCounts(frontier)).toEqual([
      { hwKey: 'gb300_dynamo-sglang', count: 3 },
      { hwKey: 'b200_sglang', count: 2 },
    ]);
    expect(frontierScope(eligible)).toEqual({
      eligible: 6,
      sources: 3,
      runs: 3,
      topologies: 2,
      images: 2,
    });
    expect(frontierScope([])).toEqual({
      eligible: 0,
      sources: 0,
      runs: 0,
      topologies: 0,
      images: 0,
    });
  });

  it('exports one row per frontier point with its run, attempt and recipe identity', () => {
    const row = frontierExportRow(gb300[2]);
    expect(row).toHaveLength(FRONTIER_EXPORT_HEADERS.length);
    const record = Object.fromEntries(
      FRONTIER_EXPORT_HEADERS.map((key, index) => [key, row[index]]),
    );
    expect(record).toMatchObject({
      hardware: 'gb300_dynamo-sglang',
      framework: 'dynamo-sglang',
      concurrency: 64,
      x: 72.2,
      y: 1.311,
      run_id: '35319969159',
      run_attempt: 1,
      recipe_fingerprint: null,
      point_id: 4,
    });
    expect(String(record.topology)).toMatch(/^PD\|/u);
    expect(frontierExportRow(point({ run_url: undefined }))).toContain(null);
  });
});
