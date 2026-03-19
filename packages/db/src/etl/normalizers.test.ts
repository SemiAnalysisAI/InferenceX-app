import { describe, it, expect } from 'vitest';
import {
  hwToGpuKey,
  resolveModelKey,
  normalizeFramework,
  normalizeSpecMethod,
  parseBool,
  parseNum,
  parseInt2,
  parseIslOsl,
  MODEL_TO_KEY,
  GPU_KEYS,
} from './normalizers';
import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

describe('hwToGpuKey', () => {
  it('strips -nv suffix', () => {
    expect(hwToGpuKey('h200-nv')).toBe('h200');
    expect(hwToGpuKey('b200-nv')).toBe('b200');
    expect(hwToGpuKey('gb300-nv')).toBe('gb300');
  });

  it('strips -amd suffix', () => {
    expect(hwToGpuKey('mi355x-amd')).toBe('mi355x');
    expect(hwToGpuKey('mi300x-amd')).toBe('mi300x');
  });

  it('strips -amds suffix', () => {
    expect(hwToGpuKey('mi355x-amds')).toBe('mi355x');
  });

  it('strips -trt suffix', () => {
    expect(hwToGpuKey('h100-trt')).toBe('h100');
  });

  it('strips -multinode-slurm suffix', () => {
    expect(hwToGpuKey('h200-multinode-slurm')).toBe('h200');
  });

  it('strips -multinode suffix', () => {
    expect(hwToGpuKey('b200-multinode')).toBe('b200');
    expect(hwToGpuKey('h200-multinode')).toBe('h200');
  });

  it('strips -nvs suffix', () => {
    expect(hwToGpuKey('h100-nvs')).toBe('h100');
  });

  it('strips -disagg suffix', () => {
    expect(hwToGpuKey('h200-disagg')).toBe('h200');
  });

  it('strips -nvd suffix', () => {
    expect(hwToGpuKey('b200-nvd')).toBe('b200');
  });

  it('strips -dgxc suffix', () => {
    expect(hwToGpuKey('gb200-dgxc')).toBe('gb200');
  });

  it('strips -nb suffix', () => {
    expect(hwToGpuKey('b300-nb')).toBe('b300');
  });

  it('strips runner index suffix before other suffixes', () => {
    expect(hwToGpuKey('mi355x-amd_0')).toBe('mi355x');
    expect(hwToGpuKey('mi355x-amd_2')).toBe('mi355x');
  });

  it('handles bare GPU keys', () => {
    expect(hwToGpuKey('h100')).toBe('h100');
    expect(hwToGpuKey('mi300x')).toBe('mi300x');
  });

  it('is case-insensitive', () => {
    expect(hwToGpuKey('H200-NV')).toBe('h200');
    expect(hwToGpuKey('MI355X-AMD')).toBe('mi355x');
  });

  it('returns null for unknown hardware', () => {
    expect(hwToGpuKey('a100-nv')).toBeNull();
    expect(hwToGpuKey('v100')).toBeNull();
    expect(hwToGpuKey('')).toBeNull();
    expect(hwToGpuKey('unknown-gpu')).toBeNull();
  });

  it('returns null when stripped base is not a valid GPU key', () => {
    expect(hwToGpuKey('imaginary-nv')).toBeNull();
  });
});

