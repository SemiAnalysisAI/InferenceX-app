import { describe, it, expect } from 'vitest';
import {
  type CategoryTag,
  Model,
  Sequence,
  Precision,
  EvalBenchmark,
  MODEL_OPTIONS,
  DEFAULT_MODELS,
  MAINTENANCE_MODELS,
  DEPRECATED_MODELS,
  EXPERIMENTAL_MODELS,
  SEQUENCE_OPTIONS,
  DEPRECATED_SEQUENCES,
  PRECISION_OPTIONS,
  MODEL_PREFIX_MAPPING,
  SEQUENCE_PREFIX_MAPPING,
  groupByCategory,
  isModelDefault,
  isModelDeprecated,
  isModelMaintenance,
  isModelExperimental,
  getModelCategory,
  getModelLabel,
  getModelExclusion,
  hasExclusion,
  isSequenceDeprecated,
  getSequenceCategory,
  getSequenceLabel,
  getPrecisionLabel,
  getEvalBenchmarkLabel,
  getModelAndSequence,
  getModelAndSequenceFromArtifact,
} from './models';

// ===========================================================================
// Model enum basics
// ===========================================================================
describe('Model enum values', () => {
  it('enum values are their display-name strings', () => {
    expect(Model.DeepSeek_R1).toBe('DeepSeek-R1-0528');
    expect(Model.GptOss).toBe('gpt-oss-120b');
    expect(Model.Llama3_3_70B).toBe('Llama-3.3-70B-Instruct-FP8');
    expect(Model.Kimi_K2_5).toBe('Kimi-K2.5');
    expect(Model.GLM_5).toBe('GLM-5');
    expect(Model.DeepSeek_V4_Pro).toBe('DeepSeek-V4-Pro');
  });
});

// ===========================================================================
// MODEL_OPTIONS / category sets
// ===========================================================================
describe('MODEL_OPTIONS', () => {
  it('excludes hidden models', () => {
    expect(MODEL_OPTIONS).not.toContain(Model.Llama3_1_70B);
  });

  it('includes default and maintenance and deprecated models', () => {
    expect(MODEL_OPTIONS).toContain(Model.DeepSeek_V4_Pro);
    expect(MODEL_OPTIONS).toContain(Model.DeepSeek_R1);
    expect(MODEL_OPTIONS).toContain(Model.Llama3_3_70B);
  });
});

describe('DEFAULT_MODELS', () => {
  it('contains only default-category models', () => {
    for (const m of DEFAULT_MODELS) {
      expect(getModelCategory(m)).toBe('default');
    }
  });

  it('includes the expected default models', () => {
    expect(DEFAULT_MODELS.has(Model.DeepSeek_V4_Pro)).toBe(true);
    expect(DEFAULT_MODELS.has(Model.Kimi_K2_5)).toBe(true);
    expect(DEFAULT_MODELS.has(Model.MiniMax_M3)).toBe(true);
    expect(DEFAULT_MODELS.has(Model.GLM_5)).toBe(true);
    expect(DEFAULT_MODELS.has(Model.Qwen3_5)).toBe(true);
  });
});

describe('MAINTENANCE_MODELS', () => {
  it('contains DeepSeek_R1 and GptOss', () => {
    expect(MAINTENANCE_MODELS.has(Model.DeepSeek_R1)).toBe(true);
    expect(MAINTENANCE_MODELS.has(Model.GptOss)).toBe(true);
  });
});

describe('DEPRECATED_MODELS', () => {
  it('contains Llama3_3_70B and MiniMax_M2_5', () => {
    expect(DEPRECATED_MODELS.has(Model.Llama3_3_70B)).toBe(true);
    expect(DEPRECATED_MODELS.has(Model.MiniMax_M2_5)).toBe(true);
  });
});

describe('EXPERIMENTAL_MODELS', () => {
  it('is empty (no experimental models currently)', () => {
    expect(EXPERIMENTAL_MODELS.size).toBe(0);
  });
});

