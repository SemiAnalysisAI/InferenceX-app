import { describe, expect, it } from 'vitest';

import {
  FRAMEWORK_ALIASES,
  resolveFrameworkAlias,
  resolveFrameworkAliasesInString,
} from './framework-aliases';

describe('FRAMEWORK_ALIASES', () => {
  it('maps sglang-disagg to mori-sglang with disagg=true', () => {
    expect(FRAMEWORK_ALIASES['sglang-disagg']).toEqual({ canonical: 'mori-sglang', disagg: true });
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

  it('returns string unchanged when no aliases match', () => {
    expect(resolveFrameworkAliasesInString('dsr1-fp8-h200-trt')).toBe('dsr1-fp8-h200-trt');
  });
});
