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
  it('emits clean YAML with the citations beside it, not inside it', () => {
    const config = buildRunConfig(VARIANTS['hgx multi fixed require']);
    expect(config.yaml).toMatchInlineSnapshot(`
      "kimik3-fp4-h200-dynamo-sglang:
        multinode: true
        scenarios:
          fixed-seq-len:
          - isl: 8192
            osl: 1024
            require-power: true
            search-space:
            - num-nodes: 4
              srt-recipe: agg-tp16dp2ep32-latency.yaml
              power: true
              conc-list: [1, 2, 4, 8]"
    `);
    expect(config.yaml).not.toContain('#');
    expect(config.file).toBe('configs/nvidia-master.yaml');
    expect(config.sources).toEqual([
      'configs/nvidia-master.yaml:1380-1386',
      'infx/matrix/validation.py:714-716',
      'infx/matrix/validation.py:640',
      'infx/matrix/validation.py:664',
      'configs/CONFIGS.md:156; infx/launch/drivers/srt/power.py:42',
    ]);
  });

  it('only emits power: true and require-power on multi-node rows', () => {
    const single = buildRunConfig(VARIANTS['hgx single fixed best-effort']);
    expect(single.yaml).toContain('multinode: false');
    expect(single.yaml).not.toContain('power: true');
    expect(single.yaml).not.toContain('require-power');
    expect(single.notes).toEqual(['single-node']);
    const strictSingle = buildRunConfig({
      ...VARIANTS['hgx single fixed best-effort'],
      strictness: 'require',
    });
    expect(strictSingle.yaml).not.toContain('require-power');
    const agentx = buildRunConfig(VARIANTS['nvl72 multi agentx best-effort']);
    expect(agentx.yaml).toContain('agentic-coding:');
    expect(agentx.yaml).toContain('power: true');
    expect(agentx.yaml).not.toContain('require-power');
    expect(agentx.sources).toContain(
      'configs/CONFIGS.md:156; infx/launch/drivers/srt/power.py:45-53',
    );
  });

  it('flips the notes with the selection', () => {
    expect(buildRunConfig(VARIANTS['hgx multi fixed require']).notes).toEqual([]);
    expect(buildRunConfig(VARIANTS['nvl72 multi agentx best-effort']).notes).toEqual([
      'nvl72-grace',
      'agentx-lane',
    ]);
    expect(buildRunConfig(VARIANTS['amd single agentx best-effort']).notes).toEqual([
      'single-node',
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
    expect(buildRunConfig(amdMulti).file).toBe('configs/amd-master.yaml');
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
