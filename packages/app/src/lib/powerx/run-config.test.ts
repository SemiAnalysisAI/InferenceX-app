import { describe, expect, it } from 'vitest';

import {
  buildRunConfig,
  decodeRunConfig,
  DEFAULT_RUN_CONFIG,
  disabledTopologyReason,
  encodeRunConfig,
  INFERENCEX_CONFIGS_URL,
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
  it('emits clean YAML with no code citations anywhere', () => {
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
    expect(Object.keys(config).toSorted()).toEqual(['file', 'notes', 'yaml']);
    expect(config.yaml).not.toMatch(/\.(?:py|md|yaml):\d+/u);
    expect(INFERENCEX_CONFIGS_URL).toMatch(
      /\/blob\/[0-9a-f]{7,}\/inferencex-e2e\/configs\/CONFIGS\.md$/u,
    );
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
