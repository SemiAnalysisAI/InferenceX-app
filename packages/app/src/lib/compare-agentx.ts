import { scenarioSegmentForSequence } from '@/lib/compare-scenario-route';
import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { getInferenceModelBySlug, inferenceModelPath } from '@/lib/inference-model-slug';

const FEATURED_AGENTX_MODEL_SLUGS = [
  'kimi-k3',
  'deepseek-v4',
  'glm-5-3',
  'minimax-m3',
  // Editorial call: Flash Next sits below Qwen 3.5, the family's flagship row.
  'qwen-3-5',
  'qwen-3-8-flash-next',
] as const;

/**
 * AgentX-only models that are NOT part of the editorial featured set above.
 *
 * The featured list is an editorial ordering — it drives the compare hero
 * ledger and the NEW badge in the /inference model selector. Which workload a
 * model actually has data for is a separate, factual question, and the two
 * stopped coinciding with DeepSeek V4.1 Flash: it entered the fleet on AgentX
 * only (InferenceX#2961), so defaulting it to 8K/1K renders an empty compare
 * page, but promoting it into the hero is a product decision this list
 * deliberately does not make.
 *
 * Keep this in sync with OVERVIEW_MODEL_SCENARIOS in `overview-data.ts` — that
 * map is the same fact for the overview matrix. `compare-agentx.test.ts` pins
 * the agreement rather than importing the overview module here, which would
 * pull the matrix builder into the client bundle through ChartControls.
 */
const AGENTX_ONLY_MODEL_SLUGS = ['deepseek-v41-flash'] as const;

/** Every model whose default compare workload is AgentX: the editorial
 *  featured set plus the AgentX-only models kept out of it. */
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

/**
 * `Model` enum values (the dashboard's model identifiers) for the featured
 * AgentX set. The landing/compare hero ledger and the /inference model
 * selector both mark these models with a NEW badge, so the badge follows the
 * single featured list instead of maintaining a second one.
 */
export const AGENTX_NEW_MODEL_DISPLAY_NAMES: ReadonlySet<string> = new Set(
  FEATURED_AGENTX_MODELS.map((model) => model.displayName),
);

export function agentxDashboardHref(locale: 'en' | 'zh', model: CompareModelSlug): string {
  // The model rides in the path — the indexable `/inference/<model>` subroute
  // — so these hero links point crawlers at the canonical model page instead
  // of a `?g_model=` variant of the base dashboard. Models without a
  // registered inference page (none of the featured set today) fall back to
  // the query form.
  //
  // No `i_seq` / `i_optimal` params: every model here has AgentX data, and the
  // dashboard already defaults such models to the Agentic scenario
  // (resolveEffectiveSequence) with "Optimal Only" on (i_optimal !== '0'), so
  // the bare model page IS the AgentX optimal-only view — and the canonical,
  // shareable address for it.
  const entry = getInferenceModelBySlug(model.slug);
  const path = entry ? inferenceModelPath(entry.slug) : '/inference';
  const localizedPath = locale === 'zh' ? `/zh${path}` : path;
  if (entry) return localizedPath;
  const query = new URLSearchParams({ g_model: model.displayName });
  return `${localizedPath}?${query}`;
}

export function comparisonScenarioForModel(model: CompareModelSlug): ComparisonScenario {
  return AGENTX_SCENARIO_MODEL_SET.has(model.slug)
    ? { label: 'AgentX', sequence: 'agentic-traces' }
    : { label: '8K/1K', sequence: '8k/1k' };
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
