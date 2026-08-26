import { scenarioSegmentForSequence } from '@/lib/compare-scenario-route';
import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { getInferenceModelBySlug, inferenceModelPath } from '@/lib/inference-model-slug';

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
  // The model rides in the path — the indexable `/inference/<model>` subroute
  // — so these hero links point crawlers at the canonical model page instead
  // of a `?g_model=` variant of the base dashboard. Models without a
  // registered inference page (none of the featured set today) fall back to
  // the query form.
  const entry = getInferenceModelBySlug(model.slug);
  const query = new URLSearchParams();
  if (!entry) query.set('g_model', model.displayName);
  query.set('i_seq', 'agentic-traces');
  query.set('i_optimal', '1');
  const path = entry ? inferenceModelPath(entry.slug) : '/inference';
  return `${locale === 'zh' ? `/zh${path}` : path}?${query}`;
}

export function comparisonScenarioForModel(model: CompareModelSlug): ComparisonScenario {
  return FEATURED_AGENTX_MODEL_SET.has(model.slug)
    ? { label: 'AgentX', sequence: 'agentic-traces' }
    : { label: '8K→1K', sequence: '8k/1k' };
}

/**
 * Catalog card link for a comparison pair, pointing at the workload the model
 * actually has data for. The workload rides in the path (`/…/<slug>/agentic`)
 * rather than `?i_seq=`, so a card links to a real, shareable address for that
 * scenario instead of a query-string variant of the default view.
 */
export function comparisonPairHref(
  locale: 'en' | 'zh',
  slug: string,
  model: CompareModelSlug,
  family: 'compare' | 'compare-per-dollar' = 'compare',
): string {
  const path = locale === 'zh' ? `/zh/${family}/${slug}` : `/${family}/${slug}`;
  const segment = scenarioSegmentForSequence(comparisonScenarioForModel(model).sequence);
  return segment ? `${path}/${segment}` : path;
}
