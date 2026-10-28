import { scenarioSegmentForSequence } from '@/lib/compare/compare-scenario-route';
import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare/compare-slug';
import { getInferenceModelBySlug, inferenceModelPath } from '@/lib/routing/inference-model-slug';

const FEATURED_AGENTX_MODEL_SLUGS = [
  'kimi-k3',
  'muse-spark-open',
  'deepseek-v41-flash',
  'deepseek-v4',
  'glm-5-3',
  'minimax-m3',
  'qwen-3-5',
  'qwen-3-8-flash-next',
] as const;

const AGENTX_NEW_MODEL_SLUGS: readonly (typeof FEATURED_AGENTX_MODEL_SLUGS)[number][] = [];

const AGENTX_ONLY_MODEL_SLUGS: readonly string[] = ['minimax-m31-flash'];

const AGENTX_SCENARIO_MODEL_SET = new Set<string>([
  ...FEATURED_AGENTX_MODEL_SLUGS,
  ...AGENTX_ONLY_MODEL_SLUGS,
]);

export interface ComparisonScenario {
  label: 'AgentX' | '8K/1K';
  sequence: 'agentic-traces' | '8k/1k';
}

export const FEATURED_AGENTX_MODELS: readonly CompareModelSlug[] = FEATURED_AGENTX_MODEL_SLUGS.map(
  (slug) => {
    const model = COMPARE_MODEL_SLUGS.find((candidate) => candidate.slug === slug);
    if (!model) throw new Error(`Missing AgentX comparison model: ${slug}`);
    return model;
  },
);

const AGENTX_NEW_MODEL_SLUG_SET: ReadonlySet<string> = new Set(AGENTX_NEW_MODEL_SLUGS);

export function isNewAgentxModel(model: CompareModelSlug): boolean {
  return AGENTX_NEW_MODEL_SLUG_SET.has(model.slug);
}

export const AGENTX_NEW_MODEL_DISPLAY_NAMES: ReadonlySet<string> = new Set(
  FEATURED_AGENTX_MODELS.filter(isNewAgentxModel).map((model) => model.displayName),
);

export function agentxDashboardHref(locale: 'en' | 'zh', model: CompareModelSlug): string {
  const entry = getInferenceModelBySlug(model.slug);
  const path = entry ? inferenceModelPath(entry.slug) : '/inference';
  const localizedPath = locale === 'zh' ? `/zh${path}` : path;
  const query = new URLSearchParams();
  if (!entry) query.set('g_model', model.displayName);
  return query.size > 0 ? `${localizedPath}?${query}` : localizedPath;
}

export function comparisonScenarioForModel(model: CompareModelSlug): ComparisonScenario {
  return AGENTX_SCENARIO_MODEL_SET.has(model.slug)
    ? { label: 'AgentX', sequence: 'agentic-traces' }
    : { label: '8K/1K', sequence: '8k/1k' };
}

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
