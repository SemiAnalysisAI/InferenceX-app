import { AUTHOR_NAME, AUTHOR_URL } from '@semianalysisai/inferencex-constants';

/** License of the published InferenceX benchmark data (also declared in the API documentation). */
export const DATASET_LICENSE_URL = 'https://www.apache.org/licenses/LICENSE-2.0';

/**
 * Google's Dataset rich result requires `name` and `description` on every Dataset node,
 * including `hasPart` children, and warns when `license` or `creator` is missing.
 */
export function datasetJsonLd<T extends Record<string, unknown>>(
  node: {
    name: string;
    description: string;
  } & T,
) {
  return {
    '@type': 'Dataset' as const,
    ...node,
    license: DATASET_LICENSE_URL,
    isAccessibleForFree: true,
    creator: { '@type': 'Organization' as const, name: AUTHOR_NAME, url: AUTHOR_URL },
  };
}
