import { COMPARE_MODEL_ALIASES } from '../compare/compare-slug';
import { getDashboardRoute } from './dashboard-routes';

interface HistoricalModelAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const { path, legacyPath } = getDashboardRoute('historical');

/**
 * `/infx/historical/[model]` is prerendered, so its page cannot read `searchParams` when an alias
 * renders on demand. Config redirects run first and carry the query string across.
 */
export const HISTORICAL_MODEL_ALIAS_REDIRECTS: readonly HistoricalModelAliasRedirect[] =
  Object.entries(COMPARE_MODEL_ALIASES).flatMap(([alias, canonical]) =>
    ['', '/zh'].flatMap((locale) =>
      [path, legacyPath].map((source) => ({
        source: `${locale}${source}/${alias}`,
        destination: `${locale}${path}/${canonical}`,
        permanent: true as const,
      })),
    ),
  );
