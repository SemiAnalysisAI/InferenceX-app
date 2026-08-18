import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';

const FEATURED_AGENTX_MODEL_SLUGS = [
  'kimi-k3',
  'deepseek-v4',
  'minimax-m3',
  'qwen-3-5',
  'glm-5-2',
] as const;

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
