import type { VideoPoint } from './metrics';

/**
 * The Diffusers reference generates in BF16, and every run published before cells recorded
 * their precision served BF16 weights, so BF16 is the default view and the quality baseline.
 */
export const REFERENCE_PRECISION = 'bf16';

/** The weight precision a cell served, as its InferenceX aggregate records it. */
export const precisionOf = (p: Pick<VideoPoint, 'results'>): string =>
  p.results?.precision ?? REFERENCE_PRECISION;
