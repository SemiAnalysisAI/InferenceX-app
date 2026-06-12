import {
  Model,
  MODEL_OPTIONS,
  Precision,
  PRECISION_OPTIONS,
  Sequence,
  SEQUENCE_OPTIONS,
} from '@/lib/data-mappings';

export interface CalculatorUrlSeed {
  model?: Model;
  sequence?: Sequence;
  precisions?: string[];
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/**
 * Read the URL params that the calculator can SSR with into a typed seed.
 * Without this, `?g_model=DeepSeek-V4-Pro` only takes effect after client
 * hydration runs the `useLayoutEffect` in `GlobalFilterContext` — so the
 * initial paint (and any preview/scraper that doesn't run JS) shows the
 * default model instead of the shared one.
 */
export function resolveCalculatorUrlSeed(
  sp: Record<string, string | string[] | undefined>,
): CalculatorUrlSeed {
  const seed: CalculatorUrlSeed = {};

  const modelParam = pickString(sp.g_model);
  if (modelParam && (MODEL_OPTIONS as readonly string[]).includes(modelParam)) {
    seed.model = modelParam as Model;
  }

  const seqParam = pickString(sp.i_seq);
  if (seqParam && (SEQUENCE_OPTIONS as readonly string[]).includes(seqParam)) {
    seed.sequence = seqParam as Sequence;
  }

  const precParam = pickString(sp.i_prec);
  if (precParam) {
    const precs = precParam
      .split(',')
      .filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p));
    if (precs.length > 0) seed.precisions = precs;
  }

  return seed;
}

// Re-export Model/Precision/Sequence for callers that already import this module.
export { Model, Precision, Sequence };
