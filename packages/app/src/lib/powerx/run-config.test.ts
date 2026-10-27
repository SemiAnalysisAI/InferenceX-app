import { describe, expect, it } from 'vitest';

import {
  buildRunConfig,
  decodeRunConfig,
  DEFAULT_RUN_CONFIG,
  disabledTopologyReason,
  encodeRunConfig,
  INFERENCEX_CONFIG_REVISION,
  normalizeRunConfig,
  type RunConfigSelection,
} from './run-config';

const VARIANTS: Record<string, RunConfigSelection> = {
  'hgx multi fixed require': {
    platform: 'hgx',
    topology: 'multi',
    workload: 'fixed',
    strictness: 'require',
  },
  'hgx single fixed best-effort': {
    platform: 'hgx',
    topology: 'single',
    workload: 'fixed',
    strictness: 'best-effort',
  },
  'amd single agentx best-effort': {
    platform: 'amd',
    topology: 'single',
    workload: 'agentx',
    strictness: 'best-effort',
  },
  'nvl72 multi agentx best-effort': {
    platform: 'nvl72',
    topology: 'multi',
    workload: 'agentx',
    strictness: 'best-effort',
  },
};

describe('buildRunConfig', () => {
  it('snapshots the four YAML variants', () => {
    expect(buildRunConfig(VARIANTS['hgx multi fixed require']).yaml).toMatchInlineSnapshot(`
      "# configs/nvidia-master.yaml — multinode entry (kimik3-fp4-h200-dynamo-sglang pattern, nvidia-master.yaml:1380-1386)
      kimik3-fp4-h200-dynamo-sglang:
        multinode: true                      # only multinode rows accept power: true (validation.py:714-716)
        scenarios:
          fixed-seq-len:
          - isl: 8192
            osl: 1024
            require-power: true                # fails the point on an invalid window (validation.py:640)
            search-space:
            - num-nodes: 4                       # validation.py:664
              srt-recipe: agg-tp16dp2ep32-latency.yaml
              power: true                        # merges configs/srt-recipes/telemetry-dcgm.yaml (CONFIGS.md:156); lane must be in POWER_LANES (infx/launch/drivers/srt/power.py:42)
              conc-list: [1, 2, 4, 8]"
    `);
    expect(buildRunConfig(VARIANTS['hgx single fixed best-effort']).yaml).toMatchInlineSnapshot(`
      "# configs/nvidia-master.yaml — single-node entry (dsr1-fp4-b200-sglang pattern)
      # nothing to add: single-node entries inherit telemetry-native.yaml and the cluster's
      # default_gpu_exporter; power: true is rejected here (infx/matrix/validation.py:714-716)
      dsr1-fp4-b200-sglang:
        multinode: false
        srt-recipe-dir: dsr1/sglang/b200-fp4     # configs/srt-recipes/<dir>/<srt-recipe>
        scenarios:
          fixed-seq-len:
          - isl: 8192
            osl: 1024
            search-space:
            - tp: 8
              conc-start: 4
              conc-end: 64
              srt-recipe: 8k1k.yaml              # recipe merges configs/srt-recipes/telemetry-native.yaml (RECIPES.md:56)"
    `);
    expect(buildRunConfig(VARIANTS['amd single agentx best-effort']).yaml).toMatchInlineSnapshot(`
      "# configs/amd-master.yaml — single-node entry (dsr1-fp4-mi355x-sglang pattern)
      # nothing to add: single-node entries inherit telemetry-native.yaml and the cluster's
      # default_gpu_exporter; power: true is rejected here (infx/matrix/validation.py:714-716)
      dsr1-fp4-mi355x-sglang:
        multinode: false
        srt-recipe-dir: dsr1/sglang/mi355x-fp4     # configs/srt-recipes/<dir>/<srt-recipe>
        scenarios:
          agentic-coding:
          - dram-utilization: 0.80
            search-space:
            - tp: 8
              kv-offloading: none                # required on single-node agentic rows (validation.py:710-713)
              conc-list: [1, 2, 4, 8]
              srt-recipe: agentic.yaml           # ENABLE_AGENTX_POWER=1 is set when telemetry is enabled (infx/srt_slurm/workload.py:345-347)"
    `);
    expect(buildRunConfig(VARIANTS['nvl72 multi agentx best-effort']).yaml).toMatchInlineSnapshot(`
      "# configs/nvidia-master.yaml — multinode entry (kimik3-fp4-gb200-dynamo-vllm pattern, nvidia-master.yaml:1380-1386)
      kimik3-fp4-gb200-dynamo-vllm:
        multinode: true                      # only multinode rows accept power: true (validation.py:714-716)
        scenarios:
          agentic-coding:
          - dram-utilization: 0.80
            search-space:
            - spec-decoding: mtp
              kv-offloading: none
              conc-list: [1, 2, 4, 8]
              num-nodes: 4                       # validation.py:664
              srt-recipe: agg-tp16dp2ep32-latency.yaml
              power: true                        # merges configs/srt-recipes/telemetry-dcgm.yaml (CONFIGS.md:156); lane rule must have agentx=True (infx/launch/drivers/srt/power.py:45-53)"
    `);
  });

  it('only emits power: true and require-power on multi-node rows', () => {
    const multi = buildRunConfig(VARIANTS['hgx multi fixed require']);
    expect(multi.yaml).toContain('power: true');
    expect(multi.yaml).toContain('require-power: true');
    expect(multi.yaml).toContain('num-nodes: 4');
    const single = buildRunConfig(VARIANTS['hgx single fixed best-effort']);
    expect(single.yaml).not.toContain('power: true\n');
    expect(single.yaml).toContain('nothing to add');
    expect(single.yaml).toContain('multinode: false');
    const bestEffortMulti = buildRunConfig({
      ...VARIANTS['hgx multi fixed require'],
      strictness: 'best-effort',
    });
    expect(bestEffortMulti.yaml).not.toContain('require-power');
  });

  it('switches the workflow input with strictness', () => {
    expect(buildRunConfig(VARIANTS['hgx single fixed best-effort']).workflowInput).toContain(
      'not needed',
    );
    const required = buildRunConfig({
      ...VARIANTS['hgx single fixed best-effort'],
      strictness: 'require',
    });
    expect(required.workflowInput).toContain('require-power: true');
    expect(required.workflowInput).toContain('REQUIRE_POWER=1');
    expect(required.workflowInput).toContain('benchmark-tmpl.yml');
    expect(buildRunConfig(VARIANTS['hgx multi fixed require']).workflowInput).toContain(
      'benchmark-multinode-tmpl.yml',
    );
  });

  it('lists the aggregate keys and the audit artifact in the result tab', () => {
    const result = buildRunConfig(VARIANTS['hgx multi fixed require']).result;
    for (const key of [
      'power_valid',
      'avg_power_w',
      'p75_power_w',
      'p90_power_w',
      'joules_per_output_token',
      'joules_per_input_token',
      'joules_per_total_token',
      'prefill_avg_power_w',
      'decode_avg_power_w',
      'power_audit_<RESULT>',
      'samples.csv',
      'power_validation_<RESULT>.json',
    ]) {
      expect(result, key).toContain(key);
    }
    expect(buildRunConfig(VARIANTS['hgx single fixed best-effort']).result).not.toContain(
      'prefill_avg_power_w',
    );
  });

  it('flips the notes with the selection', () => {
    expect(buildRunConfig(VARIANTS['hgx multi fixed require']).notes).toEqual([]);
    expect(buildRunConfig(VARIANTS['nvl72 multi agentx best-effort']).notes).toEqual([
      'nvl72-grace',
      'agentx-lane',
    ]);
    expect(buildRunConfig(VARIANTS['amd single agentx best-effort']).notes).toEqual([
      'amd-exporter',
    ]);
    expect(buildRunConfig(VARIANTS['hgx multi fixed require']).revision).toBe(
      INFERENCEX_CONFIG_REVISION,
    );
  });

  it('disables AMD multi-node and snaps it to single node', () => {
    expect(disabledTopologyReason('amd', 'multi')).toBe('amd-multi');
    expect(disabledTopologyReason('amd', 'single')).toBeNull();
    expect(disabledTopologyReason('hgx', 'multi')).toBeNull();
    const amdMulti: RunConfigSelection = {
      ...VARIANTS['amd single agentx best-effort'],
      topology: 'multi',
    };
    expect(normalizeRunConfig(amdMulti).topology).toBe('single');
    expect(buildRunConfig(amdMulti).yaml).toContain('multinode: false');
  });
});

describe('run-config hash codec', () => {
  it('round-trips and snaps', () => {
    const selection = VARIANTS['nvl72 multi agentx best-effort'];
    expect(encodeRunConfig(selection)).toBe('nvl72_multi_agentx_best-effort');
    expect(decodeRunConfig(encodeRunConfig(selection))).toEqual(selection);
    expect(decodeRunConfig(null)).toEqual(DEFAULT_RUN_CONFIG);
    expect(decodeRunConfig('amd_multi_fixed_require')).toEqual({
      platform: 'amd',
      topology: 'single',
      workload: 'fixed',
      strictness: 'require',
    });
    expect(decodeRunConfig('tpu_x_y_z')).toEqual(DEFAULT_RUN_CONFIG);
  });
});
