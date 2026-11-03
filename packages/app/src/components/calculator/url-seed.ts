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
import { profitRouteSearch } from '@/lib/routing/profit-estimator-routes';

export interface CalculatorUrlSeed {
  model?: Model;
  sequence?: Sequence;
  precisions?: string[];
  percentile?: Percentile;
  runDate?: string;
  runId?: string;
  profitTarget?: number;
}

export function parseProfitTargetParam(value: string | null): number | undefined {
  if (value === null || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function profitTargetUrlValue(model: Model, target: number): string {
  if (!Number.isFinite(target) || target <= 0) return '';
  return target === profitModelDefaults(model).interactivity ? '' : String(target);
}

/** Reads the first value of each key, as the server's `searchParams` did for repeated keys. */
export function resolveCalculatorUrlSeed(params: URLSearchParams): CalculatorUrlSeed {
  const seed: CalculatorUrlSeed = {};

  const modelParam = params.get('g_model');
  if (modelParam && (MODEL_OPTIONS as readonly string[]).includes(modelParam)) {
    seed.model = modelParam as Model;
  }

  const seqParam = params.get('i_seq');
  if (seqParam && (SEQUENCE_OPTIONS as readonly string[]).includes(seqParam)) {
    seed.sequence = seqParam as Sequence;
  }

  const precParam = params.get('i_prec');
  if (precParam) {
    const precs = precParam
      .split(',')
      .filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p));
    if (precs.length > 0) seed.precisions = precs;
  }

  const percentileParam = params.get('i_pctl');
  if (percentileParam && (PERCENTILE_OPTIONS as readonly string[]).includes(percentileParam)) {
    seed.percentile = percentileParam as Percentile;
  }

  const runDateParam = params.get('g_rundate');
  if (runDateParam && /^\d{4}-\d{2}-\d{2}$/u.test(runDateParam)) {
    seed.runDate = runDateParam;
  }

  const profitTarget = parseProfitTargetParam(params.get('c_ivtarget'));
  if (profitTarget !== undefined) seed.profitTarget = profitTarget;

  const runIdParam = params.get('g_runid');
  if (runIdParam && /^[A-Za-z0-9_-]{1,64}$/u.test(runIdParam)) {
    seed.runId = runIdParam;
  }

  return seed;
}

/**
 * The seed for a calculator page URL: its query, with a profit route's path filters (and path
 * model) applied, falling back to the model the route selects without a query.
 */
export function calculatorUrlSeed(
  pathname: string,
  search: string,
  routeModel: Model | undefined,
): CalculatorUrlSeed {
  const seed = resolveCalculatorUrlSeed(profitRouteSearch(pathname, search));
  return { ...seed, model: seed.model ?? routeModel };
}

export { Model, Percentile, Precision, Sequence };
