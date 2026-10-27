import { snapTo } from './widget-hash';

/**
 * Pure generator behind the run-config widget on /powerx/tutorial. The YAML stays clean; the
 * InferenceX lines each row comes from are returned separately (paths relative to
 * `inferencex-e2e/` at `INFERENCEX_CONFIG_REVISION`).
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

export type RunConfigNote = 'nvl72-grace' | 'amd-exporter' | 'agentx-lane' | 'single-node';

/**
 * Multi-node AMD power is not collected: no AMD cluster has a `POWER_LANES` entry
 * (`infx/launch/drivers/srt/power.py:42-130`) and no `configs/amd-master.yaml` entry sets
 * `power: true`, so the launcher would reject the lane (`power.py:153-155`).
 */
export function disabledTopologyReason(
  platform: RunPlatform,
  topology: RunTopology,
): 'amd-multi' | null {
  return platform === 'amd' && topology === 'multi' ? 'amd-multi' : null;
}

export function normalizeRunConfig(selection: RunConfigSelection): RunConfigSelection {
  return disabledTopologyReason(selection.platform, selection.topology)
    ? { ...selection, topology: 'single' }
    : selection;
}

export interface RunConfig {
  file: string;
  yaml: string;
  /** InferenceX locations the rows come from, in the order they first apply. */
  sources: string[];
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

interface Line {
  text: string;
  source?: string;
}

function singleNodeLines(selection: RunConfigSelection): Line[] {
  const entry = ENTRY[selection.platform];
  const scenario: Line[] =
    selection.workload === 'agentx'
      ? [
          { text: '  scenarios:' },
          { text: '    agentic-coding:' },
          { text: '    - dram-utilization: 0.80' },
          { text: '      search-space:' },
          { text: '      - tp: 8' },
          { text: '        kv-offloading: none', source: 'infx/matrix/validation.py:710-713' },
          { text: '        conc-list: [1, 2, 4, 8]' },
          {
            text: '        srt-recipe: agentic.yaml',
            source: 'infx/srt_slurm/workload.py:345-347',
          },
        ]
      : [
          { text: '  scenarios:' },
          { text: '    fixed-seq-len:' },
          { text: '    - isl: 8192' },
          { text: '      osl: 1024' },
          { text: '      search-space:' },
          { text: '      - tp: 8' },
          { text: '        conc-start: 4' },
          { text: '        conc-end: 64' },
          { text: '        srt-recipe: 8k1k.yaml', source: 'srt-slurm-recipes/RECIPES.md:56' },
        ];
  return [
    { text: `${entry.single}:`, source: 'infx/matrix/validation.py:714-716' },
    { text: '  multinode: false' },
    { text: `  srt-recipe-dir: ${entry.recipeDir}` },
    ...scenario,
  ];
}

function multiNodeLines(selection: RunConfigSelection): Line[] {
  const entry = ENTRY[selection.platform];
  const requireLine: Line[] =
    selection.strictness === 'require'
      ? [{ text: '      require-power: true', source: 'infx/matrix/validation.py:640' }]
      : [];
  const powerLine: Line = {
    text: '        power: true',
    source:
      selection.workload === 'agentx'
        ? 'configs/CONFIGS.md:156; infx/launch/drivers/srt/power.py:45-53'
        : 'configs/CONFIGS.md:156; infx/launch/drivers/srt/power.py:42',
  };
  const scenario: Line[] =
    selection.workload === 'agentx'
      ? [
          { text: '  scenarios:' },
          { text: '    agentic-coding:' },
          { text: '    - dram-utilization: 0.80' },
          ...requireLine,
          { text: '      search-space:' },
          { text: '      - spec-decoding: mtp' },
          { text: '        kv-offloading: none' },
          { text: '        conc-list: [1, 2, 4, 8]' },
          { text: '        num-nodes: 4', source: 'infx/matrix/validation.py:664' },
          { text: '        srt-recipe: agg-tp16dp2ep32-latency.yaml' },
          powerLine,
        ]
      : [
          { text: '  scenarios:' },
          { text: '    fixed-seq-len:' },
          { text: '    - isl: 8192' },
          { text: '      osl: 1024' },
          ...requireLine,
          { text: '      search-space:' },
          { text: '      - num-nodes: 4', source: 'infx/matrix/validation.py:664' },
          { text: '        srt-recipe: agg-tp16dp2ep32-latency.yaml' },
          powerLine,
          { text: '        conc-list: [1, 2, 4, 8]' },
        ];
  return [
    { text: `${entry.multi}:`, source: 'configs/nvidia-master.yaml:1380-1386' },
    { text: '  multinode: true', source: 'infx/matrix/validation.py:714-716' },
    ...scenario,
  ];
}

export function buildRunConfig(input: RunConfigSelection): RunConfig {
  const selection = normalizeRunConfig(input);
  const lines =
    selection.topology === 'multi' ? multiNodeLines(selection) : singleNodeLines(selection);
  const notes: RunConfigNote[] = [];
  if (selection.topology === 'single') notes.push('single-node');
  if (selection.platform === 'nvl72') notes.push('nvl72-grace');
  if (selection.platform === 'amd') notes.push('amd-exporter');
  if (selection.workload === 'agentx' && selection.topology === 'multi') notes.push('agentx-lane');
  const sources: string[] = [];
  for (const line of lines) {
    if (line.source && !sources.includes(line.source)) sources.push(line.source);
  }
  return {
    file: MASTER_FILE[selection.platform],
    yaml: lines.map((line) => line.text).join('\n'),
    sources,
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
