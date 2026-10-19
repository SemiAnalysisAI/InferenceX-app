import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants/models';

import { MODEL_TO_KEY } from '../etl/normalizers';

export interface WorkloadSource {
  id: string;
  label: string;
}

export function modelFamily(name: string): string {
  const repo = name.split(':')[0].split('/').pop() ?? name;
  return repo
    .replaceAll(/-(?:fp8|nvfp4|mxfp4|mxfp8|attnfp8|fp4|preview)(?=-|$)/giu, '')
    .replace(/-v\d+$/iu, '');
}

const FAMILY_KEYS: Record<string, string> = {
  'gpt-oss-120b-w-a': 'gptoss120b',
  'DeepSeek-V4-Pro-0813': 'dsv4',
};

const familyKeys = new Map<string, string>([
  ...Object.entries(MODEL_TO_KEY).map(([id, key]) => [modelFamily(id), key] as [string, string]),
  ...Object.entries(FAMILY_KEYS),
]);

export function topLevelModel(id: string): string {
  const key = MODEL_TO_KEY[id] ?? familyKeys.get(modelFamily(id));
  return (key && DB_MODEL_TO_DISPLAY[key]) ?? modelFamily(id);
}

const TESTLIST_LABELS: Record<string, string> = {
  gemm: 'InferenceX GEMM shapes',
  gemm_perf: 'GEMM smoke shapes',
  gemm_serving_8k1k_min: 'DeepSeek-V4 serving GEMMs (8k/1k)',
  gemm_serving_all_min: 'DeepSeek-V4 serving GEMMs (all scenarios)',
};

export function workloadSources(
  opType: string,
  testlist: string,
  checkpoints: string[],
): WorkloadSource[] {
  const suffix = opType === 'moe' ? 'MoE' : opType.toUpperCase();
  if (checkpoints.length > 0) {
    const families = [...new Set(checkpoints.map(modelFamily))];
    return families.map((f) => ({ id: `${opType}:${f}`, label: `${f} ${suffix}` }));
  }
  return [{ id: `${opType}:testlist:${testlist}`, label: TESTLIST_LABELS[testlist] ?? testlist }];
}
