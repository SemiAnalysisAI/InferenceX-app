import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';

const FEATURED_AGENTX_MODEL_SLUGS = [
  'kimi-k3',
  'deepseek-v4',
  'glm-5-2',
  'minimax-m3',
  'qwen-3-5',
] as const;

const FEATURED_AGENTX_MODEL_SET = new Set<string>(FEATURED_AGENTX_MODEL_SLUGS);

export interface ComparisonScenario {
  label: 'AgentX' | '8K→1K';
  sequence: 'agentic-traces' | '8k/1k';
}

export const FEATURED_AGENTX_MODELS: readonly CompareModelSlug[] = FEATURED_AGENTX_MODEL_SLUGS.map(
  (slug) => {
    const model = COMPARE_MODEL_SLUGS.find((candidate) => candidate.slug === slug);
    if (!model) throw new Error(`Missing AgentX comparison model: ${slug}`);
    return model;
  },
);

export function agentxDashboardHref(locale: 'en' | 'zh', model: CompareModelSlug): string {
  const path = locale === 'zh' ? '/zh/inference' : '/inference';
  const query = new URLSearchParams({
    g_model: model.displayName,
    i_seq: 'agentic-traces',
    i_optimal: '1',
  });
  return `${path}?${query}`;
}

export function comparisonScenarioForModel(model: CompareModelSlug): ComparisonScenario {
  return FEATURED_AGENTX_MODEL_SET.has(model.slug)
    ? { label: 'AgentX', sequence: 'agentic-traces' }
    : { label: '8K→1K', sequence: '8k/1k' };
}

export function comparisonPairHref(
  locale: 'en' | 'zh',
  slug: string,
  model: CompareModelSlug,
): string {
  const path = locale === 'zh' ? `/zh/compare/${slug}` : `/compare/${slug}`;
  const query = new URLSearchParams({ i_seq: comparisonScenarioForModel(model).sequence });
  return `${path}?${query}`;
}
