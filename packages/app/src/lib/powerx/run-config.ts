import { snapTo } from './widget-hash';

/**
 * Pure generator behind the "Run-config generator" widget on /powerx/tutorial.
 *
 * Every emitted line cites its InferenceX source at `INFERENCEX_CONFIG_REVISION`
 * (paths relative to `inferencex-e2e/` unless they start with `.github/`).
 */

export const INFERENCEX_CONFIG_REVISION = 'e1356ab';
export const INFERENCEX_CONFIGS_URL = `https://github.com/SemiAnalysisAI/InferenceX/blob/${INFERENCEX_CONFIG_REVISION}/inferencex-e2e/configs/CONFIGS.md`;

export const RUN_PLATFORMS = ['hgx', 'nvl72', 'amd'] as const;
export type RunPlatform = (typeof RUN_PLATFORMS)[number];
export const RUN_TOPOLOGIES = ['single', 'multi'] as const;
export type RunTopology = (typeof RUN_TOPOLOGIES)[number];
export const RUN_WORKLOADS = ['fixed', 'agentx'] as const;
export type RunWorkload = (typeof RUN_WORKLOADS)[number];
export const RUN_STRICTNESS = ['best-effort', 'require'] as const;
export type RunStrictness = (typeof RUN_STRICTNESS)[number];

export interface RunConfigSelection {
  platform: RunPlatform;
  topology: RunTopology;
  workload: RunWorkload;
  strictness: RunStrictness;
}

export const DEFAULT_RUN_CONFIG: RunConfigSelection = {
  platform: 'hgx',
  topology: 'multi',
  workload: 'fixed',
  strictness: 'best-effort',
};

export type RunConfigNote = 'nvl72-grace' | 'amd-exporter' | 'agentx-lane';

/**
 * Multi-node AMD power is not collected: no AMD cluster has a `POWER_LANES` entry
 * (`infx/launch/drivers/srt/power.py:42-130` lists gb200-nv, gb300-nv, b300-dsxe, b200-nscale and
 * h200-dgxc only) and no `configs/amd-master.yaml` entry sets `power: true`, so the launcher
 * would reject the lane (`power.py:153-155`).
 */
export function disabledTopologyReason(
  platform: RunPlatform,
  topology: RunTopology,
): 'amd-multi' | null {
  return platform === 'amd' && topology === 'multi' ? 'amd-multi' : null;
}

/** Snaps an AMD multi-node choice back to single node. */
export function normalizeRunConfig(selection: RunConfigSelection): RunConfigSelection {
  return disabledTopologyReason(selection.platform, selection.topology)
    ? { ...selection, topology: 'single' }
    : selection;
}

export interface RunConfig {
  yaml: string;
  workflowInput: string;
  result: string;
  notes: RunConfigNote[];
  revision: string;
}

const MASTER_FILE: Record<RunPlatform, string> = {
  hgx: 'configs/nvidia-master.yaml',
  nvl72: 'configs/nvidia-master.yaml',
  amd: 'configs/amd-master.yaml',
};

const ENTRY: Record<RunPlatform, { single: string; multi: string; recipeDir: string }> = {
  hgx: {
    single: 'dsr1-fp4-b200-sglang',
    multi: 'kimik3-fp4-h200-dynamo-sglang',
    recipeDir: 'dsr1/sglang/b200-fp4',
  },
  nvl72: {
    single: 'dsv4-fp4-gb200-sglang',
    multi: 'kimik3-fp4-gb200-dynamo-vllm',
    recipeDir: 'dsv4/sglang/gb200-fp4',
  },
  amd: {
    single: 'dsr1-fp4-mi355x-sglang',
    multi: 'dsr1-fp4-mi355x-sglang',
    recipeDir: 'dsr1/sglang/mi355x-fp4',
  },
};

function singleNodeYaml(selection: RunConfigSelection): string {
  const entry = ENTRY[selection.platform];
  const header = [
    `# ${MASTER_FILE[selection.platform]} — single-node entry (${entry.single} pattern)`,
    "# nothing to add: single-node entries inherit telemetry-native.yaml and the cluster's",
    '# default_gpu_exporter; power: true is rejected here (infx/matrix/validation.py:714-716)',
  ];
  const rows =
    selection.workload === 'agentx'
      ? [
          '  scenarios:',
          '    agentic-coding:',
          '    - dram-utilization: 0.80',
          '      search-space:',
          '      - tp: 8',
          '        kv-offloading: none                # required on single-node agentic rows (validation.py:710-713)',
          '        conc-list: [1, 2, 4, 8]',
          '        srt-recipe: agentic.yaml           # ENABLE_AGENTX_POWER=1 is set when telemetry is enabled (infx/srt_slurm/workload.py:345-347)',
        ]
      : [
          '  scenarios:',
          '    fixed-seq-len:',
          '    - isl: 8192',
          '      osl: 1024',
          '      search-space:',
          '      - tp: 8',
          '        conc-start: 4',
          '        conc-end: 64',
          '        srt-recipe: 8k1k.yaml              # recipe merges configs/srt-recipes/telemetry-native.yaml (RECIPES.md:56)',
        ];
  return [
    ...header,
    `${entry.single}:`,
    '  multinode: false',
    `  srt-recipe-dir: ${entry.recipeDir}     # configs/srt-recipes/<dir>/<srt-recipe>`,
    ...rows,
  ].join('\n');
}

