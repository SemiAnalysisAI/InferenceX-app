import { COMPARE_MODEL_ALIASES } from '../compare/compare-slug';

interface HistoricalModelAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const HISTORICAL_ROUTE_PREFIXES = ['/historical', '/zh/historical'] as const;

/**
 * `/historical/[model]` is prerendered, so its page cannot read `searchParams` when an alias
 * renders on demand. Config redirects run first and carry the query string across.
 */
export const HISTORICAL_MODEL_ALIAS_REDIRECTS: readonly HistoricalModelAliasRedirect[] =
  Object.entries(COMPARE_MODEL_ALIASES).flatMap(([alias, canonical]) =>
    HISTORICAL_ROUTE_PREFIXES.map((prefix) => ({
      source: `${prefix}/${alias}`,
      destination: `${prefix}/${canonical}`,
      permanent: true as const,
    })),
  );
