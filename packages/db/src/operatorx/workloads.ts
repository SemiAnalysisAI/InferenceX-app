/**
 * Workload sources: which model or shape set a case comes from, so the dashboard can
 * group cases by origin ("Kimi-K3 MoE", "DeepSeek-V4 serving GEMMs") and compare hardware
 * on the same workload.
 */

export interface WorkloadSource {
  id: string;
  label: string;
}

/** Model family from a checkpoint id: org, variant suffix and quantization tags dropped. */
export function modelFamily(name: string): string {
  const repo = name.split(':')[0].split('/').pop() ?? name;
  return repo
    .replaceAll(/-(?:fp8|nvfp4|mxfp4|mxfp8|attnfp8|fp4|preview)(?=-|$)/giu, '')
    .replace(/-v\d+$/iu, '');
}

const TESTLIST_LABELS: Record<string, string> = {
  gemm: 'InferenceX GEMM shapes',
  gemm_perf: 'GEMM smoke shapes',
  gemm_serving_8k1k_min: 'DeepSeek-V4 serving GEMMs (8k/1k)',
  gemm_serving_all_min: 'DeepSeek-V4 serving GEMMs (all scenarios)',
};

/**
 * Sources of one case: the model families of its checkpoint ids (`org/name`; one shape can
 * come from several models); cases without a model id fall back to their testlist.
 */
export function workloadSources(
  opType: string,
  testlist: string,
  names: string[],
): WorkloadSource[] {
  const suffix = opType === 'moe' ? 'MoE' : opType.toUpperCase();
  const models = names.filter((n) => n.includes('/'));
  if (models.length > 0) {
    const families = [...new Set(models.map(modelFamily))];
    return families.map((f) => ({ id: `${opType}:${f}`, label: `${f} ${suffix}` }));
  }
  return [{ id: `${opType}:testlist:${testlist}`, label: TESTLIST_LABELS[testlist] ?? testlist }];
}