// ===========================================================================
// isModel* predicates
// ===========================================================================
describe('isModelDefault', () => {
  it('returns true for default models', () => {
    expect(isModelDefault(Model.DeepSeek_V4_Pro)).toBe(true);
    expect(isModelDefault(Model.Kimi_K2_5)).toBe(true);
  });

  it('returns false for non-default models', () => {
    expect(isModelDefault(Model.DeepSeek_R1)).toBe(false);
    expect(isModelDefault(Model.Llama3_3_70B)).toBe(false);
  });
});

describe('isModelDeprecated', () => {
  it('returns true for deprecated models', () => {
    expect(isModelDeprecated(Model.Llama3_3_70B)).toBe(true);
    expect(isModelDeprecated(Model.MiniMax_M2_5)).toBe(true);
  });

  it('returns false for non-deprecated models', () => {
    expect(isModelDeprecated(Model.DeepSeek_R1)).toBe(false);
    expect(isModelDeprecated(Model.GptOss)).toBe(false);
  });
});

describe('isModelMaintenance', () => {
  it('returns true for maintenance models', () => {
    expect(isModelMaintenance(Model.DeepSeek_R1)).toBe(true);
    expect(isModelMaintenance(Model.GptOss)).toBe(true);
  });

  it('returns false for non-maintenance models', () => {
    expect(isModelMaintenance(Model.Llama3_3_70B)).toBe(false);
    expect(isModelMaintenance(Model.DeepSeek_V4_Pro)).toBe(false);
  });
});

describe('isModelExperimental', () => {
  it('returns false for all current models', () => {
    for (const m of Object.values(Model)) {
      expect(isModelExperimental(m)).toBe(false);
    }
  });
});

// ===========================================================================
// getModelLabel
// ===========================================================================
describe('getModelLabel', () => {
  it('returns correct label for each known model', () => {
    expect(getModelLabel(Model.Llama3_3_70B)).toBe('Llama 3.3 70B Instruct');
    expect(getModelLabel(Model.Llama3_1_70B)).toBe('Llama 3.1 70B Instruct');
    expect(getModelLabel(Model.DeepSeek_R1)).toBe('DeepSeek R1 0528 671B');
    expect(getModelLabel(Model.DeepSeek_V4_Pro)).toBe('DeepSeek V4 Pro 1.6T');
    expect(getModelLabel(Model.GptOss)).toBe('gpt-oss 120B');
    expect(getModelLabel(Model.Qwen3_5)).toBe('Qwen3.5 397B');
    expect(getModelLabel(Model.Kimi_K2_5)).toBe('Kimi K2.5/2.6/2.7-Code 1T');
    expect(getModelLabel(Model.GLM_5)).toBe('GLM5/5.1 744B');
    expect(getModelLabel(Model.MiniMax_M2_5)).toBe('MiniMax M2.5/2.7 230B');
    expect(getModelLabel(Model.MiniMax_M3)).toBe('MiniMax M3 428B');
  });

  it('falls back to the model value for unknown model', () => {
    expect(getModelLabel('NewModel-XYZ' as Model)).toBe('NewModel-XYZ');
  });
});

// ===========================================================================
// getModelCategory
// ===========================================================================
describe('getModelCategory', () => {
  it('returns the correct category for known models', () => {
    expect(getModelCategory(Model.DeepSeek_V4_Pro)).toBe('default');
    expect(getModelCategory(Model.DeepSeek_R1)).toBe('maintenance');
    expect(getModelCategory(Model.Llama3_3_70B)).toBe('deprecated');
    expect(getModelCategory(Model.Llama3_1_70B)).toBe('hidden');
  });

  it('falls back to default for unknown model', () => {
    expect(getModelCategory('UnknownModel' as Model)).toBe('default');
  });
});

