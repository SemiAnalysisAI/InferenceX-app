import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

/**
 * Leaf constants shared by the API documentation registry and the views-API
 * docs fragments (`lib/views-api/docs/*`).
 *
 * The fragments need these values at module-evaluation time while
 * `api-documentation.ts` imports the fragments to assemble `apiOperations`;
 * keeping the values here (instead of in `api-documentation.ts`) breaks the
 * import cycle that would otherwise hit the const temporal dead zone.
 * `api-documentation.ts` re-exports them, so external import sites are
 * unchanged.
 */
export const API_BASE_URL = 'https://inferencex.semianalysis.com' as const;

export const SUPPORTED_BENCHMARK_MODELS = Object.freeze(
  Object.keys(DISPLAY_MODEL_TO_DB).toSorted(),
);
