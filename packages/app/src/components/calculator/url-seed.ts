import { profitModelDefaults } from '@/components/calculator/profit-estimator';
import {
  Model,
  MODEL_OPTIONS,
  Percentile,
  PERCENTILE_OPTIONS,
  Precision,
  PRECISION_OPTIONS,
  Sequence,
  SEQUENCE_OPTIONS,
} from '@/lib/catalog/data-mappings';

export interface CalculatorUrlSeed {
  model?: Model;
  sequence?: Sequence;
  precisions?: string[];
  percentile?: Percentile;
  runDate?: string;
  runId?: string;
  /** Profit estimator interactivity target (tok/s/user) from `c_ivtarget`. */
  profitTarget?: number;
  /** Server navigation identity, distinct from shallow client-owned route edits. */
  profitRouteKey?: string;
}

/**
 * Parse a `c_ivtarget` value: a finite, positive number written in plain
 * decimal form. Anything else (empty, zero, negative, `NaN`, trailing junk)
 * returns `undefined`, so the page falls back to the model's default target.
 */
export function parseProfitTargetParam(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The `c_ivtarget` share-link value for `target` on `model`: empty when the
 * target is the model's default operating point (so default views keep
 * unchanged links and follow future default changes), otherwise the exact
 * number, which `parseProfitTargetParam` reads back.
 */
export function profitTargetUrlValue(model: Model, target: number): string {
  if (!Number.isFinite(target) || target <= 0) return '';
  return target === profitModelDefaults(model).interactivity ? '' : String(target);
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

  const percentileParam = pickString(sp.i_pctl);
  if (percentileParam && (PERCENTILE_OPTIONS as readonly string[]).includes(percentileParam)) {
    seed.percentile = percentileParam as Percentile;
  }

  const runDateParam = pickString(sp.g_rundate);
  if (runDateParam && /^\d{4}-\d{2}-\d{2}$/u.test(runDateParam)) {
    seed.runDate = runDateParam;
  }

  const profitTarget = parseProfitTargetParam(pickString(sp.c_ivtarget));
  if (profitTarget !== undefined) seed.profitTarget = profitTarget;

  const runIdParam = pickString(sp.g_runid);
  if (runIdParam && /^[A-Za-z0-9_-]{1,64}$/u.test(runIdParam)) {
    seed.runId = runIdParam;
  }

  return seed;
}

// Re-export Model/Precision/Sequence for callers that already import this module.
export { Model, Percentile, Precision, Sequence };
