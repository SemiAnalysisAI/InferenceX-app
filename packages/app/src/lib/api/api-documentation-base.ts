import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

export const API_BASE_URL = 'https://inferencex.semianalysis.com' as const;

export const SUPPORTED_BENCHMARK_MODELS = Object.freeze(
  Object.keys(DISPLAY_MODEL_TO_DB).toSorted(),
);