function multiNodeYaml(selection: RunConfigSelection): string {
  const entry = ENTRY[selection.platform];
  const requireLine =
    selection.strictness === 'require'
      ? [
          '      require-power: true                # fails the point on an invalid window (validation.py:640)',
        ]
      : [];
  const scenario =
    selection.workload === 'agentx'
      ? [
          '  scenarios:',
          '    agentic-coding:',
          '    - dram-utilization: 0.80',
          ...requireLine,
          '      search-space:',
          '      - spec-decoding: mtp',
          '        kv-offloading: none',
          '        conc-list: [1, 2, 4, 8]',
          '        num-nodes: 4                       # validation.py:664',
          '        srt-recipe: agg-tp16dp2ep32-latency.yaml',
          '        power: true                        # merges configs/srt-recipes/telemetry-dcgm.yaml (CONFIGS.md:156); lane rule must have agentx=True (infx/launch/drivers/srt/power.py:45-53)',
        ]
      : [
          '  scenarios:',
          '    fixed-seq-len:',
          '    - isl: 8192',
          '      osl: 1024',
          ...requireLine,
          '      search-space:',
          '      - num-nodes: 4                       # validation.py:664',
          '        srt-recipe: agg-tp16dp2ep32-latency.yaml',
          '        power: true                        # merges configs/srt-recipes/telemetry-dcgm.yaml (CONFIGS.md:156); lane must be in POWER_LANES (infx/launch/drivers/srt/power.py:42)',
          '        conc-list: [1, 2, 4, 8]',
        ];
  return [
    `# ${MASTER_FILE[selection.platform]} — multinode entry (${entry.multi} pattern, nvidia-master.yaml:1380-1386)`,
    `${entry.multi}:`,
    '  multinode: true                      # only multinode rows accept power: true (validation.py:714-716)',
    ...scenario,
  ].join('\n');
}

function workflowInput(selection: RunConfigSelection): string {
  if (selection.strictness === 'best-effort') {
    return [
      '# not needed: an invalid window records power_valid: 0 and the run still passes',
      '# (configs/CONFIGS.md:283-287)',
    ].join('\n');
  }
  const template =
    selection.topology === 'multi'
      ? '.github/workflows/benchmark-multinode-tmpl.yml:66 → :146'
      : '.github/workflows/benchmark-tmpl.yml:77 → :100';
  return [
    `# workflow_dispatch input (${template})`,
    'require-power: true',
    '',
    '# same thing from a shell on the runner',
    'export REQUIRE_POWER=1                 # → telemetry.required (infx/srt_slurm/workload.py:341-343)',
  ].join('\n');
}

function resultText(selection: RunConfigSelection): string {
  const roleKeys =
    selection.topology === 'multi'
      ? [
          '  "prefill_avg_power_w": 1013.6,      # ROLE_METRIC_KEYS, prefill/decode deployments only',
          '  "decode_avg_power_w": 621.4,',
          '  "prefill_joules_per_input_token": 0.09,',
          '  "decode_joules_per_output_token": 1.71,',
        ]
      : [];
  return [
    '# aggregate result JSON, one per concurrency point (infx/results/power/__init__.py:8-32)',
    '{',
    '  "power_metric_schema_version": 2,',
    '  "power_valid": 1,                     # 0 keeps the throughput and drops every key below',
    '  "avg_power_w": 684.2,                 # per GPU, time-weighted over the window',
    '  "p75_power_w": 731.0,',
    '  "p90_power_w": 768.5,',
    '  "avg_total_gpu_power_w": 5473.6,      # whole deployment',
    '  "total_gpu_energy_j": 1642080.0,',
    '  "joules_per_output_token": 1.79,',
    '  "joules_per_input_token": 0.21,',
    '  "joules_per_total_token": 0.19,',
    '  "joules_per_successful_query": 1817.4,',
    ...roleKeys,
    '}',
    '',
    `# power_audit_<RESULT> artifact (infx/results/power/multinode.py:4, fixed_sequence.py:264)`,
    'samples.csv                           # one row per GPU per second',
    'manifest.json                         # exporter image sha256, producer git commit',
    'windows/*.json                        # serving window per point',
    'power_validation_<RESULT>.json        # verdict, reason_codes, per_gpu_max_sample_gap_s',
  ].join('\n');
}

export function buildRunConfig(input: RunConfigSelection): RunConfig {
  const selection = normalizeRunConfig(input);
  const notes: RunConfigNote[] = [];
  if (selection.platform === 'nvl72') notes.push('nvl72-grace');
  if (selection.platform === 'amd') notes.push('amd-exporter');
  if (selection.workload === 'agentx' && selection.topology === 'multi') notes.push('agentx-lane');
  return {
    yaml: selection.topology === 'multi' ? multiNodeYaml(selection) : singleNodeYaml(selection),
    workflowInput: workflowInput(selection),
    result: resultText(selection),
    notes,
    revision: INFERENCEX_CONFIG_REVISION,
  };
}

/** `platform_topology_workload_strictness`, e.g. `hgx_multi_fixed_best-effort`. */
export function encodeRunConfig(selection: RunConfigSelection): string {
  const normalized = normalizeRunConfig(selection);
  return [
    normalized.platform,
    normalized.topology,
    normalized.workload,
    normalized.strictness,
  ].join('_');
}

export function decodeRunConfig(raw: string | null): RunConfigSelection {
  const [platform, topology, workload, strictness] = (raw ?? '').split('_');
  const defaults = DEFAULT_RUN_CONFIG;
  return normalizeRunConfig({
    platform: snapTo(platform, RUN_PLATFORMS, defaults.platform),
    topology: snapTo(topology, RUN_TOPOLOGIES, defaults.topology),
    workload: snapTo(workload, RUN_WORKLOADS, defaults.workload),
    strictness: snapTo(strictness, RUN_STRICTNESS, defaults.strictness),
  });
}