describe('resolveModelKey', () => {
  it('resolves from infmax_model_prefix', () => {
    expect(resolveModelKey({ infmax_model_prefix: 'dsr1' })).toBe('dsr1');
    expect(resolveModelKey({ infmax_model_prefix: 'llama70b' })).toBe('llama70b');
  });

  it('resolves from model_prefix (eval format)', () => {
    expect(resolveModelKey({ model_prefix: 'dsr1' })).toBe('dsr1');
  });

  it('strips precision suffix from prefix', () => {
    expect(resolveModelKey({ infmax_model_prefix: 'dsr1-fp8' })).toBe('dsr1');
    expect(resolveModelKey({ infmax_model_prefix: 'llama70b-fp4' })).toBe('llama70b');
    expect(resolveModelKey({ infmax_model_prefix: 'dsr1-nvfp4-v2' })).toBe('dsr1');
    expect(resolveModelKey({ infmax_model_prefix: 'dsr1-mxfp4' })).toBe('dsr1');
  });

  it('resolves gptoss alias from prefix', () => {
    expect(resolveModelKey({ infmax_model_prefix: 'gptoss' })).toBe('gptoss120b');
  });

  it('falls back to MODEL_TO_KEY when prefix not present', () => {
    expect(resolveModelKey({ model: 'deepseek-ai/DeepSeek-R1' })).toBe('dsr1');
    expect(resolveModelKey({ model: 'nvidia/Llama-3.3-70B-Instruct-FP8' })).toBe('llama70b');
    expect(resolveModelKey({ model: 'openai/gpt-oss-120b' })).toBe('gptoss120b');
  });

  it('falls back to MODEL_TO_KEY for local mount paths', () => {
    expect(resolveModelKey({ model: '/mnt/lustre01/models/deepseek-r1-0528-fp4-v2' })).toBe('dsr1');
    expect(resolveModelKey({ model: '/models/DeepSeek-R1' })).toBe('dsr1');
  });

  it('prefers infmax_model_prefix over model', () => {
    expect(
      resolveModelKey({
        infmax_model_prefix: 'llama70b',
        model: 'deepseek-ai/DeepSeek-R1',
      }),
    ).toBe('llama70b');
  });

  it('returns null for unknown model', () => {
    expect(resolveModelKey({ model: 'unknown/model' })).toBeNull();
    expect(resolveModelKey({})).toBeNull();
    expect(resolveModelKey({ infmax_model_prefix: 'unknown_model_xyz' })).toBeNull();
  });

  it('resolves qwen3.5 prefix', () => {
    expect(resolveModelKey({ infmax_model_prefix: 'qwen3.5' })).toBe('qwen3.5');
    expect(resolveModelKey({ infmax_model_prefix: 'qwen3.5-fp8' })).toBe('qwen3.5');
  });

  it('resolves models from HuggingFace paths via MODEL_TO_KEY', () => {
    expect(resolveModelKey({ model: 'Qwen/Qwen3.5-397B-A17B' })).toBe('qwen3.5');
    expect(resolveModelKey({ model: 'moonshotai/Kimi-K2.5' })).toBe('kimik2.5');
    expect(resolveModelKey({ model: 'MiniMaxAI/MiniMax-M2.5' })).toBe('minimaxm2.5');
    expect(resolveModelKey({ model: 'zai-org/GLM-5-FP8' })).toBe('glm5');
  });
});

describe('MODEL_TO_KEY', () => {
  it('all values point to valid DB model keys', () => {
    const dbKeys = new Set(Object.keys(DB_MODEL_TO_DISPLAY));
    for (const [path, key] of Object.entries(MODEL_TO_KEY)) {
      expect(dbKeys.has(key), `MODEL_TO_KEY['${path}'] = '${key}' not in DB_MODEL_TO_DISPLAY`).toBe(
        true,
      );
    }
  });
});

describe('normalizeFramework', () => {
  it('lowercases framework name', () => {
    expect(normalizeFramework('VLLM', false)).toEqual({ framework: 'vllm', disagg: false });
    expect(normalizeFramework('SGLang', false)).toEqual({ framework: 'sglang', disagg: false });
  });

  it('normalizes sglang-disagg to mori-sglang + disagg=true', () => {
    expect(normalizeFramework('sglang-disagg', false)).toEqual({
      framework: 'mori-sglang',
      disagg: true,
    });
    expect(normalizeFramework('SGLANG-DISAGG', false)).toEqual({
      framework: 'mori-sglang',
      disagg: true,
    });
  });

  it('renames dynamo-trtllm to dynamo-trt', () => {
    expect(normalizeFramework('dynamo-trtllm', false)).toEqual({
      framework: 'dynamo-trt',
      disagg: false,
    });
  });

  it('reads disagg flag from disaggField', () => {
    expect(normalizeFramework('vllm', true)).toEqual({ framework: 'vllm', disagg: true });
    expect(normalizeFramework('vllm', 'True')).toEqual({ framework: 'vllm', disagg: true });
    expect(normalizeFramework('vllm', 'true')).toEqual({ framework: 'vllm', disagg: true });
    expect(normalizeFramework('vllm', false)).toEqual({ framework: 'vllm', disagg: false });
    expect(normalizeFramework('vllm', 'false')).toEqual({ framework: 'vllm', disagg: false });
    expect(normalizeFramework('vllm', null)).toEqual({ framework: 'vllm', disagg: false });
  });

  it('sglang-disagg ignores disaggField (always true)', () => {
    expect(normalizeFramework('sglang-disagg', false)).toEqual({
      framework: 'mori-sglang',
      disagg: true,
    });
  });
});

