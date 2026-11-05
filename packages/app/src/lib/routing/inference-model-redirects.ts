import { INFERENCE_MODEL_ALIASES } from './inference-model-slug';

interface InferenceModelAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

const INFERENCE_ROUTE_PREFIXES = ['/inference', '/zh/inference'] as const;

export const INFERENCE_MODEL_ALIAS_REDIRECTS: readonly InferenceModelAliasRedirect[] =
  Object.entries(INFERENCE_MODEL_ALIASES).flatMap(([alias, canonical]) =>
    INFERENCE_ROUTE_PREFIXES.map((prefix) => ({
      source: `${prefix}/${alias}`,
      destination: `${prefix}/${canonical}`,
      permanent: true as const,
    })),
  );
