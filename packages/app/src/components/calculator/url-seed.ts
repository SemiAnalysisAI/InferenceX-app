import { type CacheHitMode, profitModelDefaults } from '@/components/calculator/profit-estimator';
import type { ProfitPowerBasis } from '@/components/calculator/profit-power';
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
import { profitRouteParams, profitRouteSearch } from '@/lib/routing/profit-estimator-routes';

/**
 * Profit estimator controls a shared link can preset. They live in the seed, which the server
 * reads from the route path, so a link with chips or dates renders those controls in its HTML
 * instead of adding them after hydration and pushing the chart down.
 */
export interface ProfitUrlSeed {
  historyGpus: string[];
  historyDateRange: { startDate: string; endDate: string };
  historyDates: string[];
  cacheHitMode?: CacheHitMode;
  powerBasis?: ProfitPowerBasis;
}

export interface CalculatorUrlSeed {
  model?: Model;
  sequence?: Sequence;
  precisions?: string[];
  percentile?: Percentile;
  runDate?: string;
  runId?: string;
  profitTarget?: number;
  /** Present only on profit estimator routes. */
  profit?: ProfitUrlSeed;
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

export function resolveProfitUrlSeed(params: URLSearchParams): ProfitUrlSeed {
  const startDate = params.get('i_dstart') ?? '';
  const endDate = params.get('i_dend') ?? '';
  const cacheHitMode = params.get('c_chmode');
  const powerBasis = params.get('c_power');
  const seed: ProfitUrlSeed = {
    historyGpus: params.get('i_gpus')?.split(',').filter(Boolean) ?? [],
    historyDateRange:
      startDate && endDate ? { startDate, endDate } : { startDate: '', endDate: '' },
    historyDates: params.get('i_dates')?.split(',').filter(Boolean) ?? [],
  };
  if (cacheHitMode === 'actual') seed.cacheHitMode = cacheHitMode;
  if (powerBasis === 'modeled' || powerBasis === 'compare') seed.powerBasis = powerBasis;
  return seed;
}

export function calculatorUrlSeed(
  pathname: string,
  search: string,
  routeModel: Model | undefined,
): CalculatorUrlSeed {
  const params = profitRouteSearch(pathname, search);
  const seed = resolveCalculatorUrlSeed(params);
  const profit = profitRouteParams(pathname) === null ? undefined : resolveProfitUrlSeed(params);
  return { ...seed, model: seed.model ?? routeModel, ...(profit && { profit }) };
}

export { Model, Percentile, Precision, Sequence };
