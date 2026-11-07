import { getDashboardRoute } from './dashboard-routes';
import { INFERENCE_MODEL_ALIASES } from './inference-model-slug';

interface InferenceModelAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const { path, legacyPath } = getDashboardRoute('inference');

export const INFERENCE_MODEL_ALIAS_REDIRECTS: readonly InferenceModelAliasRedirect[] =
  Object.entries(INFERENCE_MODEL_ALIASES).flatMap(([alias, canonical]) =>
    ['', '/zh'].flatMap((locale) =>
      [path, legacyPath].map((source) => ({
        source: `${locale}${source}/${alias}`,
        destination: `${locale}${path}/${canonical}`,
        permanent: true as const,
      })),
    ),
  );
