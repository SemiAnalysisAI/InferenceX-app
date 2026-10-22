import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '../compare/compare-slug';
import { getModelCategory, Model } from '../catalog/data-mappings';

export interface InferenceModelSlug {
  slug: string;
  model: Model;
  label: string;
  seoName: string;
}

const MODEL_VALUES = new Set<string>(Object.values(Model));

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

export function getInferenceModelBySlug(rawSlug: string): InferenceModelSlug | null {
  const lower = rawSlug.toLowerCase();
  const canonical = INFERENCE_MODEL_ALIASES[lower] ?? lower;
  return SLUG_TO_ENTRY.get(canonical) ?? null;
}

export function inferenceModelSlugForModel(model: Model): string | null {
  return MODEL_TO_SLUG.get(model) ?? null;
}

export function inferenceModelPath(slug: string): string {
  return `/inference/${slug}`;
}

export const ACTIVE_INFERENCE_MODEL_SLUGS: readonly InferenceModelSlug[] =
  INFERENCE_MODEL_SLUGS.filter((entry) => getModelCategory(entry.model) !== 'deprecated');

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
