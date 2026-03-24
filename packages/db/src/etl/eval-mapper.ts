/**
 * Eval row mappers: raw JSON → `EvalParams`.
 * Two formats supported:
 *   `mapEvalRow()`    — individual eval ZIP (`meta_env.json` + `results_*.json`)
 *   `mapAggEvalRow()` — compiled aggregate (flat row from `agg_eval_all.json`)
 */

import { PRECISION_KEYS } from '@semianalysisai/inferencex-constants';
import type { ConfigParams } from './config-cache';
import type { SkipTracker } from './skip-tracker';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
  normalizeSpecMethod,
  parseBool,
  parseNum,
  parseInt2,
  parseIslOsl,
} from './normalizers';

/**
 * Rename raw lm-eval metric keys to the standardized names used in the agg format.
 * Keys not in this map are stored verbatim.
 */
const EVAL_METRIC_RENAMES: Record<string, string> = {
  'exact_match,strict-match': 'em_strict',
  'exact_match_stderr,strict-match': 'em_strict_se',
  'exact_match,flexible-extract': 'em_flexible',
  'exact_match_stderr,flexible-extract': 'em_flexible_se',
};

export interface EvalParams {
  config: ConfigParams;
  task: string;
  isl: number | null;
  osl: number | null;
  conc: number | null;
  lmEvalVersion: string | null;
  metrics: Record<string, number>;
}

/**
 * Map an individual eval ZIP's `meta_env.json` + results JSON to typed `EvalParams`.
 *
 * `meta_env.json` supplies the config (hardware, model, framework, precision, tp, ep, etc.).
 * The results file supplies task names, accuracy metrics, and `lm_eval_version`.
 * One `EvalParams` is returned per task in the results dict — lm-harness can report
 * multiple tasks in a single file and all are captured.
 *
 * Returns an empty array and increments the appropriate skip counter when the model
 * or hardware cannot be resolved, or when the results dict is empty/invalid.
 *
 * @param meta - Parsed contents of the artifact's `meta_env.json`.
 * @param results - Parsed contents of the artifact's `results_*.json`.
 * @param tracker - Shared skip tracker; counters are mutated in place on failure.
 * @returns An array of `EvalParams` (one per task), or an empty array on failure.
 */
export function mapEvalRow(
  meta: Record<string, any>,
  results: Record<string, any>,
  tracker: SkipTracker,
): EvalParams[] {
  const modelKey = resolveModelKey(meta);
  if (!modelKey) {
    tracker.skips.unmappedModel++;
    const raw = String(meta.infmax_model_prefix ?? meta.model ?? '');
    if (raw) tracker.unmappedModels.add(raw);
    return [];
  }

  const gpuKey = hwToGpuKey(String(meta.hw ?? ''));
  if (!gpuKey) {
    tracker.skips.unmappedHw++;
    const raw = String(meta.hw ?? '');
    if (raw) tracker.unmappedHws.add(raw);
    return [];
  }

  const tasksDict = results.results;
  if (!tasksDict || typeof tasksDict !== 'object') return [];
  const taskEntries = Object.entries(tasksDict as Record<string, any>);
  if (taskEntries.length === 0) return [];

  const { framework, disagg } = normalizeFramework(String(meta.framework ?? ''), meta.disagg);
  const tp = parseInt2(meta.tp) ?? 1;
  const ep = parseInt2(meta.ep) ?? 1;
  const dpAttn = parseBool(meta.dp_attention);
  const precision = String(meta.precision ?? '').toLowerCase();
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(meta.spec_decoding);
  const lmEvalVersion = results.lm_eval_version ? String(results.lm_eval_version) : null;

  const config = {
    hardware: gpuKey,
    framework,
    model: modelKey,
    precision,
    specMethod,
    disagg,
    isMultinode: false,
    prefillTp: tp,
    prefillEp: ep,
    prefillDpAttn: dpAttn,
    prefillNumWorkers: 0,
    decodeTp: tp,
    decodeEp: ep,
    decodeDpAttn: dpAttn,
    decodeNumWorkers: 0,
    numPrefillGpu: tp * ep,
    numDecodeGpu: tp * ep,
  };

  const nSamples = results['n-samples'] as Record<string, any> | undefined;

  return taskEntries.map(([taskName, rawMetrics]) => {
    // Collect numeric metrics; rename lm-eval keys to standardized names.
    const metrics: Record<string, number> = {};
    if (rawMetrics && typeof rawMetrics === 'object') {
      for (const [k, v] of Object.entries(rawMetrics as Record<string, any>)) {
        if (k === 'alias') continue;
        const n = parseNum(v);
        if (n !== undefined) metrics[EVAL_METRIC_RENAMES[k] ?? k] = n;
      }
    }
    // Extract n_eff from top-level n-samples (not present in per-task rawMetrics).
    const nEff = parseNum(nSamples?.[taskName]?.effective);
    if (nEff !== undefined) metrics['n_eff'] = nEff;

    return {
      config,
      task: taskName.toLowerCase(),
      isl: parseInt2(meta.isl) ?? null,
      osl: parseInt2(meta.osl) ?? null,
      conc: parseInt2(meta.conc) ?? null,
      lmEvalVersion,
      metrics,
    };
  });
}

