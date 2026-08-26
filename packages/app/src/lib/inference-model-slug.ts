/**
 * @file inference-model-slug.ts
 * @description Model-slug registry for the indexable `/inference/<model>`
 * subroutes.
 *
 * `/inference?g_model=Kimi-K3` keeps working as a share-link form, but query
 * params are a weak indexing surface: crawlers treat them as views of one page
 * and the canonical collapses them all to `/`. The `/inference/<model>` path
 * form gives every model a stable, individually indexable URL with its own
 * title, description, canonical, and hreflang pair — same playbook as the
 * `/compare/<slug>` pages.
 *
 * The slug vocabulary is deliberately NOT a second naming scheme: entries are
 * derived from `COMPARE_MODEL_SLUGS`, so `/inference/kimi-k3` and
 * `/compare/kimi-k3-gb200-vs-mi355x` agree on what "kimi-k3" means. Aliases
 * accept the compare aliases plus the lowercased `?g_model=` display names
 * (e.g. `/inference/deepseek-v4-pro`), all 308-redirecting to the canonical
 * slug so exactly one URL per model is ever indexed.
 */
import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { getModelCategory, Model } from '@/lib/data-mappings';

export interface InferenceModelSlug {
  /** Canonical URL slug, e.g. 'kimi-k3'. Lowercase, matches the compare slug. */
  slug: string;
  /** Model enum value — the same string `?g_model=` accepts. */
  model: Model;
  /** Human label for the page header and OG copy, e.g. 'Kimi K3 2.8T'. */
  label: string;
  /** Short, search-shaped model name for `<title>` tags, e.g. 'Kimi K3'. */
  seoName: string;
}

const MODEL_VALUES = new Set<string>(Object.values(Model));

/**
 * Ordered like `COMPARE_MODEL_SLUGS` (flagship models first, per product
 * spec). One entry per dashboard model option: compare slugs are finer-grained
 * than the display-grouped dropdown (`kimi-k26` vs the retired `kimi-k25`
 * alias), but each display name appears exactly once in the compare registry,
 * so the mapping is 1:1. Hidden models get no page.
 */
export const INFERENCE_MODEL_SLUGS: readonly InferenceModelSlug[] = COMPARE_MODEL_SLUGS.filter(
  (entry) => MODEL_VALUES.has(entry.displayName),
)
  .map((entry) => ({
    slug: entry.slug,
    model: entry.displayName as Model,
    label: entry.label,
    seoName: entry.seoName,
  }))
  .filter((entry) => getModelCategory(entry.model) !== 'hidden');

const SLUG_TO_ENTRY: ReadonlyMap<string, InferenceModelSlug> = new Map(
  INFERENCE_MODEL_SLUGS.map((entry) => [entry.slug, entry]),
);

const MODEL_TO_SLUG: ReadonlyMap<Model, string> = new Map(
  INFERENCE_MODEL_SLUGS.map((entry) => [entry.model, entry.slug]),
);

/**
 * Alias slugs that 308 to the canonical page. Two sources:
 * - the compare aliases (family names and superseded versions), filtered to
 *   targets that actually have an inference page;
 * - the lowercased `Model` enum values, so a `?g_model=` value can be dropped
 *   into the path verbatim (`/inference/Kimi-K2.5` → `/inference/kimi-k26`).
 */
export const INFERENCE_MODEL_ALIASES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(COMPARE_MODEL_ALIASES).filter(([, target]) => SLUG_TO_ENTRY.has(target)),
  ),
  ...Object.fromEntries(
    INFERENCE_MODEL_SLUGS.filter((entry) => entry.model.toLowerCase() !== entry.slug).map(
      (entry) => [entry.model.toLowerCase(), entry.slug],
    ),
  ),
};

/**
 * Resolve a raw path segment (any case, aliases allowed) to its registry
 * entry. Returns null for unknown slugs — including the reserved static
 * `/inference/*` segments (`agentic`, `logs`), which are not in the registry.
 */
export function getInferenceModelBySlug(rawSlug: string): InferenceModelSlug | null {
  const lower = rawSlug.toLowerCase();
  const canonical = INFERENCE_MODEL_ALIASES[lower] ?? lower;
  return SLUG_TO_ENTRY.get(canonical) ?? null;
}

/** Canonical slug for a dashboard model, or null for hidden models. */
export function inferenceModelSlugForModel(model: Model): string | null {
  return MODEL_TO_SLUG.get(model) ?? null;
}

/** English path of a model page, e.g. '/inference/kimi-k3'. */
export function inferenceModelPath(slug: string): string {
  return `/inference/${slug}`;
}

/**
 * Registry entries whose model is still actively benchmarked. Deprecated
 * models keep their pages (historical data stays reachable and indexed) but
 * are not promoted on the landing page.
 */
export const ACTIVE_INFERENCE_MODEL_SLUGS: readonly InferenceModelSlug[] =
  INFERENCE_MODEL_SLUGS.filter((entry) => getModelCategory(entry.model) !== 'deprecated');

/**
 * Model pinned by the current pathname, or null when the path carries no
 * model. Accepts the English and `/zh` trees and alias slugs (aliases redirect
 * server-side, but the client provider may briefly render before the redirect
 * resolves). Used by the dashboard shell to seed `GlobalFilterProvider` and by
 * the provider's pathname effect on soft navigations; an explicit `?g_model=`
 * param always wins over the path pin.
 *
 * Accepts null/undefined because `usePathname()` is typed to return null
 * outside an app router (e.g. in unit tests that render the provider bare).
 */
export function inferenceModelForPathname(pathname: string | null | undefined): Model | null {
  if (!pathname) return null;
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const enPath = barePath === '/zh' ? '/' : barePath.replace(/^\/zh(?=\/)/u, '');
  const match = /^\/inference\/(?<slug>[^/]+)\/?$/u.exec(enPath);
  if (!match?.groups?.slug) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(match.groups.slug);
  } catch {
    return null;
  }
  return getInferenceModelBySlug(segment)?.model ?? null;
}

/**
 * Pathname the inference dashboard should shallow-rewrite to when the user
 * picks `model` from the selector, or null when the current path must be left
 * alone. Only the inference tab itself qualifies — the base `/inference`
 * page and the `/inference/<model>` subroutes (in both locale trees). Every
 * other surface sharing the global model filter (overview, compare, the
 * agentic catalog, …) keeps its own URL.
 *
 * Models without a registry page (hidden entries) fall back to the base
 * `/inference` path rather than minting a URL that would 404 on reload.
 */
export function inferenceModelRouteForSelection(
  pathname: string | null | undefined,
  model: Model,
): string | null {
  if (!pathname) return null;
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const isZh = barePath === '/zh' || barePath.startsWith('/zh/');
  const enPath = isZh ? barePath.replace(/^\/zh(?=\/|$)/u, '') || '/' : barePath;
  const onInferenceTab =
    enPath === '/inference' ||
    enPath === '/inference/' ||
    inferenceModelForPathname(pathname) !== null;
  if (!onInferenceTab) return null;
  const slug = inferenceModelSlugForModel(model);
  const target = slug ? inferenceModelPath(slug) : '/inference';
  return isZh ? `/zh${target}` : target;
}
