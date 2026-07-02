/**
 * Re-export barrel — all model identity constants and helpers live in
 * `@semianalysisai/inferencex-constants`. This module exists so the ~50 app
 * import sites continue to use the `@/lib/data-mappings` path unchanged.
 *
 * App-only items that cannot live in constants (UI-specific helpers) remain
 * defined below.
 */
export {
  // ExclusionSpec type (pure data interface)
  type ExclusionSpec,
  // Model enum + metadata
  Model,
  type CategoryTag,
  groupByCategory,
  MODEL_OPTIONS,
  DEFAULT_MODELS,
  MAINTENANCE_MODELS,
  DEPRECATED_MODELS,
  EXPERIMENTAL_MODELS,
  isModelDefault,
  isModelDeprecated,
  isModelMaintenance,
  isModelExperimental,
  getModelCategory,
  getModelLabel,
  getModelExclusion,
  hasExclusion,
  MODEL_PREFIX_MAPPING,
  // Sequences
  Sequence,
  SEQUENCE_OPTIONS,
  DEPRECATED_SEQUENCES,
  isSequenceDeprecated,
  getSequenceCategory,
  getSequenceLabel,
  SEQUENCE_PREFIX_MAPPING,
  // Artifact parsing
  getModelAndSequence,
  getModelAndSequenceFromArtifact,
  // Precisions
  Precision,
  PRECISION_OPTIONS,
  getPrecisionLabel,
  // Eval benchmarks
  EvalBenchmark,
  getEvalBenchmarkLabel,
} from '@semianalysisai/inferencex-constants';

// ---------------------------------------------------------------------------
// App-only helpers (UI concerns; React/Next-aware code may depend on these)
// ---------------------------------------------------------------------------

/**
 * Pick the chart watermark for a given run state. Unofficial-run charts get
 * the red unofficial-run warning; everything else gets the logo.
 */
export function getChartWatermark(isUnofficialRun = false): 'logo' | 'unofficial' {
  return isUnofficialRun ? 'unofficial' : 'logo';
}