/**
 * Map a flat row from `agg_eval_all.json` (produced by `eval_results_all_*.zip` or
 * the CI aggregate artifact) to typed `EvalParams`.
 *
 * Unlike `mapEvalRow`, all config fields are inline in the row rather than split
 * across two files. ISL/OSL are not present as explicit fields; they are parsed
 * from the `source` path using the `{n}k{m}k` filename convention.
 *
 * Returns `null` and increments the appropriate skip counter when the model,
 * hardware, or task cannot be resolved.
 *
 * @param row - A single flat row from the aggregate eval JSON array.
 * @param tracker - Shared skip tracker; counters are mutated in place on failure.
 * @returns A typed `EvalParams` object, or `null` if the row cannot be mapped.
 */
export function mapAggEvalRow(row: Record<string, any>, tracker: SkipTracker): EvalParams | null {
  const modelKey = resolveModelKey(row);
  if (!modelKey) {
    tracker.skips.unmappedModel++;
    const raw = String(row.model ?? '');
    if (raw) tracker.unmappedModels.add(raw);
    return null;
  }

  const gpuKey = hwToGpuKey(String(row.hw ?? ''));
  if (!gpuKey) {
    tracker.skips.unmappedHw++;
    const raw = String(row.hw ?? '');
    if (raw) tracker.unmappedHws.add(raw);
    return null;
  }

  const task = String(row.task ?? '').toLowerCase();
  if (!task) return null;

  const { framework, disagg } = normalizeFramework(String(row.framework ?? ''), row.disagg);
  const tp = parseInt2(row.tp) ?? 1;
  const ep = parseInt2(row.ep) ?? 1;
  const dpAttn = parseBool(row.dp_attention);
  const precision = String(row.precision ?? '').toLowerCase();
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(row.spec_decoding);

  // ISL/OSL is encoded in the source path (e.g. "eval_dsr1_1k8k_.../results_...").
  const islOsl = row.source ? parseIslOsl(String(row.source)) : null;

  const metrics: Record<string, number> = {};
  const add = (key: string, val: any) => {
    const n = parseNum(val);
    if (n !== undefined) metrics[key] = n;
  };
  add('em_strict', row.em_strict);
  add('em_strict_se', row.em_strict_se);
  add('em_flexible', row.em_flexible);
  add('em_flexible_se', row.em_flexible_se);
  add('n_eff', row.n_eff);
  add('score', row.score);
  add('score_se', row.score_se);

  return {
    config: {
      hardware: gpuKey,
      framework,
      model: modelKey,
      precision,
      specMethod,
      disagg,
      isMultinode: false,
      prefillTp: tp,
      prefillEp: ep,
      prefillDpAttn: dpAttn,
      prefillNumWorkers: 0,
      decodeTp: tp,
      decodeEp: ep,
      decodeDpAttn: dpAttn,
      decodeNumWorkers: 0,
      numPrefillGpu: tp * ep,
      numDecodeGpu: tp * ep,
    },
    task,
    isl: islOsl?.isl ?? null,
    osl: islOsl?.osl ?? null,
    conc: parseInt2(row.conc) ?? null,
    lmEvalVersion: null,
    metrics,
  };
}
