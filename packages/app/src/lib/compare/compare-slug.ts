import { GPU_KEYS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

const SEPARATOR = '-vs-';

export interface CompareModelSlug {
  slug: string;
  displayName: string;
  dbKeys: string[];
  label: string;
  seoName: string;
}

export const COMPARE_MODEL_SLUGS: CompareModelSlug[] = [
  {
    slug: 'muse-spark-open',
    displayName: 'Muse-Spark-Open',
    dbKeys: ['musespark'],
    label: 'Muse Spark Open 816B',
    seoName: 'Muse Spark Open',
  },
  {
    slug: 'deepseek-v4',
    displayName: 'DeepSeek-V4-Pro',
    dbKeys: ['dsv4'],
    label: 'DeepSeekv4 Pro 0813 1.6T',
    seoName: 'DeepSeek V4 Pro',
  },
  {
    slug: 'deepseek-v41-flash',
    displayName: 'DeepSeek-V4.1-Flash',
    dbKeys: ['dsv41flash'],
    label: 'DeepSeek V4.1 Flash 552B',
    seoName: 'DeepSeek V4.1 Flash',
  },
  {
    slug: 'deepseek-r1',
    displayName: 'DeepSeek-R1-0528',
    dbKeys: ['dsr1'],
    label: 'DeepSeek R1',
    seoName: 'DeepSeek R1',
  },
  {
    slug: 'kimi-k3',
    displayName: 'Kimi-K3',
    dbKeys: ['kimik3'],
    label: 'Kimi K3 2.8T',
    seoName: 'Kimi K3',
  },
  {
    slug: 'kimi-k26',
    displayName: 'Kimi-K2.5',
    dbKeys: ['kimik2.7-code', 'kimik2.6', 'kimik2.5'],
    label: 'Kimi K2.5/K2.6/K2.7-Code 1T',
    seoName: 'Kimi K2.6',
  },
  {
    slug: 'glm-5-1',
    displayName: 'GLM-5',
    dbKeys: ['glm5.1', 'glm5'],
    label: 'GLM 5/5.1',
    seoName: 'GLM-5',
  },
  {
    slug: 'glm-5-3',
    displayName: 'GLM-5.2',
    dbKeys: ['glm5.2', 'glm5.3'],
    label: 'GLM 5.3 744B',
    seoName: 'GLM-5.3',
  },
  {
    slug: 'minimax-m3',
    displayName: 'MiniMax-M3',
    dbKeys: ['minimaxm3'],
    label: 'MiniMax M3 428B',
    seoName: 'MiniMax M3',
  },
  {
    slug: 'minimax-m27',
    displayName: 'MiniMax-M2.5',
    dbKeys: ['minimaxm2.7', 'minimaxm2.5'],
    label: 'MiniMax M2.5/M2.7',
    seoName: 'MiniMax M2.7',
  },
  {
    slug: 'qwen-3-8-flash-next',
    displayName: 'Qwen3.8-Flash-Next',
    dbKeys: ['qwen3.8next'],
    label: 'Qwen 3.8 Flash Next 176B-A6B',
    seoName: 'Qwen3.8-Flash-Next',
  },
  {
    slug: 'qwen-3-8-27b',
    displayName: 'Qwen3.8-27B',
    dbKeys: ['qwen3.827b'],
    label: 'Qwen 3.8 27B',
    seoName: 'Qwen3.8-27B',
  },
  {
    slug: 'qwen-3-8-27b-eager',
    displayName: 'Qwen3.8-27B-Eager',
    dbKeys: ['qwen3.827beager'],
    label: 'Qwen 3.8 27B (eager)',
    seoName: 'Qwen3.8-27B Eager',
  },
  {
    slug: 'qwen-3-5',
    displayName: 'Qwen-3.5-397B-A17B',
    dbKeys: ['qwen3.5'],
    label: 'Qwen 3.5 397B-A17B',
    seoName: 'Qwen3.5',
  },
  {
    slug: 'gptoss-120b',
    displayName: 'gpt-oss-120b',
    dbKeys: ['gptoss120b'],
    label: 'gpt-oss 120B',
    seoName: 'gpt-oss-120b',
  },
  {
    slug: 'llama-3-3-70b',
    displayName: 'Llama-3.3-70B-Instruct-FP8',
    dbKeys: ['llama70b'],
    label: 'Llama 3.3 70B',
    seoName: 'Llama 3.3 70B',
  },
];

export const COMPARE_MODEL_ALIASES: Record<string, string> = {
  deepseek: 'deepseek-r1',
  kimi: 'kimi-k26',
  'kimi-k25': 'kimi-k26',
  qwen: 'qwen-3-5',
  glm: 'glm-5-1',
  'glm-5': 'glm-5-1',
  'glm-5-2': 'glm-5-3',
  minimax: 'minimax-m27',
  'minimax-m25': 'minimax-m27',
  llama: 'llama-3-3-70b',
  gptoss: 'gptoss-120b',
};

export const LEGACY_BARE_DEFAULT_MODEL_SLUG = 'deepseek-r1';

const SLUG_TO_MODEL: Record<string, CompareModelSlug> = Object.fromEntries(
  COMPARE_MODEL_SLUGS.map((m) => [m.slug, m]),
);
const CANONICAL_MODEL_SLUGS = new Set(COMPARE_MODEL_SLUGS.map((m) => m.slug));

export function getCompareModelBySlug(slug: string): CompareModelSlug | null {
  const canonical = COMPARE_MODEL_ALIASES[slug] ?? slug;
  return SLUG_TO_MODEL[canonical] ?? null;
}

const DISPLAY_NAME_TO_SLUG: Record<string, CompareModelSlug> = Object.fromEntries(
  COMPARE_MODEL_SLUGS.map((m) => [m.displayName, m]),
);

export function getModelSlugEntryForDisplayName(displayName: string): CompareModelSlug | null {
  return DISPLAY_NAME_TO_SLUG[displayName] ?? null;
}

export interface ComparePair {
  a: string;
  b: string;
}

export interface CompareSlug {
  model: CompareModelSlug;
  a: string;
  b: string;
  isLegacyBareSlug: boolean;
  isAliasModel: boolean;
}

export function parseCompareSlug(slug: string): CompareSlug | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const sepIdx = lower.indexOf(SEPARATOR);
  if (sepIdx <= 0) return null;

  const b = lower.slice(sepIdx + SEPARATOR.length);
  if (!b || !GPU_KEYS.has(b)) return null;

  const prefix = lower.slice(0, sepIdx);
  if (!prefix) return null;

  let a: string;
  let modelPart: string;
  const lastDash = prefix.lastIndexOf('-');
  if (lastDash === -1) {
    a = prefix;
    modelPart = '';
  } else {
    const candidate = prefix.slice(lastDash + 1);
    if (GPU_KEYS.has(candidate)) {
      a = candidate;
      modelPart = prefix.slice(0, lastDash);
    } else {
      return null;
    }
  }

  if (!GPU_KEYS.has(a) || a === b) return null;

  let modelSlug: string;
  let isLegacyBareSlug = false;
  let isAliasModel = false;
  if (modelPart === '') {
    modelSlug = LEGACY_BARE_DEFAULT_MODEL_SLUG;
    isLegacyBareSlug = true;
  } else if (CANONICAL_MODEL_SLUGS.has(modelPart)) {
    modelSlug = modelPart;
  } else if (COMPARE_MODEL_ALIASES[modelPart]) {
    modelSlug = COMPARE_MODEL_ALIASES[modelPart];
    isAliasModel = true;
  } else {
    return null;
  }

  const model = SLUG_TO_MODEL[modelSlug];
  if (!model) return null;
  return { model, a, b, isLegacyBareSlug, isAliasModel };
}