// ===========================================================================
// getModelExclusion / hasExclusion
// ===========================================================================
describe('getModelExclusion', () => {
  it('returns MTP exclusion spec for DeepSeek_V4_Pro', () => {
    const specs = getModelExclusion(Model.DeepSeek_V4_Pro);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs[0].suffix).toBe('_mtp');
  });

  it('returns empty array for models without exclusion', () => {
    expect(getModelExclusion(Model.DeepSeek_R1)).toEqual([]);
    expect(getModelExclusion(Model.GLM_5)).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(getModelExclusion(null)).toEqual([]);
    expect(getModelExclusion(undefined)).toEqual([]);
    expect(getModelExclusion('')).toEqual([]);
  });
});

describe('hasExclusion', () => {
  it('returns true for DeepSeek_V4_Pro', () => {
    expect(hasExclusion(Model.DeepSeek_V4_Pro)).toBe(true);
  });

  it('returns false for models without exclusion', () => {
    expect(hasExclusion(Model.GLM_5)).toBe(false);
    expect(hasExclusion(null)).toBe(false);
  });
});

// ===========================================================================
// MODEL_PREFIX_MAPPING
// ===========================================================================
describe('MODEL_PREFIX_MAPPING', () => {
  it('maps prefixes to models', () => {
    expect(MODEL_PREFIX_MAPPING['dsr1']).toBe(Model.DeepSeek_R1);
    expect(MODEL_PREFIX_MAPPING['70b']).toBe(Model.Llama3_3_70B);
    expect(MODEL_PREFIX_MAPPING['gptoss']).toBe(Model.GptOss);
    expect(MODEL_PREFIX_MAPPING['kimik2.5']).toBe(Model.Kimi_K2_5);
    expect(MODEL_PREFIX_MAPPING['glm5']).toBe(Model.GLM_5);
    expect(MODEL_PREFIX_MAPPING['dsv4']).toBe(Model.DeepSeek_V4_Pro);
  });

  it('does not include the empty-prefix Llama 3.1 model', () => {
    expect(MODEL_PREFIX_MAPPING['']).toBeUndefined();
  });
});

// ===========================================================================
// groupByCategory
// ===========================================================================
function classifyTestItem(item: string): CategoryTag {
  if (item === 'a') return 'default';
  if (item === 'b') return 'deprecated';
  if (item === 'c') return 'maintenance';
  return 'hidden';
}

describe('groupByCategory', () => {
  it('partitions items by category', () => {
    const items = ['a', 'b', 'c', 'd'] as const;
    const result = groupByCategory([...items], classifyTestItem);
    expect(result.default).toEqual(['a']);
    expect(result.deprecated).toEqual(['b']);
    expect(result.maintenance).toEqual(['c']);
    expect(result.hidden).toEqual(['d']);
    expect(result.experimental).toEqual([]);
  });
});

// ===========================================================================
// Sequence
// ===========================================================================
describe('Sequence enum values', () => {
  it('enum values are their string representations', () => {
    expect(Sequence.OneK_OneK).toBe('1k/1k');
    expect(Sequence.OneK_EightK).toBe('1k/8k');
    expect(Sequence.EightK_OneK).toBe('8k/1k');
  });
});

describe('SEQUENCE_OPTIONS', () => {
  it('contains all three sequences', () => {
    expect(SEQUENCE_OPTIONS).toHaveLength(3);
    expect(SEQUENCE_OPTIONS).toContain(Sequence.OneK_OneK);
    expect(SEQUENCE_OPTIONS).toContain(Sequence.OneK_EightK);
    expect(SEQUENCE_OPTIONS).toContain(Sequence.EightK_OneK);
  });
});

describe('DEPRECATED_SEQUENCES', () => {
  it('contains only OneK_EightK', () => {
    expect(DEPRECATED_SEQUENCES.has(Sequence.OneK_EightK)).toBe(true);
    expect(DEPRECATED_SEQUENCES.has(Sequence.OneK_OneK)).toBe(false);
    expect(DEPRECATED_SEQUENCES.has(Sequence.EightK_OneK)).toBe(false);
  });
});

