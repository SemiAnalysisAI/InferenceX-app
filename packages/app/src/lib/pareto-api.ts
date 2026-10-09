import {
  DISPLAY_MODEL_TO_DB,
  POWER_METRIC_KEYS,
  rowToSequence,
} from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { globalParetoFrontier } from './pareto-frontier';

export const PARETO_SEQUENCES = ['1k/1k', '1k/8k', '8k/1k', 'agentic-traces'] as const;
export const PARETO_DIRECTIONS = ['min', 'max'] as const;
export const PARETO_PARAMETERS = [
  'model',
  'rawModel',
  'sequence',
  'xMetric',
  'yMetric',
  'xDirection',
  'yDirection',
  'hardware',
  'framework',
  'precision',
  'date',
  'exact',
  'runId',
  'exactRun',
  'powerValid',
] as const;
const SOURCE_PARAMETERS = ['model', 'date', 'exact', 'runId', 'exactRun', 'powerValid'] as const;
const metricPattern = /^[a-z][a-z0-9_.]{0,99}$/u;

export interface ParetoSelection {
  model: string;
  rawModel: string;
  sequence: string;
  xMetric: string;
  yMetric: string;
  xDirection: 'min' | 'max';
  yDirection: 'min' | 'max';
  hardware: string | null;
  framework: string | null;
  precision: string | null;
}

/** Reject ignored/ambiguous selectors rather than silently widening an analysis. */
export function parseParetoRequest(params: URLSearchParams): {
  selection: ParetoSelection;
  sourceParams: URLSearchParams;
} {
  for (const key of params.keys()) {
    if (
      !(PARETO_PARAMETERS as readonly string[]).includes(key) ||
      params.getAll(key).length !== 1
    ) {
      throw new Error(`Unknown or repeated parameter: ${key}`);
    }
    if (!params.get(key)) throw new Error(`Empty parameter: ${key}`);
  }
  const model = params.get('model') ?? '';
  const rawModel = params.get('rawModel') ?? '';
  if (!Object.hasOwn(DISPLAY_MODEL_TO_DB, model)) throw new Error('Unknown model');
  if (!DISPLAY_MODEL_TO_DB[model].includes(rawModel)) throw new Error('Unknown rawModel for model');
  const sequence = params.get('sequence') ?? '';
  if (!(PARETO_SEQUENCES as readonly string[]).includes(sequence))
    throw new Error('Unknown sequence');
  const xMetric = params.get('xMetric') ?? '';
  const yMetric = params.get('yMetric') ?? '';
  if (!metricPattern.test(xMetric) || !metricPattern.test(yMetric))
    throw new Error('Invalid metric key');
  const xDirection = params.get('xDirection');
  const yDirection = params.get('yDirection');
  if (xDirection !== 'min' && xDirection !== 'max') throw new Error('Invalid xDirection');
  if (yDirection !== 'min' && yDirection !== 'max') throw new Error('Invalid yDirection');
  const date = params.get('date');
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  ) {
    throw new Error('Invalid date');
  }
  for (const key of ['exact', 'exactRun']) {
    if (params.has(key) && !['true', 'false'].includes(params.get(key)!))
      throw new Error(`Invalid ${key}`);
  }
  if (params.get('exact') === 'true' && !date) throw new Error('exact=true requires date');
  const runId = params.get('runId');
  if (runId && (!/^[1-9]\d*$/u.test(runId) || !Number.isSafeInteger(Number(runId))))
    throw new Error('Invalid runId');
  if (params.get('exactRun') === 'true' && !runId) throw new Error('exactRun=true requires runId');
  if (params.get('exactRun') === 'true' && (date || params.has('exact')))
    throw new Error('exactRun cannot be combined with date or exact');
  if (params.has('powerValid') && params.get('powerValid') !== 'strictV2')
    throw new Error('Unknown powerValid filter');
  if (
    [xMetric, yMetric].some((key) => (POWER_METRIC_KEYS as readonly string[]).includes(key)) &&
    params.get('powerValid') !== 'strictV2'
  )
    throw new Error('Power axes require powerValid=strictV2');
  const sourceParams = new URLSearchParams();
  for (const key of SOURCE_PARAMETERS) {
    if (params.has(key)) sourceParams.set(key, params.get(key)!);
  }
  return {
    selection: {
      model,
      rawModel,
      sequence,
      xMetric,
      yMetric,
      xDirection,
      yDirection,
      hardware: params.get('hardware'),
      framework: params.get('framework'),
      precision: params.get('precision'),
    },
    sourceParams,
  };
}

export function computeParetoResponse(
  rows: readonly BenchmarkRow[],
  selection: ParetoSelection,
  sourceUrl: string,
) {
  const selected = rows.filter(
    (row) =>
      row.model === selection.rawModel &&
      rowToSequence(row) === selection.sequence &&
      row.benchmark_type ===
        (selection.sequence === 'agentic-traces' ? 'agentic_traces' : 'single_turn') &&
      (!selection.hardware || row.hardware === selection.hardware) &&
      (!selection.framework || row.framework === selection.framework) &&
      (!selection.precision || row.precision === selection.precision),
  );
  const coordinates = new Map<string, { x: number; y: number; observations: BenchmarkRow[] }>();
  let eligible = 0;
  for (const row of selected) {
    const x = Object.hasOwn(row.metrics, selection.xMetric)
      ? row.metrics[selection.xMetric]
      : undefined;
    const y = Object.hasOwn(row.metrics, selection.yMetric)
      ? row.metrics[selection.yMetric]
      : undefined;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      continue;
    eligible++;
    const key = `${x},${y}`;
    const existing = coordinates.get(key);
    if (existing) existing.observations.push(row);
    else coordinates.set(key, { x, y, observations: [row] });
  }
  const points = [...coordinates.values()];
  return {
    source_url: sourceUrl,
    selection,
    counts: {
      returned: rows.length,
      selected: selected.length,
      eligible,
      missing_or_nonfinite: selected.length - eligible,
    },
    frontier: globalParetoFrontier(
      points,
      selection.xDirection === 'max',
      selection.yDirection === 'max',
    ),
    hinterland: globalParetoFrontier(
      points,
      selection.xDirection !== 'max',
      selection.yDirection !== 'max',
    ),
  };
}
