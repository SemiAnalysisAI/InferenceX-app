import { describe, it, expect } from 'vitest';

import {
  getModelAndSequence,
  getModelAndSequenceFromArtifact,
  getModelLabel,
  getSequenceLabel,
  getPrecisionLabel,
  getEvalBenchmarkLabel,
  isModelDeprecated,
  isSequenceDeprecated,
  Model,
  Sequence,
  Precision,
  EvalBenchmark,
} from '@/lib/data-mappings';

// ===========================================================================
// getModelAndSequence
// ===========================================================================
describe('getModelAndSequence', () => {
  it('parses artifact name with 70b model and 1k1k sequence', () => {
    const result = getModelAndSequence('results_70b_1k1k_fp8');
    expect(result).toEqual({ model: Model.Llama3_3_70B, sequence: Sequence.OneK_OneK });
  });

  it('parses artifact name with 70b model and 1k8k sequence', () => {
    const result = getModelAndSequence('results_70b_1k8k');
    expect(result).toEqual({ model: Model.Llama3_3_70B, sequence: Sequence.OneK_EightK });
  });

  it('parses artifact name with 70b model and 8k1k sequence', () => {
    const result = getModelAndSequence('results_70b_8k1k');
    expect(result).toEqual({ model: Model.Llama3_3_70B, sequence: Sequence.EightK_OneK });
  });

  it('parses artifact name with dsr1 model prefix', () => {
    const result = getModelAndSequence('results_dsr1_1k1k');
    expect(result).toEqual({ model: Model.DeepSeek_R1, sequence: Sequence.OneK_OneK });
  });

  it('parses artifact name with gptoss model prefix', () => {
    const result = getModelAndSequence('results_gptoss_1k8k');
    expect(result).toEqual({ model: Model.GptOss, sequence: Sequence.OneK_EightK });
  });

  it('parses artifact name with qwen3.5 model prefix', () => {
    const result = getModelAndSequence('results_qwen3.5_8k1k');
    expect(result).toEqual({ model: Model.Qwen3_5, sequence: Sequence.EightK_OneK });
  });

  it('parses artifact name with kimik2.5 model prefix', () => {
    const result = getModelAndSequence('results_kimik2.5_1k1k');
    expect(result).toEqual({ model: Model.Kimi_K2_5, sequence: Sequence.OneK_OneK });
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

  it('returns undefined for completely unrelated string', () => {
    expect(getModelAndSequence('foo_bar_baz')).toBeUndefined();
  });
});

// ===========================================================================
// getModelAndSequenceFromArtifact
// ===========================================================================
describe('getModelAndSequenceFromArtifact', () => {
  it('parses structured artifact with dsr1 prefix and 1k/1k ISL/OSL', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: 'dsr1',
      isl: 1024,
      osl: 1024,
    });
    expect(result).toEqual({ model: Model.DeepSeek_R1, sequence: Sequence.OneK_OneK });
  });

  it('parses structured artifact with 70b prefix and 1k/8k ISL/OSL', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: '70b',
      isl: 1024,
      osl: 8192,
    });
    expect(result).toEqual({ model: Model.Llama3_3_70B, sequence: Sequence.OneK_EightK });
  });

  it('parses structured artifact with gptoss prefix and 8k/1k ISL/OSL', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: 'gptoss',
      isl: 8192,
      osl: 1024,
    });
    expect(result).toEqual({ model: Model.GptOss, sequence: Sequence.EightK_OneK });
  });

  it('parses structured artifact with qwen3.5 prefix', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: 'qwen3.5',
      isl: 1024,
      osl: 1024,
    });
    expect(result).toEqual({ model: Model.Qwen3_5, sequence: Sequence.OneK_OneK });
  });

  it('parses structured artifact with kimik2.5 prefix', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: 'kimik2.5',
      isl: 8192,
      osl: 1024,
    });
    expect(result).toEqual({ model: Model.Kimi_K2_5, sequence: Sequence.EightK_OneK });
  });

  it('returns undefined for unknown model prefix', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: 'unknown',
      isl: 1024,
      osl: 1024,
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined for unknown ISL/OSL combination (8k/8k)', () => {
    const result = getModelAndSequenceFromArtifact({
      infmax_model_prefix: 'dsr1',
      isl: 8192,
      osl: 8192,
    });
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// isModelDeprecated
// ===========================================================================
describe('isModelDeprecated', () => {
  it('returns true for deprecated model Llama3_3_70B', () => {
    expect(isModelDeprecated(Model.Llama3_3_70B)).toBe(true);
  });

  it('returns false for non-deprecated model DeepSeek_R1', () => {
    expect(isModelDeprecated(Model.DeepSeek_R1)).toBe(false);
  });

  it('returns false for non-deprecated model GptOss', () => {
    expect(isModelDeprecated(Model.GptOss)).toBe(false);
  });
});

// ===========================================================================
// isSequenceDeprecated
// ===========================================================================
describe('isSequenceDeprecated', () => {
  it('returns true for deprecated sequence OneK_EightK', () => {
    expect(isSequenceDeprecated(Sequence.OneK_EightK)).toBe(true);
  });

  it('returns false for non-deprecated sequence OneK_OneK', () => {
    expect(isSequenceDeprecated(Sequence.OneK_OneK)).toBe(false);
  });

  it('returns false for non-deprecated sequence EightK_OneK', () => {
    expect(isSequenceDeprecated(Sequence.EightK_OneK)).toBe(false);
  });
});

// ===========================================================================
// getModelLabel
// ===========================================================================
describe('getModelLabel', () => {
  it('returns correct label for each known model', () => {
    expect(getModelLabel(Model.Llama3_3_70B)).toBe('Llama 3.3 70B Instruct');
    expect(getModelLabel(Model.Llama3_1_70B)).toBe('Llama 3.1 70B Instruct');
    expect(getModelLabel(Model.DeepSeek_R1)).toBe('DeepSeek R1 0528');
    expect(getModelLabel(Model.GptOss)).toBe('gpt-oss 120B');
    expect(getModelLabel(Model.Qwen3_5)).toBe('Qwen 3.5 397B-A17B');
    expect(getModelLabel(Model.Kimi_K2_5)).toBe('Kimi K2.5 1T');
  });

  it('falls back to the model value for unknown model', () => {
    const result = getModelLabel('NewModel-XYZ' as Model);
    expect(result).toBe('NewModel-XYZ');
  });
});

// ===========================================================================
// getSequenceLabel
// ===========================================================================
describe('getSequenceLabel', () => {
  it('returns correct label for each known sequence', () => {
    expect(getSequenceLabel(Sequence.OneK_OneK)).toBe('1K / 1K');
    expect(getSequenceLabel(Sequence.OneK_EightK)).toBe('1K / 8K');
    expect(getSequenceLabel(Sequence.EightK_OneK)).toBe('8K / 1K');
  });

  it('falls back to the sequence value for unknown sequence', () => {
    const result = getSequenceLabel('16k/16k' as Sequence);
    expect(result).toBe('16k/16k');
  });
});

// ===========================================================================
// getPrecisionLabel
// ===========================================================================
describe('getPrecisionLabel', () => {
  it('returns correct label for each known precision', () => {
    expect(getPrecisionLabel(Precision.FP4)).toBe('FP4');
    expect(getPrecisionLabel(Precision.FP8)).toBe('FP8');
    expect(getPrecisionLabel(Precision.BF16)).toBe('BF16');
    expect(getPrecisionLabel(Precision.INT4)).toBe('INT4');
  });

  it('falls back to the precision value for unknown precision', () => {
    const result = getPrecisionLabel('fp32' as Precision);
    expect(result).toBe('fp32');
  });
});

// ===========================================================================
// getEvalBenchmarkLabel
// ===========================================================================
describe('getEvalBenchmarkLabel', () => {
  it('returns correct label for GSM8K', () => {
    expect(getEvalBenchmarkLabel(EvalBenchmark.GSM8K)).toBe('GSM8K');
  });

  it('falls back to the benchmark value for unknown benchmark', () => {
    const result = getEvalBenchmarkLabel('humaneval' as EvalBenchmark);
    expect(result).toBe('humaneval');
  });
});
