import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants/models';

import { MODEL_TO_KEY } from '../etl/normalizers';

export interface WorkloadSource {
  id: string;
  label: string;
}

/** Shapes from no checkpoint: source operatorx/Synthetic-Shapes/m<M>_n<N>_k<K>. */
const SYNTHETIC = 'Synthetic-Shapes';

export function modelFamily(name: string): string {
  const repo = name.split(':')[0].split('/').pop() ?? name;
  return repo
    .replaceAll(/-(?:fp8|nvfp4|mxfp4|mxfp8|attnfp8|fp4|preview)(?=-|$)/giu, '')
    .replace(/-v\d+$/iu, '');
}

const familyKeys = new Map<string, string>(
  Object.entries(MODEL_TO_KEY).map(([id, key]) => [modelFamily(id), key] as [string, string]),
);

/**
 * Versions of one architecture share a name, in the workload list and the model view alike:
 * their cases are largely the same shapes.
 */
const VERSION_GROUPS: { match: RegExp; id: string; label: string }[] = [
  { match: /^DeepSeek-V4-Pro(?:-\d+)?$/u, id: 'DeepSeek-V4-Pro', label: 'DeepSeek-V4-Pro' },
  { match: /^GLM-5(?:\.\d+)?$/u, id: 'GLM-5', label: 'GLM-5.x' },
  { match: /^Kimi-K2(?:\.\d+)?$/u, id: 'Kimi-K2', label: 'Kimi-K2.x' },
  { match: /^gpt-oss-120b(?:-w-a)?$/u, id: 'gpt-oss-120b', label: 'gpt-oss-120b' },
  { match: /^Synthetic-Shapes$/u, id: SYNTHETIC, label: 'Synthetic Shapes' },
];

const groupOf = (family: string) => VERSION_GROUPS.find((g) => g.match.test(family));

/** Display name of a source checkpoint's model. */
export function topLevelModel(id: string): string {
  const group = groupOf(modelFamily(id));
  if (group) return group.label;
  const key = MODEL_TO_KEY[id] ?? familyKeys.get(modelFamily(id));
  return (key && DB_MODEL_TO_DISPLAY[key]) ?? modelFamily(id);
}

const TESTLIST_LABELS: Record<string, string> = {
  gemm: 'InferenceX GEMM shapes',
  gemm_perf: 'GEMM smoke shapes',
};

export function workloadSources(
  opType: string,
  testlist: string,
  checkpoints: string[],
): WorkloadSource[] {
  if (checkpoints.length === 0)
    return [{ id: `${opType}:testlist:${testlist}`, label: TESTLIST_LABELS[testlist] ?? testlist }];
  const sources = new Map<string, WorkloadSource>();
  for (const checkpoint of checkpoints) {
    const family = modelFamily(checkpoint);
    const id = groupOf(family)?.id ?? family;
    if (!sources.has(id))
      sources.set(id, { id: `${opType}:${id}`, label: topLevelModel(checkpoint) });
  }
  return [...sources.values()];
}