describe('normalizeSpecMethod', () => {
  it('returns none for falsy values', () => {
    expect(normalizeSpecMethod(null)).toBe('none');
    expect(normalizeSpecMethod(undefined)).toBe('none');
    expect(normalizeSpecMethod('')).toBe('none');
    expect(normalizeSpecMethod(0)).toBe('none');
    expect(normalizeSpecMethod(false)).toBe('none');
  });

  it('lowercases the method name', () => {
    expect(normalizeSpecMethod('Eagle')).toBe('eagle');
    expect(normalizeSpecMethod('MEDUSA')).toBe('medusa');
  });

  it('preserves already-lowercase values', () => {
    expect(normalizeSpecMethod('eagle')).toBe('eagle');
  });
});

describe('parseBool', () => {
  it('returns true for true, "true", "True"', () => {
    expect(parseBool(true)).toBe(true);
    expect(parseBool('true')).toBe(true);
    expect(parseBool('True')).toBe(true);
  });

  it('returns false for everything else', () => {
    expect(parseBool(false)).toBe(false);
    expect(parseBool('false')).toBe(false);
    expect(parseBool('False')).toBe(false);
    expect(parseBool(null)).toBe(false);
    expect(parseBool(undefined)).toBe(false);
    expect(parseBool(0)).toBe(false);
    expect(parseBool(1)).toBe(false);
    expect(parseBool('1')).toBe(false);
    expect(parseBool('TRUE')).toBe(false);
  });
});

describe('parseNum', () => {
  it('parses numeric values', () => {
    expect(parseNum(42)).toBe(42);
    expect(parseNum(3.14)).toBe(3.14);
    expect(parseNum(0)).toBe(0);
  });

  it('parses numeric strings', () => {
    expect(parseNum('42')).toBe(42);
    expect(parseNum('3.14')).toBe(3.14);
    expect(parseNum('0')).toBe(0);
  });

  it('returns undefined for null/undefined', () => {
    expect(parseNum(null)).toBeUndefined();
    expect(parseNum(undefined)).toBeUndefined();
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseNum('abc')).toBeUndefined();
    expect(parseNum('')).toBeUndefined();
  });

  it('parses strings with leading numbers', () => {
    expect(parseNum('42abc')).toBe(42);
  });
});

describe('parseInt2', () => {
  it('parses integer values', () => {
    expect(parseInt2(42)).toBe(42);
    expect(parseInt2(0)).toBe(0);
  });

  it('rounds non-integer numbers', () => {
    expect(parseInt2(3.7)).toBe(4);
    expect(parseInt2(3.2)).toBe(3);
  });

  it('parses integer strings', () => {
    expect(parseInt2('42')).toBe(42);
    expect(parseInt2('0')).toBe(0);
  });

  it('truncates decimal strings to integer', () => {
    expect(parseInt2('3.7')).toBe(3); // parseInt behavior: truncates at decimal
  });

  it('returns undefined for null/undefined', () => {
    expect(parseInt2(null)).toBeUndefined();
    expect(parseInt2(undefined)).toBeUndefined();
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseInt2('abc')).toBeUndefined();
    expect(parseInt2('')).toBeUndefined();
  });
});

describe('parseIslOsl', () => {
  it('parses standard sequence lengths from filenames', () => {
    expect(parseIslOsl('Full_Sweep_-_1k1k_12345')).toEqual({ isl: 1024, osl: 1024 });
    expect(parseIslOsl('results_dsr1_1k8k_4305020262.zip')).toEqual({ isl: 1024, osl: 8192 });
    expect(parseIslOsl('eval_dsr1_8k1k_something.json')).toEqual({ isl: 8192, osl: 1024 });
  });

  it('handles hyphen separator before numbers', () => {
    expect(parseIslOsl('sweep-1k1k-12345')).toEqual({ isl: 1024, osl: 1024 });
  });

  it('returns null when no match found', () => {
    expect(parseIslOsl('no_sequence_here')).toBeNull();
    expect(parseIslOsl('')).toBeNull();
    expect(parseIslOsl('file.json')).toBeNull();
  });

  it('requires delimiters around the pattern', () => {
    // Pattern requires [_-] before and [_\-.] after
    expect(parseIslOsl('x1k1ky')).toBeNull();
  });

  it('parses larger sequences', () => {
    expect(parseIslOsl('test_32k16k_result.json')).toEqual({ isl: 32768, osl: 16384 });
  });
});

describe('GPU_KEYS re-export', () => {
  it('re-exports GPU_KEYS from constants', () => {
    expect(GPU_KEYS).toBeInstanceOf(Set);
    expect(GPU_KEYS.has('h100')).toBe(true);
  });
});
