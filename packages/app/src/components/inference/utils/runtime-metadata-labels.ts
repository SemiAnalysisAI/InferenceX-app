const CACHE_IMPLEMENTATION_LABELS: Record<string, string> = {
  hicache: 'HiCache',
  lmcache: 'LMCache',
  mooncake: 'Mooncake',
  mori: 'MoRI',
  moriio: 'MoRI-IO',
  'mori-io': 'MoRI-IO',
  nixl: 'NIXL',
  atomesh: 'AtoMesh',
  'vllm-native': 'vLLM Native',
  'vllm-router': 'vLLM Router',
  'vllm-simple': 'vLLM Simple',
  'sglang-router': 'SGLang Router',
};

export const cacheImplementationLabel = (value: string): string =>
  CACHE_IMPLEMENTATION_LABELS[value.toLowerCase()] ?? value;

export const offloadTypeLabel = (value: string): string => {
  if (value.toLowerCase() === 'dram') return 'DRAM';
  return value.toUpperCase();
};

export const versionedComponentLabel = (
  name: string | null | undefined,
  version: string | null | undefined,
): string | null => {
  if (!name) return null;
  const label = cacheImplementationLabel(name);
  return version ? `${label} ${version}` : label;
};
