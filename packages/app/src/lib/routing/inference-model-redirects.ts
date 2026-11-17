import { getDashboardRoute } from './dashboard-routes';
import { INFERENCE_MODEL_ALIASES } from './inference-model-slug';

interface InferenceModelAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const { path, legacyPath } = getDashboardRoute('inference');

/** The featured model bare inference URLs redirect to. It can change, so the redirect is temporary. */
export const DEFAULT_INFERENCE_MODEL_SLUG = 'kimi-k31-pro';

/**
 * The bare-URL redirect skips queries that name a model or open a measured-power view. Next
 * matches each `value` against the whole query value.
 */
export const DEFAULT_INFERENCE_REDIRECT_MISSING: readonly {
  type: 'query';
  key: string;
  value?: string;
}[] = [
  { type: 'query', key: 'g_model' },
  { type: 'query', key: 'i_metric', value: 'y_measured[A-Za-z]+' },
  { type: 'query', key: 'i_power', value: '(?:.*,)?(?:certified|legacy)(?:,.*)?' },
];

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
