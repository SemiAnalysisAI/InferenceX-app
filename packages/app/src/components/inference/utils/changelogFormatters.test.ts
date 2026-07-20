import { describe, expect, it } from 'vitest';

import {
  changelogConfigToHwKey,
  configKeyMatchesHwKey,
  formatConfigKeys,
} from './changelogFormatters';

describe('formatConfigKeys', () => {
  it('formats a standard config key', () => {
    const result = formatConfigKeys('gptoss-fp8-b200-vllm');
    expect(result).toContain('B200');
    expect(result).toContain('vLLM');
    expect(result).toContain('FP8');
  });

  it('handles MTP suffix', () => {
    const result = formatConfigKeys('dsr1-fp8-h200-sglang-mtp');
    expect(result).toContain('H200');
    expect(result).toContain('MTP');
    expect(result).toContain('FP8');
  });

  it('renders M3 mtp as EAGLE (not MTP)', () => {
    const result = formatConfigKeys('minimaxm3-fp8-h100-vllm-mtp');
    expect(result).toContain('H100');
    expect(result).toContain('EAGLE');
    expect(result).not.toContain('MTP');
  });

  it('formats compound framework names', () => {
    const result = formatConfigKeys('gptoss-fp4-b200-dynamo-sglang');
    expect(result).toContain('B200');
    expect(result).toContain('FP4');
  });

  it('formats MI300X config key', () => {
    const result = formatConfigKeys('gptoss-fp8-mi300x-sglang');
    expect(result).toContain('MI300X');
    expect(result).toContain('SGLang');
    expect(result).toContain('FP8');
  });

  it('formats TRTLLM framework', () => {
    const result = formatConfigKeys('dsr1-fp4-b200-trt');
    expect(result).toContain('B200');
    expect(result).toContain('TRTLLM');
    expect(result).toContain('FP4');
  });

  it('uses the legend framework label for an agentic HiCache config', () => {
    expect(formatConfigKeys('dsv4-fp4-mi355x-mori-sglang-agentic-hicache')).toBe(
      'MI355X (MoRI SGLang) DeepSeek-V4-Pro FP4',
    );
  });
});

describe('changelogConfigToHwKey', () => {
  it('strips agentic scenario and cache-backend suffixes from the legend identity', () => {
    expect(changelogConfigToHwKey('dsv4-fp4-mi355x-mori-sglang-agentic-hicache')).toBe(
      'mi355x_mori-sglang',
    );
  });

  it('keeps a trailing MTP spec method while dropping agentic metadata', () => {
    expect(changelogConfigToHwKey('dsv4-fp4-mi355x-sglang-agentic-hicache-mtp')).toBe(
      'mi355x_sglang_mtp',
    );
  });
});

describe('configKeyMatchesHwKey', () => {
  it('matches standard key', () => {
    expect(configKeyMatchesHwKey('dsr1-fp8-h200-trt', 'h200_trt')).toBe(true);
  });

  it('matches compound framework', () => {
    expect(configKeyMatchesHwKey('dsr1-fp8-mi355x-mori-sglang-mtp', 'mi355x_mori-sglang_mtp')).toBe(
      true,
    );
  });

  it('rejects non-matching GPU', () => {
    expect(configKeyMatchesHwKey('dsr1-fp8-h200-trt', 'b200_trt')).toBe(false);
  });

  it('rejects MTP vs non-MTP mismatch', () => {
    expect(configKeyMatchesHwKey('dsr1-fp8-h200-trt', 'h200_trt_mtp')).toBe(false);
  });

  it('matches old sglang-disagg keys to mori-sglang hwKey', () => {
    expect(configKeyMatchesHwKey('dsr1-fp8-mi355x-sglang-disagg', 'mi355x_mori-sglang')).toBe(true);
  });

  it('matches an agentic HiCache changelog key to the framework-only legend key', () => {
    expect(
      configKeyMatchesHwKey('dsv4-fp4-mi355x-mori-sglang-agentic-hicache', 'mi355x_mori-sglang'),
    ).toBe(true);
  });

  it('matches sglang framework', () => {
    expect(configKeyMatchesHwKey('gptoss-fp8-mi300x-sglang', 'mi300x_sglang')).toBe(true);
  });

  it('matches dynamo-sglang compound framework', () => {
    expect(configKeyMatchesHwKey('gptoss-fp4-b200-dynamo-sglang', 'b200_dynamo-sglang')).toBe(true);
  });

  it('rejects completely different framework', () => {
    expect(configKeyMatchesHwKey('dsr1-fp8-h200-sglang', 'h200_trt')).toBe(false);
  });
});