describe('isSequenceDeprecated', () => {
  it('returns true for deprecated sequence', () => {
    expect(isSequenceDeprecated(Sequence.OneK_EightK)).toBe(true);
  });

  it('returns false for non-deprecated sequences', () => {
    expect(isSequenceDeprecated(Sequence.OneK_OneK)).toBe(false);
    expect(isSequenceDeprecated(Sequence.EightK_OneK)).toBe(false);
  });
});

describe('getSequenceLabel', () => {
  it('returns correct labels', () => {
    expect(getSequenceLabel(Sequence.OneK_OneK)).toBe('1K / 1K');
    expect(getSequenceLabel(Sequence.OneK_EightK)).toBe('1K / 8K');
    expect(getSequenceLabel(Sequence.EightK_OneK)).toBe('8K / 1K');
  });

  it('falls back to the sequence value for unknown', () => {
    expect(getSequenceLabel('16k/16k' as Sequence)).toBe('16k/16k');
  });
});

describe('getSequenceCategory', () => {
  it('returns correct categories', () => {
    expect(getSequenceCategory(Sequence.OneK_OneK)).toBe('default');
    expect(getSequenceCategory(Sequence.OneK_EightK)).toBe('deprecated');
    expect(getSequenceCategory(Sequence.EightK_OneK)).toBe('default');
  });
});

describe('SEQUENCE_PREFIX_MAPPING', () => {
  it('maps compact strings to sequences', () => {
    expect(SEQUENCE_PREFIX_MAPPING['1k1k']).toBe(Sequence.OneK_OneK);
    expect(SEQUENCE_PREFIX_MAPPING['1k8k']).toBe(Sequence.OneK_EightK);
    expect(SEQUENCE_PREFIX_MAPPING['8k1k']).toBe(Sequence.EightK_OneK);
  });
});

// ===========================================================================
// Precision
// ===========================================================================
describe('Precision enum values', () => {
  it('enum values are their key strings', () => {
    expect(Precision.FP4).toBe('fp4');
    expect(Precision.FP4FP8).toBe('fp4fp8');
    expect(Precision.FP8).toBe('fp8');
    expect(Precision.BF16).toBe('bf16');
    expect(Precision.INT4).toBe('int4');
  });
});

describe('PRECISION_OPTIONS', () => {
  it('contains all precision values', () => {
    expect(PRECISION_OPTIONS).toHaveLength(5);
    for (const p of Object.values(Precision)) {
      expect(PRECISION_OPTIONS).toContain(p);
    }
  });
});

describe('getPrecisionLabel', () => {
  it('returns correct labels', () => {
    expect(getPrecisionLabel(Precision.FP4)).toBe('FP4');
    expect(getPrecisionLabel(Precision.FP4FP8)).toBe('FP4+FP8');
    expect(getPrecisionLabel(Precision.FP8)).toBe('FP8');
    expect(getPrecisionLabel(Precision.BF16)).toBe('BF16');
    expect(getPrecisionLabel(Precision.INT4)).toBe('INT4');
  });

  it('falls back to the precision value for unknown', () => {
    expect(getPrecisionLabel('fp32' as Precision)).toBe('fp32');
  });
});

// ===========================================================================
// EvalBenchmark
// ===========================================================================
describe('getEvalBenchmarkLabel', () => {
  it('returns correct label for GSM8K', () => {
    expect(getEvalBenchmarkLabel(EvalBenchmark.GSM8K)).toBe('GSM8K');
  });

  it('falls back to the benchmark value for unknown', () => {
    expect(getEvalBenchmarkLabel('humaneval' as EvalBenchmark)).toBe('humaneval');
  });
});

