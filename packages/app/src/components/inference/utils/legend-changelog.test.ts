import { describe, expect, it } from 'vitest';
import { MODEL_PREFIX_MAPPING } from '@/lib/data-mappings';
import type { RunInfo } from '../types';
import { legendChangelogsByHardware } from './legend-changelog';

const oldRunId = '31927376673';
const refreshRunId = '33219708211';
const runUrl = (id: string) =>
  `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}/attempts/1`;
const point = {
  hwKey: 'gb300_dynamo-trt',
  model: MODEL_PREFIX_MAPPING['qwen3.5'],
  precision: 'fp4',
  run_url: runUrl(refreshRunId),
};
const unrelatedEntry = {
  config_keys: ['qwen3.5-fp4-b200-sglang-agentic'],
  description: 'Unrelated B200 update.',
  pr_link: null,
};
const refreshEntry = {
  config_keys: ['qwen3.5-fp4-gb300-dynamo-trt-agentic-disagg'],
  description: 'Refresh to collect TensorRT-LLM server metrics.',
  pr_link: 'https://github.com/SemiAnalysisAI/InferenceX/pull/2770',
};
const runs: Record<string, RunInfo> = {
  [refreshRunId]: {
    runId: refreshRunId,
    runUrl: runUrl(refreshRunId),
    runDate: '2026-09-01',
    conclusion: 'success',
    changelog: { entries: [unrelatedEntry, refreshEntry] },
  },
};

describe('legendChangelogsByHardware', () => {
  it('uses the matching config entry, not the selected run first entry', () => {
    expect(legendChangelogsByHardware([point], runs, 'agentic_traces').get(point.hwKey)).toEqual({
      runId: refreshRunId,
      entries: [refreshEntry],
    });
  });

  it('does not label the August 16 point with the September 1 refresh', () => {
    const original = { ...point, run_url: runUrl(oldRunId) };
    expect(legendChangelogsByHardware([original], runs, 'agentic_traces').size).toBe(0);
    expect(legendChangelogsByHardware([original, point], runs, 'agentic_traces').size).toBe(0);
  });

  it('uses the actual producing run when it is available', () => {
    const oldEntry = { ...refreshEntry, description: 'Original submission.' };
    const withHistory = {
      ...runs,
      [oldRunId]: { ...runs[refreshRunId]!, runId: oldRunId, changelog: { entries: [oldEntry] } },
    };
    expect(
      legendChangelogsByHardware(
        [{ ...point, run_url: runUrl(oldRunId) }],
        withHistory,
        'agentic_traces',
      ).get(point.hwKey),
    ).toEqual({ runId: oldRunId, entries: [oldEntry] });
  });

  it('does not attach official changelogs to an unrelated unofficial overlay run', () => {
    expect(
      legendChangelogsByHardware(
        [{ ...point, run_url: runUrl('99999999999') }],
        runs,
        'agentic_traces',
      ).size,
    ).toBe(0);
  });

  it('requires point provenance, matching model, precision, hardware and scenario', () => {
    for (const changed of [
      { run_url: undefined },
      { model: MODEL_PREFIX_MAPPING.dsv4 },
      { precision: 'fp8' },
      { hwKey: 'b300_dynamo-trt' },
    ]) {
      expect(
        legendChangelogsByHardware([{ ...point, ...changed }], runs, 'agentic_traces').size,
      ).toBe(0);
    }
    const fixedOnly = {
      [refreshRunId]: {
        ...runs[refreshRunId]!,
        changelog: {
          entries: [{ ...refreshEntry, config_keys: ['qwen3.5-fp4-gb300-dynamo-trt'] }],
        },
      },
    };
    expect(legendChangelogsByHardware([point], fixedOnly, 'agentic_traces').size).toBe(0);
    expect(legendChangelogsByHardware([point], fixedOnly, 'single_turn').size).toBe(1);
    expect(legendChangelogsByHardware([point], undefined, 'agentic_traces').size).toBe(0);
    expect(legendChangelogsByHardware([], runs, 'agentic_traces').size).toBe(0);
  });
});
