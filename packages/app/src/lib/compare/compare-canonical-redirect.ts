import { sequenceForScenarioSegment } from '@/lib/compare/compare-scenario-route';
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare/compare-slug';
import {
  canonicalPrecisionCompareSlug,
  canonicalSpecDecodeCompareSlug,
  parsePrecisionCompareSlug,
  parseSpecDecodeCompareSlug,
} from '@/lib/compare/compare-variant-slug';

const COMPARE_DETAIL_PATH =
  /^(?<locale>\/zh)?\/(?<family>compare|compare-per-dollar|compare-precision|compare-spec-decode)\/(?<slug>[^/]+)(?:\/(?<scenario>[^/]+))?\/?$/u;

function canonicalSlug(family: string, slug: string): string | null {
  if (family === 'compare-precision') {
    const parsed = parsePrecisionCompareSlug(slug);
    return parsed
      ? canonicalPrecisionCompareSlug(parsed.model.slug, parsed.gpu, parsed.precA, parsed.precB)
      : null;
  }
  if (family === 'compare-spec-decode') {
    const parsed = parseSpecDecodeCompareSlug(slug);
    return parsed
      ? canonicalSpecDecodeCompareSlug(
          parsed.model.slug,
          parsed.gpu,
          parsed.precision,
          parsed.method,
        )
      : null;
  }
  const parsed = parseCompareSlug(slug);
  return parsed ? canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b) : null;
}

/**
 * Compare detail pages are statically rendered, so their own slug redirect cannot see the
 * query string. The proxy uses this for shared URLs with any query (`i_seq`, `i_metric`,
 * `utm_*`, ...) so a non-canonical slug keeps every parameter across the 308.
 * Returns null when the URL should load as is: no query (the page's own redirect is
 * equivalent), a canonical slug, or a 404 the page renders.
 */
export function compareCanonicalRedirectUrl(url: URL): URL | null {
  if (!url.search) return null;
  const match = COMPARE_DETAIL_PATH.exec(url.pathname);
  const groups = match?.groups;
  if (!groups?.family || !groups.slug) return null;
  const { locale = '', family, slug, scenario } = groups;
  if (scenario && !sequenceForScenarioSegment(scenario)) return null;
  const canonical = canonicalSlug(family, slug);
  if (!canonical || canonical === slug.toLowerCase()) return null;
  const target = new URL(url);
  const scenarioPath = scenario ? `/${scenario.toLowerCase()}` : '';
  target.pathname = `${locale}/${family}/${canonical}${scenarioPath}`;
  target.search = url.searchParams.toString();
  return target;
}
