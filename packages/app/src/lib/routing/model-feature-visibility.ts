import { modelRequiresFeatureGate } from '@/lib/catalog/data-mappings';
import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';

/** Covers model routes, comparison slugs, rankings and run detail paths in both locales. */
export function isFeatureGatedModelPath(pathname: string): boolean {
  let segments: string[];
  try {
    segments = decodeURIComponent(pathname.split(/[?#]/u, 1)[0]).toLowerCase().split('/');
  } catch {
    return false;
  }
  return COMPARE_MODEL_SLUGS.some((entry) => {
    if (!modelRequiresFeatureGate(entry.displayName)) return false;
    const names = [
      entry.slug,
      entry.displayName.toLowerCase(),
      ...Object.entries(COMPARE_MODEL_ALIASES)
        .filter(([, canonical]) => canonical === entry.slug)
        .map(([alias]) => alias),
    ];
    return segments.some((segment) => names.some((name) => `-${segment}-`.includes(`-${name}-`)));
  });
}
