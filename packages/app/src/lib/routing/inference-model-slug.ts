import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '../compare/compare-slug';
import { getModelCategory, isModelVisible, Model } from '../catalog/data-mappings';
import { getDashboardRoute } from './dashboard-routes';

const INFERENCE_PATH = getDashboardRoute('inference').path;

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

export const PUBLIC_INFERENCE_MODEL_SLUGS = INFERENCE_MODEL_SLUGS.filter((entry) =>
  isModelVisible(entry.model),
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
  return `${INFERENCE_PATH}/${slug}`;
}

export const ACTIVE_INFERENCE_MODEL_SLUGS: readonly InferenceModelSlug[] =
  INFERENCE_MODEL_SLUGS.filter((entry) => getModelCategory(entry.model) !== 'deprecated');

export function inferenceModelForPathname(pathname: string | null | undefined): Model | null {
  if (!pathname) return null;
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const enPath = barePath === '/zh' ? '/' : barePath.replace(/^\/zh(?=\/)/u, '');
  if (!enPath.startsWith(`${INFERENCE_PATH}/`)) return null;
  const slug = enPath.slice(INFERENCE_PATH.length + 1).replace(/\/$/u, '');
  if (!slug || slug.includes('/')) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(slug);
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
    enPath === INFERENCE_PATH ||
    enPath === `${INFERENCE_PATH}/` ||
    inferenceModelForPathname(pathname) !== null;
  if (!onInferenceTab) return null;
  const slug = inferenceModelSlugForModel(model);
  const target = slug ? inferenceModelPath(slug) : INFERENCE_PATH;
  return isZh ? `/zh${target}` : target;
}
