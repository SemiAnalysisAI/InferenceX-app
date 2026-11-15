import { describe, expect, it } from 'vitest';

import { buildSlaConfigs, slaWorkloadOfRow, type SlaConfigRow } from './dataset';

function row(overrides: Partial<SlaConfigRow> = {}): SlaConfigRow {
  return {
    id: 1,
    hardware: 'b300',
    framework: 'sglang',
    precision: 'fp4',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 16,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v1',
    date: '2026-09-29',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/36463674051',
    ...overrides,
  };
}

describe('buildSlaConfigs', () => {
  it('keeps offload modes and topologies in separate configurations', () => {
    const configs = buildSlaConfigs(
      [
        row({ id: 1, conc: 16 }),
        row({ id: 2, conc: 32 }),
        row({ id: 3, conc: 64, offload_mode: 'on' }),
        row({
          id: 4,
          conc: 16,
          decode_tp: 4,
          prefill_tp: 4,
          num_decode_gpu: 4,
          num_prefill_gpu: 4,
        }),
      ],
      () => true,
    );
    expect(
      configs.map((config) => [config.offloadMode, config.gpuCount, config.points.length]),
    ).toEqual([
      ['off', 4, 1],
      ['off', 8, 2],
      ['on', 8, 1],
    ]);
  });

  it('keeps only the latest run of a configuration, never a mix of runs', () => {
    const configs = buildSlaConfigs(
      [
        row({ id: 1, conc: 16 }),
        row({
          id: 2,
          conc: 32,
          date: '2026-10-02',
          run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/37000000000',
        }),
      ],
      () => true,
    );
    expect(configs).toHaveLength(1);
    expect(configs[0].runId).toBe('37000000000');
    expect(configs[0].points.map((point) => point.id)).toEqual([2]);
  });

  it('types the load by workload family', () => {
    const configs = buildSlaConfigs(
      [
        row({ id: 1 }),
        row({ id: 2, benchmark_type: 'single_turn', isl: 8192, osl: 1024, conc: 64 }),
      ],
      (id) => id === 1,
    );
    const agentic = configs.find((config) => config.workload === 'agentic-traces');
    const fixed = configs.find((config) => config.workload === '8k/1k');
    expect(agentic).toMatchObject({ loadKind: 'agentx_users' });
    expect(agentic?.points[0].hasRequestData).toBe(true);
    // Fixed-sequence points carry no request-level data until their runs record it.
    expect(fixed).toMatchObject({ loadKind: 'request_concurrency', datasetSlug: null });
    expect(fixed?.points[0].hasRequestData).toBe(false);
    expect(slaWorkloadOfRow({ benchmark_type: 'single_turn', isl: 1000, osl: 100 })).toBe(
      '1000/100',
    );
  });

  it('attaches run provenance and starts with no excluded loads', () => {
    const [config] = buildSlaConfigs(
      [row()],
      () => false,
      (runId) =>
        runId === '36463674051'
          ? { benchmarkCommit: 'abc123', datasetSlug: 'cc-traces-weka-062126' }
          : undefined,
    );
    expect(config).toMatchObject({
      benchmarkCommit: 'abc123',
      datasetSlug: 'cc-traces-weka-062126',
      harnessVersion: null,
      excluded: [],
      poolSplit: null,
    });
    expect(config.points[0]).toEqual({
      id: 1,
      concurrency: 16,
      hasRequestData: false,
      artifact: null,
      runAttempt: null,
    });
  });
});
