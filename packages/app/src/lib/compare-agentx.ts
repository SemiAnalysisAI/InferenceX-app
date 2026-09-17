import { scenarioSegmentForSequence } from '@/lib/compare-scenario-route';
import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { getInferenceModelBySlug, inferenceModelPath } from '@/lib/inference-model-slug';

/**
 * Editorial ordering of the AgentX hero ledger on `/compare` and the landing
 * page. Every model here has AgentX data and a registered `/inference/<slug>`
 * page; the order is a product call, not alphabetical or by launch date.
 */
const FEATURED_AGENTX_MODEL_SLUGS = [
  'kimi-k3',
  // V4.1 Flash sits directly under Kimi K3, ahead of the V4 Pro flagship it
  // post-dates (InferenceX#2961).
  'deepseek-v41-flash',
  'deepseek-v4',
  'glm-5-3',
  'minimax-m3',
  // Editorial call: Flash Next sits below Qwen 3.5, the family's flagship row.
  'qwen-3-5',
  'qwen-3-8-flash-next',
] as const;

/**
 * Featured models that still carry the NEW pill — in the hero ledger and in
 * the /inference model selector. Presence in the ledger and the NEW badge are
 * separate editorial decisions: a model stays featured for as long as its
 * AgentX results matter, while the pill retires once the launch is old news.
 * DeepSeek V4 Pro, MiniMax M3, and Qwen 3.5 keep their rows without the pill.
 */
const AGENTX_NEW_MODEL_SLUGS = [
  'kimi-k3',
  'deepseek-v41-flash',
  'glm-5-3',
  'qwen-3-8-flash-next',
] as const satisfies readonly (typeof FEATURED_AGENTX_MODEL_SLUGS)[number][];

/**
 * AgentX-only models that are NOT part of the editorial featured set above.
 *
 * The featured list is an editorial ordering — it drives the compare hero
 * ledger. Which workload a model actually has data for is a separate, factual
 * question, and the two can diverge: a model that enters the fleet on AgentX
 * only would render an empty compare page if it defaulted to 8K/1K, but
 * promoting it into the hero is a product decision this list deliberately
 * does not make. The list is empty today (DeepSeek V4.1 Flash was promoted
 * into the featured set); the mechanism stays for the next day-zero model.
 *
 * Keep this in sync with OVERVIEW_MODEL_SCENARIOS in `overview-data.ts` — that
 * map is the same fact for the overview matrix. `compare-agentx.test.ts` pins
 * the agreement rather than importing the overview module here, which would
 * pull the matrix builder into the client bundle through ChartControls.
 */
const AGENTX_ONLY_MODEL_SLUGS: readonly string[] = [];

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

const AGENTX_NEW_MODEL_SLUG_SET: ReadonlySet<string> = new Set(AGENTX_NEW_MODEL_SLUGS);

/** Whether a featured ledger row carries the NEW pill. */
export function isNewAgentxModel(model: CompareModelSlug): boolean {
  return AGENTX_NEW_MODEL_SLUG_SET.has(model.slug);
}

/**
 * `Model` enum values (the dashboard's model identifiers) for the models that
 * carry the NEW badge. The landing/compare hero ledger and the /inference
 * model selector both read from this one list, so the pill retires (or
 * arrives) everywhere in a single edit.
 */
export const AGENTX_NEW_MODEL_DISPLAY_NAMES: ReadonlySet<string> = new Set(
  FEATURED_AGENTX_MODELS.filter(isNewAgentxModel).map((model) => model.displayName),
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
