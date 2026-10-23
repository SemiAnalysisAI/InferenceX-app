import { normalizeLegacyTpuRow, physicalChipCount } from './tpu-normalization';
import { PRECISION_KEYS } from '@semianalysisai/inferencex-constants';
import type { ConfigParams } from './config-cache';
import { resolveConfigTopology } from './topology';
import type { SkipTracker } from './skip-tracker';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
  normalizePrecision,
  normalizeSpecMethod,
  parseNum,
  parseInt2,
  parseIslOsl,
} from './normalizers';

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

export function mapEvalRow(
  meta: Record<string, any>,
  results: Record<string, any>,
  tracker: SkipTracker,
  runId?: string | number | null,
): EvalParams[] {
  meta = normalizeLegacyTpuRow(meta, runId);
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

  const { framework, disagg: disaggFromFw } = normalizeFramework(
    String(meta.framework ?? ''),
    meta.disagg,
  );
  const precision = normalizePrecision(String(meta.precision ?? ''));
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(meta.spec_decoding);
  const lmEvalVersion = results.lm_eval_version ? String(results.lm_eval_version) : null;
  const config: ConfigParams = {
    hardware: gpuKey,
    framework,
    model: modelKey,
    precision,
    specMethod,
    ...resolveConfigTopology(meta, framework, disaggFromFw),
  };

  const nSamples = results['n-samples'] as Record<string, any> | undefined;
  const isl = parseInt2(meta.isl) ?? null;
  const osl = parseInt2(meta.osl) ?? null;

  return taskEntries.map(([taskName, rawMetrics]) => {
    const metrics: Record<string, number> = {};
    if (rawMetrics && typeof rawMetrics === 'object') {
      for (const [k, v] of Object.entries(rawMetrics as Record<string, any>)) {
        if (k === 'alias') continue;
        const n = parseNum(v);
        if (n !== undefined) metrics[EVAL_METRIC_RENAMES[k] ?? k] = n;
      }
    }
    const dp = physicalChipCount(meta.dp);
    if (dp !== undefined) metrics.dp = dp;
    const nEff = parseNum(nSamples?.[taskName]?.effective);
    if (nEff !== undefined) metrics['n_eff'] = nEff;

    return {
      config,
      task: taskName.toLowerCase(),
      isl: isl === 0 ? null : isl,
      osl: osl === 0 ? null : osl,
      conc: parseInt2(meta.conc) ?? null,
      lmEvalVersion,
      metrics,
    };
  });
}

export function mapAggEvalRow(
  row: Record<string, any>,
  tracker: SkipTracker,
  runId?: string | number | null,
): EvalParams | null {
  row = normalizeLegacyTpuRow(row, runId);
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

  const { framework, disagg: disaggFromFw } = normalizeFramework(
    String(row.framework ?? ''),
    row.disagg,
  );
  const precision = normalizePrecision(String(row.precision ?? ''));
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(row.spec_decoding);

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
  const dp = physicalChipCount(row.dp);
  if (dp !== undefined) metrics.dp = dp;

  return {
    config: {
      hardware: gpuKey,
      framework,
      model: modelKey,
      precision,
      specMethod,
      ...resolveConfigTopology(row, framework, disaggFromFw),
    },
    task,
    isl: islOsl?.isl ?? null,
    osl: islOsl?.osl ?? null,
    conc: parseInt2(row.conc) ?? null,
    lmEvalVersion: null,
    metrics,
  };
}