// ===========================================================================
// getModelAndSequence
// ===========================================================================
describe('getModelAndSequence', () => {
  it('parses artifact name with 70b model and 1k1k sequence', () => {
    expect(getModelAndSequence('results_70b_1k1k_fp8')).toEqual({
      model: Model.Llama3_3_70B,
      sequence: Sequence.OneK_OneK,
    });
  });

  it('parses artifact name with 70b model and 1k8k sequence', () => {
    expect(getModelAndSequence('results_70b_1k8k')).toEqual({
      model: Model.Llama3_3_70B,
      sequence: Sequence.OneK_EightK,
    });
  });

  it('parses artifact name with 70b model and 8k1k sequence', () => {
    expect(getModelAndSequence('results_70b_8k1k')).toEqual({
      model: Model.Llama3_3_70B,
      sequence: Sequence.EightK_OneK,
    });
  });

  it('parses artifact name with dsr1 model prefix', () => {
    expect(getModelAndSequence('results_dsr1_1k1k')).toEqual({
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_OneK,
    });
  });

  it('parses artifact name with gptoss model prefix', () => {
    expect(getModelAndSequence('results_gptoss_1k8k')).toEqual({
      model: Model.GptOss,
      sequence: Sequence.OneK_EightK,
    });
  });

  it('parses artifact name with qwen3.5 model prefix', () => {
    expect(getModelAndSequence('results_qwen3.5_8k1k')).toEqual({
      model: Model.Qwen3_5,
      sequence: Sequence.EightK_OneK,
    });
  });

  it('parses artifact name with kimik2.5 model prefix', () => {
    expect(getModelAndSequence('results_kimik2.5_1k1k')).toEqual({
      model: Model.Kimi_K2_5,
      sequence: Sequence.OneK_OneK,
    });
  });

  it('returns undefined for unrecognized model prefix', () => {
    expect(getModelAndSequence('results_unknown_1k1k')).toBeUndefined();
  });

  it('returns undefined for recognized model but no sequence', () => {
    expect(getModelAndSequence('results_70b_nosequence')).toBeUndefined();
  });

  it('returns undefined for recognized sequence but no model', () => {
    expect(getModelAndSequence('results_1k1k')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getModelAndSequence('')).toBeUndefined();
  });
});

// ===========================================================================
// getModelAndSequenceFromArtifact
// ===========================================================================
describe('getModelAndSequenceFromArtifact', () => {
  it('parses structured artifact with dsr1 prefix and 1k/1k ISL/OSL', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: 'dsr1', isl: 1024, osl: 1024 }),
    ).toEqual({ model: Model.DeepSeek_R1, sequence: Sequence.OneK_OneK });
  });

  it('parses structured artifact with 70b prefix and 1k/8k ISL/OSL', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: '70b', isl: 1024, osl: 8192 }),
    ).toEqual({ model: Model.Llama3_3_70B, sequence: Sequence.OneK_EightK });
  });

  it('parses structured artifact with gptoss prefix and 8k/1k ISL/OSL', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: 'gptoss', isl: 8192, osl: 1024 }),
    ).toEqual({ model: Model.GptOss, sequence: Sequence.EightK_OneK });
  });

  it('parses structured artifact with qwen3.5 prefix', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: 'qwen3.5', isl: 1024, osl: 1024 }),
    ).toEqual({ model: Model.Qwen3_5, sequence: Sequence.OneK_OneK });
  });

  it('parses structured artifact with kimik2.5 prefix', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: 'kimik2.5', isl: 8192, osl: 1024 }),
    ).toEqual({ model: Model.Kimi_K2_5, sequence: Sequence.EightK_OneK });
  });

  it('returns undefined for unknown model prefix', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: 'unknown', isl: 1024, osl: 1024 }),
    ).toBeUndefined();
  });

  it('returns undefined for unknown ISL/OSL combination (8k/8k)', () => {
    expect(
      getModelAndSequenceFromArtifact({ infmax_model_prefix: 'dsr1', isl: 8192, osl: 8192 }),
    ).toBeUndefined();
  });
});
