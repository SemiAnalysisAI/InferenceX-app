import { describe, expect, it } from 'vitest';

import type { RunConfigRow } from '@/lib/api';

import {
  changelogConfigToHwKey,
  configKeyMatchesHwKey,
  formatConfigKeys,
  resolveChangelogHwKeys,
} from './changelogFormatters';

const kimiH200MtpConfig: RunConfigRow = {
  github_run_id: 30781313910,
  run_started_at: '2026-08-04T14:00:18Z',
  html_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/30781313910',
  head_sha: '114c1bd140ba75e082100ad11f34e3cf0adf9e3d',
  model: 'kimik3',
  precision: 'fp4',
  hardware: 'h200',
  framework: 'vllm',
  spec_method: 'mtp',
  disagg: false,
};

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

  it('derives MTP from the benchmark config when the changelog key omits it', () => {
    expect(formatConfigKeys('kimik3-fp4-h200-vllm-agentic', [kimiH200MtpConfig])).toBe(
      'H200 (vLLM, MTP) Kimi-K3 FP4',
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

  it('matches the benchmark-derived spec method when the changelog key is incomplete', () => {
    expect(
      configKeyMatchesHwKey('kimik3-fp4-h200-vllm-agentic', 'h200_vllm_mtp', [kimiH200MtpConfig]),
    ).toBe(true);
  });
});

describe('resolveChangelogHwKeys', () => {
  it('treats run content as authoritative over a stale MTP key suffix', () => {
    expect(
      resolveChangelogHwKeys('kimik3-fp4-h200-vllm-agentic-mtp', [
        { ...kimiH200MtpConfig, spec_method: 'none' },
      ]),
    ).toEqual(['h200_vllm']);
  });

  it('falls back to the changelog key for historical runs without config coverage', () => {
    expect(resolveChangelogHwKeys('dsr1-fp8-h200-sglang-mtp')).toEqual(['h200_sglang_mtp']);
  });
});