export function canonicalCompareSlug(modelSlug: string, a: string, b: string): string {
  const [first, second] = [a, b].toSorted();
  return `${modelSlug}-${first}${SEPARATOR}${second}`;
}

export function allCanonicalComparePairs(): ComparePair[] {
  const keys = [...GPU_KEYS].toSorted();
  const pairs: ComparePair[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairs.push({ a: keys[i], b: keys[j] });
    }
  }
  return pairs;
}

export function allCanonicalCompareSlugs(): { modelSlug: string; a: string; b: string }[] {
  const pairs = allCanonicalComparePairs();
  return COMPARE_MODEL_SLUGS.flatMap((m) => pairs.map((p) => ({ modelSlug: m.slug, ...p })));
}

export function compareDisplayLabel(a: string, b: string): string {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  return `${aLabel} vs ${bLabel}`;
}

export function compareModelDisplayLabel(model: CompareModelSlug, a: string, b: string): string {
  return `${model.label} — ${compareDisplayLabel(a, b)}`;
}

export function compareModelSeoName(model: CompareModelSlug): string {
  return model.seoName;
}

export function compareSeoTitle(gpuLabel: string, modelSeoName: string): string {
  const full = `${gpuLabel}: ${modelSeoName} Inference Benchmark`;
  if (full.length <= 60) return full;
  return `${gpuLabel}: ${modelSeoName} Benchmark`;
}
