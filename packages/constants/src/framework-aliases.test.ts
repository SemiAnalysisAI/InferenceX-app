import { describe, expect, it } from 'vitest';

import {
  FRAMEWORK_ALIASES,
  FRAMEWORK_LABELS,
  MODEL_SPEC_METHOD_LABELS,
  resolveFrameworkAlias,
  resolveFrameworkAliasesInString,
  resolveFrameworkPartLabel,
} from './framework-aliases';

describe('FRAMEWORK_LABELS', () => {
  it('labels the canonical mooncake-atom framework "Mooncake ATOMesh¹"', () => {
    expect(FRAMEWORK_LABELS['mooncake-atom']).toBe('Mooncake ATOMesh¹');
  });

  it('labels the atom-disagg alias with its canonical label', () => {
    expect(FRAMEWORK_LABELS['atom-disagg']).toBe('Mooncake ATOMesh¹');
  });
});

describe('MODEL_SPEC_METHOD_LABELS', () => {
  it('maps MiniMax-M3 mtp to "M3 EAGLE"', () => {
    expect(MODEL_SPEC_METHOD_LABELS['MiniMax-M3']?.mtp).toBe('M3 EAGLE');
  });
});

describe('resolveFrameworkPartLabel', () => {
  it('renders M3 mtp as "M3 EAGLE"', () => {
    expect(resolveFrameworkPartLabel('MiniMax-M3', 'mtp')).toBe('M3 EAGLE');
  });

  it('keeps the generic MTP label for other models', () => {
    expect(resolveFrameworkPartLabel('DeepSeek-R1-0528', 'mtp')).toBe('MTP');
  });

  it('keeps the generic MTP label when no model is provided', () => {
    expect(resolveFrameworkPartLabel(undefined, 'mtp')).toBe('MTP');
  });

  it('falls back to FRAMEWORK_LABELS for non-overridden parts even for M3', () => {
    expect(resolveFrameworkPartLabel('MiniMax-M3', 'vllm')).toBe('vLLM');
  });

  it('uppercases unknown tokens', () => {
    expect(resolveFrameworkPartLabel('MiniMax-M3', 'foo')).toBe('FOO');
  });
});

describe('FRAMEWORK_ALIASES', () => {
  it('maps sglang-disagg to mori-sglang with disagg=true', () => {
    expect(FRAMEWORK_ALIASES['sglang-disagg']).toEqual({ canonical: 'mori-sglang', disagg: true });
  });

  it('maps atom-disagg to mooncake-atom with disagg=true', () => {
    expect(FRAMEWORK_ALIASES['atom-disagg']).toEqual({ canonical: 'mooncake-atom', disagg: true });
  });

  it('maps trtllm to trt', () => {
    expect(FRAMEWORK_ALIASES['trtllm']).toEqual({ canonical: 'trt' });
  });

  it('maps dynamo-trtllm to dynamo-trt', () => {
    expect(FRAMEWORK_ALIASES['dynamo-trtllm']).toEqual({ canonical: 'dynamo-trt' });
  });
});

describe('resolveFrameworkAlias', () => {
  it('resolves sglang-disagg to mori-sglang', () => {
    expect(resolveFrameworkAlias('sglang-disagg')).toBe('mori-sglang');
  });

  it('resolves dynamo-trtllm to dynamo-trt', () => {
    expect(resolveFrameworkAlias('dynamo-trtllm')).toBe('dynamo-trt');
  });

  it('resolves atom-disagg to mooncake-atom', () => {
    expect(resolveFrameworkAlias('atom-disagg')).toBe('mooncake-atom');
  });

  it('is case-insensitive', () => {
    expect(resolveFrameworkAlias('SGLANG-DISAGG')).toBe('mori-sglang');
    expect(resolveFrameworkAlias('Dynamo-TRTllm')).toBe('dynamo-trt');
  });

  it('returns input lowercased when no alias exists', () => {
    expect(resolveFrameworkAlias('sglang')).toBe('sglang');
    expect(resolveFrameworkAlias('vLLM')).toBe('vllm');
    expect(resolveFrameworkAlias('trt')).toBe('trt');
  });
});

describe('resolveFrameworkAliasesInString', () => {
  it('replaces sglang-disagg in a config key', () => {
    expect(resolveFrameworkAliasesInString('dsr1-fp8-mi355x-sglang-disagg')).toBe(
      'dsr1-fp8-mi355x-mori-sglang',
    );
  });

  it('replaces dynamo-trtllm in a config key', () => {
    expect(resolveFrameworkAliasesInString('gptoss-fp8-gb200-dynamo-trtllm')).toBe(
      'gptoss-fp8-gb200-dynamo-trt',
    );
  });

  it('replaces atom-disagg in a config key', () => {
    expect(resolveFrameworkAliasesInString('dsv4-fp4-mi355x-atom-disagg')).toBe(
      'dsv4-fp4-mi355x-mooncake-atom',
    );
  });

  it('returns string unchanged when no aliases match', () => {
    expect(resolveFrameworkAliasesInString('dsr1-fp8-h200-trt')).toBe('dsr1-fp8-h200-trt');
  });
});
