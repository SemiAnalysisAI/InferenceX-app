import { INFERENCE_MODEL_ALIASES } from './inference-model-slug';

interface InferenceModelAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const INFERENCE_ROUTE_PREFIXES = ['/inference', '/zh/inference'] as const;

/**
 * Static model aliases belong in Next's redirect table rather than the SSG
 * page component. Reading `searchParams` while rendering an alias that was not
 * returned by `generateStaticParams` fails with `DYNAMIC_SERVER_USAGE` in a
 * production build. Config redirects run before the filesystem route and Next
 * automatically carries the incoming query string to the destination.
 */
export const INFERENCE_MODEL_ALIAS_REDIRECTS: readonly InferenceModelAliasRedirect[] =
  Object.entries(INFERENCE_MODEL_ALIASES).flatMap(([alias, canonical]) =>
    INFERENCE_ROUTE_PREFIXES.map((prefix) => ({
      source: `${prefix}/${alias}`,
      destination: `${prefix}/${canonical}`,
      permanent: true as const,
    })),
  );
