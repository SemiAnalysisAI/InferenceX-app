import { describe, it, expect, vi } from 'vitest';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import {
  formatNumber,
  updateRepoUrl,
  calculateCostsForGpus,
  calculatePowerForGpus,
  computeOutputCostFields,
  computeInputCostFields,
  filterRunsByModel,
  getFrameworkLabel,
  getHardwareLabel,
  getDisplayLabel,
} from '@/lib/utils';

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>();
  return {
    ...actual,
    getHardwareConfig: vi.fn(() => ({ label: 'H100', suffix: '' })),
    getGpuSpecs: vi.fn(() => ({ power: 700, costh: 2.8, costn: 1.4, costr: 0.7 })),
  };
});

// ---------------------------------------------------------------------------
// minimal fixture factory, only fields relevant to utils.ts tests
// ---------------------------------------------------------------------------
function pt(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2024-01-01',
    x: 1,
    y: 1,
    tp: 1,
    conc: 1,
    hwKey: 'h100',
    precision: 'fp16',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// minimal AggDataEntry factory
// ---------------------------------------------------------------------------
function aggEntry(overrides: Partial<AggDataEntry> = {}): AggDataEntry {
  return {
    hw: 'h100',
    hwKey: 'h100' as any,
    tp: 1,
    conc: 8,
    model: 'test',
    framework: '',
    precision: 'fp16',
    tput_per_gpu: 1000,
    output_tput_per_gpu: 0,
    input_tput_per_gpu: 0,
    mean_ttft: 0,
    median_ttft: 0,
    std_ttft: 0,
    p99_ttft: 0,
    mean_tpot: 0,
    median_tpot: 0,
    median_e2el: 0.5,
    mean_intvty: 0,
    median_intvty: 0,
    std_tpot: 0,
    std_intvty: 0,
    p99_tpot: 0,
    p99_intvty: 0,
    mean_itl: 0,
    median_itl: 0,
    std_itl: 0,
    p99_itl: 0,
    mtp: 'off',
    spec_decoding: 'none',
    ...overrides,
  } as AggDataEntry;
}

// ===========================================================================
// formatNumber
// ===========================================================================
describe('formatNumber', () => {
  it('returns plain string for numbers below 10000', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(9999)).toBe('9999');
  });

  it('returns comma-formatted string for numbers >= 10000', () => {
    expect(formatNumber(10000)).toBe('10,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatNumber(123456789)).toBe('123,456,789');
  });
});

// ===========================================================================
// updateRepoUrl
// ===========================================================================
describe('updateRepoUrl', () => {
  it('replaces the old InferenceMAX repo URL with the new InferenceX URL', () => {
    const oldUrl = 'https://github.com/InferenceMAX/InferenceMAX/pull/42';
    expect(updateRepoUrl(oldUrl)).toBe('https://github.com/SemiAnalysisAI/InferenceX/pull/42');
  });

  it('replaces all occurrences in a string', () => {
    const input =
      'https://github.com/InferenceMAX/InferenceMAX/pull/1 and https://github.com/InferenceMAX/InferenceMAX/pull/2';
    const result = updateRepoUrl(input);
    expect(result).toBe(
      'https://github.com/SemiAnalysisAI/InferenceX/pull/1 and https://github.com/SemiAnalysisAI/InferenceX/pull/2',
    );
  });

  it('handles http:// as well as https://', () => {
    const oldUrl = 'http://github.com/InferenceMAX/InferenceMAX/issues/7';
    expect(updateRepoUrl(oldUrl)).toBe('https://github.com/SemiAnalysisAI/InferenceX/issues/7');
  });

  it('leaves unrelated URLs unchanged', () => {
    const url = 'https://github.com/someother/repo/pull/1';
    expect(updateRepoUrl(url)).toBe(url);
  });

  it('returns an empty string unchanged', () => {
    expect(updateRepoUrl('')).toBe('');
  });
});

// ===========================================================================
// calculateCostsForGpus
// costh=2.8, costn=1.4, costr=0.7 (from mock, but this fn uses userCosts arg)
// ===========================================================================
describe('calculateCostsForGpus', () => {
  it('computes cost correctly: tpPerGpu=1000, userCost=$5/hr → 1.389', () => {
    // tokensPerHour = (1000 * 3600) / 1_000_000 = 3.6
    // costPerMillion = 5 / 3.6 = 1.388... → 1.389
    const data = [pt({ hwKey: 'h100' as any, tpPerGpu: { y: 1000, roof: false } })];
    const result = calculateCostsForGpus(data, { h100: 5 });
    expect(result[0].costUser?.y).toBe(1.389);
    expect(result[0].y).toBe(1.389);
    expect(result[0].costUser?.roof).toBe(false);
  });

  it('computes cost correctly: tpPerGpu=1000, userCost=$3/hr → 0.833', () => {
    // costPerMillion = 3 / 3.6 = 0.833...
    const data = [pt({ hwKey: 'h100' as any, tpPerGpu: { y: 1000, roof: false } })];
    const result = calculateCostsForGpus(data, { h100: 3 });
    expect(result[0].costUser?.y).toBe(0.833);
    expect(result[0].y).toBe(0.833);
  });

  it('returns item unchanged when no user cost is provided for that GPU', () => {
    const item = pt({ hwKey: 'h100' as any });
    const result = calculateCostsForGpus([item], { a100: 5 });
    expect(result[0]).toBe(item);
    expect(result[0].costUser).toBeUndefined();
  });

  it('inherits cost from base GPU key for prefixed hardware (e.g. h100_trt → h100)', () => {
    const data = [pt({ hwKey: 'h100_trt' as any, tpPerGpu: { y: 1000, roof: false } })];
    const result = calculateCostsForGpus(data, { h100: 5 });
    expect(result[0].costUser?.y).toBe(1.389);
  });

  it('processes multiple items independently', () => {
    const data = [
      pt({ hwKey: 'h100' as any, tpPerGpu: { y: 1000, roof: false } }),
      pt({ hwKey: 'a100' as any, tpPerGpu: { y: 2000, roof: false } }),
    ];
    const result = calculateCostsForGpus(data, { h100: 5, a100: 5 });
    // h100: 5/3.6 = 1.389
    expect(result[0].costUser?.y).toBe(1.389);
    // a100: tokensPerHour=(2000*3600)/1e6=7.2; cost=5/7.2=0.694
    expect(result[1].costUser?.y).toBe(0.694);
  });
});

// ===========================================================================
// calculatePowerForGpus
// mock: getHardwareConfig → { power: 700, ... }
// ===========================================================================
describe('calculatePowerForGpus', () => {
  it('computes power correctly: tpPerMw=50, basePower=700, userPower=700 → 50.0', () => {
    // (50 / 700) * 700 = 50.0
    const data = [pt({ hwKey: 'h100' as any, tpPerMw: { y: 50, roof: false } })];
    const result = calculatePowerForGpus(data, { h100: 700 });
    expect(result[0].powerUser?.y).toBe(50.0);
    expect(result[0].y).toBe(50.0);
    expect(result[0].powerUser?.roof).toBe(false);
  });

  it('computes power correctly: tpPerMw=50, basePower=700, userPower=350 → 25.0', () => {
    // (50 / 700) * 350 = 25.0
    const data = [pt({ hwKey: 'h100' as any, tpPerMw: { y: 50, roof: false } })];
    const result = calculatePowerForGpus(data, { h100: 350 });
    expect(result[0].powerUser?.y).toBe(25.0);
    expect(result[0].y).toBe(25.0);
  });

  it('returns item unchanged when no user power is provided for that GPU', () => {
    const item = pt({ hwKey: 'h100' as any });
    const result = calculatePowerForGpus([item], { a100: 700 });
    expect(result[0]).toBe(item);
    expect(result[0].powerUser).toBeUndefined();
  });

  it('inherits power from base GPU key for prefixed hardware (e.g. h100_mtp → h100)', () => {
    const data = [pt({ hwKey: 'h100_mtp' as any, tpPerMw: { y: 50, roof: false } })];
    const result = calculatePowerForGpus(data, { h100: 700 });
    expect(result[0].powerUser?.y).toBe(50.0);
  });
});

// ===========================================================================
// computeOutputCostFields
// mock: getHardwareConfig → { costh: 2.8, costn: 1.4, costr: 0.7 }
// ===========================================================================
describe('computeOutputCostFields', () => {
  it('skips computation when all output cost fields already exist', () => {
    const existing = {
      costhOutput: { y: 99, roof: false },
      costnOutput: { y: 99, roof: false },
      costrOutput: { y: 99, roof: false },
    };
    const item = pt(existing);
    const result = computeOutputCostFields([item]);
    expect(result[0].costhOutput?.y).toBe(99);
    expect(result[0].costnOutput?.y).toBe(99);
    expect(result[0].costrOutput?.y).toBe(99);
  });

  it('computes output cost fields from outputTputPerGpu when provided: tput=1000', () => {
    // outputTokensPerHour = (1000 * 3600) / 1_000_000 = 3.6
    // costhOutput = 2.8 / 3.6 = 0.778, costnOutput = 1.4/3.6 = 0.389, costrOutput = 0.7/3.6 = 0.194
    const item = pt({
      outputTputPerGpu: { y: 1000, roof: false },
    });
    const result = computeOutputCostFields([item]);
    expect(result[0].costhOutput?.y).toBe(0.778);
    expect(result[0].costnOutput?.y).toBe(0.389);
    expect(result[0].costrOutput?.y).toBe(0.194);
    expect(result[0].costhOutput?.roof).toBe(false);
  });

  it('falls back to tpPerGpu * 0.875 when outputTputPerGpu is absent: tpPerGpu=1000', () => {
    // fallback tput = 1000 * 0.875 = 875
    // outputTokensPerHour = (875 * 3600) / 1_000_000 = 3.15
    // costhOutput = 2.8/3.15 = 0.889, costnOutput = 1.4/3.15 = 0.444, costrOutput = 0.7/3.15 = 0.222
    const item = pt({ tpPerGpu: { y: 1000, roof: false } });
    const result = computeOutputCostFields([item]);
    expect(result[0].costhOutput?.y).toBe(0.889);
    expect(result[0].costnOutput?.y).toBe(0.444);
    expect(result[0].costrOutput?.y).toBe(0.222);
  });

  it('does not overwrite an existing costhOutput field (partial override)', () => {
    const item = pt({
      costhOutput: { y: 42, roof: false },
      // costnOutput and costrOutput are absent — early return won't fire
    });
    const result = computeOutputCostFields([item]);
    // costhOutput already existed → kept as 42
    expect(result[0].costhOutput?.y).toBe(42);
    // costnOutput was absent → computed
    expect(result[0].costnOutput?.y).toBe(0.444);
  });

  it('returns an empty array for empty input', () => {
    expect(computeOutputCostFields([])).toEqual([]);
  });
});

// ===========================================================================
// computeInputCostFields
// mock: getHardwareConfig → { costh: 2.8, costn: 1.4, costr: 0.7 }
// costhi/costni/costri are REQUIRED in InferenceData, so a valid fixture
// always triggers the early-return. use `undefined as any` to reach compute path.
// ===========================================================================
describe('computeInputCostFields', () => {
  it('skips computation when all input cost fields already exist', () => {
    const item = pt({
      costhi: { y: 99, roof: false },
      costni: { y: 99, roof: false },
      costri: { y: 99, roof: false },
    });
    const result = computeInputCostFields([item]);
    expect(result[0].costhi?.y).toBe(99);
    expect(result[0].costni?.y).toBe(99);
    expect(result[0].costri?.y).toBe(99);
  });

  it('computes input cost fields from inputTputPerGpu when provided: tput=200', () => {
    // inputTokensPerHour = (200 * 3600) / 1_000_000 = 0.72
    // costhi = 2.8/0.72 = 3.889, costni = 1.4/0.72 = 1.944, costri = 0.7/0.72 = 0.972
    const item = pt({
      costhi: undefined as any,
      costni: undefined as any,
      costri: undefined as any,
      inputTputPerGpu: { y: 200, roof: false },
    });
    const result = computeInputCostFields([item]);
    expect(result[0].costhi?.y).toBe(3.889);
    expect(result[0].costni?.y).toBe(1.944);
    expect(result[0].costri?.y).toBe(0.972);
    expect(result[0].costhi?.roof).toBe(false);
  });

  it('falls back to tpPerGpu * 0.125 when inputTputPerGpu is absent: tpPerGpu=1000', () => {
    // fallback tput = 1000 * 0.125 = 125
    // inputTokensPerHour = (125 * 3600) / 1_000_000 = 0.45
    // costhi = 2.8/0.45 = 6.222, costni = 1.4/0.45 = 3.111, costri = 0.7/0.45 = 1.556
    const item = pt({
      costhi: undefined as any,
      costni: undefined as any,
      costri: undefined as any,
      tpPerGpu: { y: 1000, roof: false },
    });
    const result = computeInputCostFields([item]);
    expect(result[0].costhi?.y).toBe(6.222);
    expect(result[0].costni?.y).toBe(3.111);
    expect(result[0].costri?.y).toBe(1.556);
  });

  it('does not overwrite an existing costhi field (partial override)', () => {
    const item = pt({
      costhi: { y: 77, roof: false },
      costni: undefined as any,
      costri: undefined as any,
    });
    const result = computeInputCostFields([item]);
    // costhi already existed → kept as 77
    expect(result[0].costhi?.y).toBe(77);
    // costni was absent → computed (fallback: tpPerGpu=1000)
    expect(result[0].costni?.y).toBe(3.111);
  });

  it('returns an empty array for empty input', () => {
    expect(computeInputCostFields([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterRunsByModel
// ---------------------------------------------------------------------------
describe('filterRunsByModel', () => {
  function makeRun(configKeys: string[][], overrides: Record<string, any> = {}) {
    return {
      runId: '123',
      runDate: '2025-12-15',
      runUrl: 'https://github.com/example',
      conclusion: 'success' as string | null,
      changelog: {
        base_ref: 'abc',
        head_ref: 'def',
        entries: configKeys.map((keys) => ({
          config_keys: keys,
          description: 'test entry',
          pr_link: null,
        })),
      },
      ...overrides,
    };
  }

  it('returns null when availableRuns is null', () => {
    expect(filterRunsByModel(null, ['gptoss'])).toBeNull();
  });

  it('returns availableRuns unchanged when modelPrefixes is empty', () => {
    const runs = { '123': makeRun([['gptoss-fp8-h200-trt']]) };
    expect(filterRunsByModel(runs, [])).toBe(runs);
  });

  it('returns runs without changelogs when no model prefix matches', () => {
    const runs = { '123': makeRun([['dsr1-fp8-h200-trt']]) };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog).toBeUndefined();
  });

  it('keeps runs with matching model prefix', () => {
    const runs = { '123': makeRun([['gptoss-fp8-h200-trt']]) };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result).not.toBeNull();
    expect(result!['123']).toBeDefined();
  });

  it('filters changelog entries to only those matching the model prefix', () => {
    const runs = {
      '123': makeRun([['gptoss-fp8-h200-trt'], ['dsr1-fp8-h200-trt']]),
    };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result!['123'].changelog!.entries).toHaveLength(1);
    expect(result!['123'].changelog!.entries[0].config_keys).toEqual(['gptoss-fp8-h200-trt']);
  });

  it('returns runs without changelogs when no runs have changelog', () => {
    const runs = {
      '123': {
        runId: '123',
        runDate: '2025-12-15',
        runUrl: 'https://github.com',
        conclusion: null as string | null,
      },
    };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog).toBeUndefined();
  });

  it('returns runs without changelogs when no runs match model filter', () => {
    const runs = {
      '123': makeRun([['dsr1-fp8-h200-trt']]),
      '456': makeRun([['dsr1-fp8-b200-sglang']]),
    };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(2);
    expect(result!['123'].changelog).toBeUndefined();
    expect(result!['456'].changelog).toBeUndefined();
  });

  it('keeps multiple runs that all match', () => {
    const runs = {
      '123': makeRun([['gptoss-fp8-h200-trt']]),
      '456': makeRun([['gptoss-fp8-b200-sglang']]),
    };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(Object.keys(result!)).toHaveLength(2);
  });

  it('matches a run with multiple config-keys where only some match', () => {
    const runs = {
      '123': makeRun([['gptoss-fp8-h200-trt', 'dsr1-fp8-h200-trt']]),
    };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog!.entries).toHaveLength(1);
  });

  it('preserves non-changelog run fields unchanged', () => {
    const run = makeRun([['gptoss-fp8-h200-trt']]);
    const runs = { '123': run };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result!['123'].runId).toBe('123');
    expect(result!['123'].runUrl).toBe('https://github.com/example');
  });

  // Precision filtering
  it('returns runs without changelogs when no entries match precision', () => {
    const runs = { '123': makeRun([['gptoss-fp4-h200-trt']]) };
    const result = filterRunsByModel(runs, ['gptoss'], ['fp8']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog).toBeUndefined();
  });

  it('keeps run when entry matches both model and selected precision', () => {
    const runs = { '123': makeRun([['gptoss-fp8-h200-trt']]) };
    const result = filterRunsByModel(runs, ['gptoss'], ['fp8']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog!.entries).toHaveLength(1);
  });

  it('keeps entries matching any of multiple selected precisions', () => {
    const runs = {
      '123': makeRun([['gptoss-fp4-h200-trt'], ['gptoss-fp8-h200-trt'], ['gptoss-bf16-h200-trt']]),
    };
    const result = filterRunsByModel(runs, ['gptoss'], ['fp4', 'fp8']);
    expect(result!['123'].changelog!.entries).toHaveLength(2);
  });

  it('filters out entries not matching the selected precision', () => {
    const runs = {
      '123': makeRun([['gptoss-fp4-h200-trt'], ['gptoss-fp8-h200-trt']]),
    };
    const result = filterRunsByModel(runs, ['gptoss'], ['fp8']);
    expect(result!['123'].changelog!.entries).toHaveLength(1);
    expect(result!['123'].changelog!.entries[0].config_keys).toEqual(['gptoss-fp8-h200-trt']);
  });

  it('falls back to model-only filtering when selectedPrecisions is empty', () => {
    const runs = { '123': makeRun([['gptoss-fp4-h200-trt']]) };
    const result = filterRunsByModel(runs, ['gptoss'], []);
    expect(result).not.toBeNull();
  });

  it('falls back to model-only filtering when selectedPrecisions is omitted', () => {
    const runs = { '123': makeRun([['gptoss-fp4-h200-trt']]) };
    const result = filterRunsByModel(runs, ['gptoss']);
    expect(result).not.toBeNull();
  });

  it('filters by GPU when selectedGPUs is provided', () => {
    const runs = {
      '123': makeRun([['dsr1-fp8-h200-trt'], ['dsr1-fp8-mi355x-mori-sglang']]),
    };
    const result = filterRunsByModel(runs, ['dsr1'], ['fp8'], ['h200_trt']);
    expect(result!['123'].changelog!.entries).toHaveLength(1);
    expect(result!['123'].changelog!.entries[0].config_keys).toEqual(['dsr1-fp8-h200-trt']);
  });

  it('GPU filter converts hwKey underscores to dashes for matching', () => {
    const runs = {
      '123': makeRun([['dsr1-fp8-mi355x-mori-sglang-mtp']]),
    };
    // hwKey 'mi355x_mori-sglang_mtp' → config suffix 'mi355x-mori-sglang-mtp'
    const result = filterRunsByModel(runs, ['dsr1'], ['fp8'], ['mi355x_mori-sglang_mtp']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog!.entries[0].config_keys).toEqual([
      'dsr1-fp8-mi355x-mori-sglang-mtp',
    ]);
  });

  it('GPU filter: returns runs without changelogs when non-MTP entry excluded by MTP GPU', () => {
    const runs = {
      '123': makeRun([['dsr1-fp8-mi355x-mori-sglang']]),
    };
    const result = filterRunsByModel(runs, ['dsr1'], ['fp8'], ['mi355x_mori-sglang_mtp']);
    expect(result).not.toBeNull();
    expect(result!['123'].changelog).toBeUndefined();
  });

  it('GPU filter: falls back to no GPU filter when selectedGPUs is empty', () => {
    const runs = {
      '123': makeRun([['dsr1-fp8-mi355x-mori-sglang'], ['dsr1-fp8-h200-trt']]),
    };
    const result = filterRunsByModel(runs, ['dsr1'], ['fp8'], []);
    expect(result!['123'].changelog!.entries).toHaveLength(2);
  });
});

// ===========================================================================
// getFrameworkLabel
// ===========================================================================
describe('getFrameworkLabel', () => {
  it('maps "trt" to "TRT"', () => {
    expect(getFrameworkLabel('trt')).toBe('TRT');
  });

  it('maps "vllm" to "vLLM"', () => {
    expect(getFrameworkLabel('vllm')).toBe('vLLM');
  });

  it('maps "sglang" to "SGLang"', () => {
    expect(getFrameworkLabel('sglang')).toBe('SGLang');
  });

  it('maps "dynamo-sglang" to "Dynamo SGLang"', () => {
    expect(getFrameworkLabel('dynamo-sglang')).toBe('Dynamo SGLang');
  });

  it('maps "dynamo-trtllm" to "Dynamo TRT"', () => {
    expect(getFrameworkLabel('dynamo-trtllm')).toBe('Dynamo TRT');
  });

  it('maps "dynamo-trt" to "Dynamo TRT"', () => {
    expect(getFrameworkLabel('dynamo-trt')).toBe('Dynamo TRT');
  });

  it('maps "mori-sglang" to "MoRI SGLang"', () => {
    expect(getFrameworkLabel('mori-sglang')).toBe('MoRI SGLang');
  });

  it('maps "atom" to its label string', () => {
    expect(getFrameworkLabel('atom')).toBe('ATOM¹');
  });

  it('maps "mtp" to "MTP"', () => {
    expect(getFrameworkLabel('mtp')).toBe('MTP');
  });

  it('falls back to uppercased hyphen-split for unknown framework', () => {
    expect(getFrameworkLabel('custom-engine')).toBe('CUSTOM ENGINE');
  });

  it('falls back to uppercased for single-word unknown framework', () => {
    expect(getFrameworkLabel('tensorrt')).toBe('TENSORRT');
  });

  it('falls back to uppercased hyphen-split for multi-word unknown framework', () => {
    expect(getFrameworkLabel('my-custom-engine')).toBe('MY CUSTOM ENGINE');
  });

  it('uppercases single-word unknown framework (newengine)', () => {
    expect(getFrameworkLabel('newengine')).toBe('NEWENGINE');
  });

  it('handles empty string', () => {
    expect(getFrameworkLabel('')).toBe('');
  });
});

// ===========================================================================
// getHardwareLabel
// ===========================================================================
describe('getHardwareLabel', () => {
  it('returns uppercased base hardware when no suffixes', () => {
    const entry = aggEntry({ hw: 'h100' });
    expect(getHardwareLabel(entry)).toBe('H100');
  });

  it('returns uppercased base hw from hyphenated hw field (sxm)', () => {
    expect(getHardwareLabel(aggEntry({ hw: 'h100-sxm' }))).toBe('H100');
  });

  it('extracts base hardware from hyphenated hw field (sxm5)', () => {
    const entry = aggEntry({ hw: 'h100-sxm5' });
    expect(getHardwareLabel(entry)).toBe('H100');
  });

  it('appends framework suffix (TRT)', () => {
    const entry = aggEntry({ hw: 'h100', framework: 'trt' });
    expect(getHardwareLabel(entry)).toBe('H100 (TRT)');
  });

  it('appends framework suffix (vLLM)', () => {
    expect(getHardwareLabel(aggEntry({ hw: 'h100', framework: 'vllm' }))).toBe('H100 (vLLM)');
  });

  it('appends mtp suffix when mtp is on', () => {
    const entry = aggEntry({ hw: 'h100', mtp: 'on' });
    expect(getHardwareLabel(entry)).toBe('H100 (MTP)');
  });

  it('appends framework and mtp suffixes together', () => {
    const entry = aggEntry({ hw: 'h100', framework: 'trt', mtp: 'on' });
    expect(getHardwareLabel(entry)).toBe('H100 (TRT, MTP)');
  });

  it('appends spec_decoding suffix when not "none"', () => {
    const entry = aggEntry({ hw: 'h100', spec_decoding: 'eagle' });
    expect(getHardwareLabel(entry)).toBe('H100 (EAGLE)');
  });

  it('does not append spec_decoding when it is "none"', () => {
    const entry = aggEntry({ hw: 'h100', spec_decoding: 'none' });
    expect(getHardwareLabel(entry)).toBe('H100');
  });

  it('deduplicates mtp framework with mtp flag', () => {
    const entry = aggEntry({ hw: 'h100', framework: 'mtp', mtp: 'on' });
    expect(getHardwareLabel(entry)).toBe('H100 (MTP)');
  });

  it('deduplicates mtp framework, mtp flag, and mtp spec_decoding', () => {
    const entry = aggEntry({ hw: 'h100', framework: 'mtp', mtp: 'on', spec_decoding: 'mtp' });
    expect(getHardwareLabel(entry)).toBe('H100 (MTP)');
  });

  it('handles all suffixes combined', () => {
    const entry = aggEntry({ hw: 'b200', framework: 'trt', mtp: 'on', spec_decoding: 'eagle' });
    expect(getHardwareLabel(entry)).toBe('B200 (TRT, MTP, EAGLE)');
  });

  it('combines framework and spec_decoding in suffix', () => {
    const entry = aggEntry({ hw: 'h100', framework: 'trt', spec_decoding: 'eagle' });
    expect(getHardwareLabel(entry)).toBe('H100 (TRT, EAGLE)');
  });

  it('uppercases the base hw part (b200-nvl)', () => {
    expect(getHardwareLabel(aggEntry({ hw: 'b200-nvl' }))).toBe('B200');
  });

  it('handles hw without dashes', () => {
    expect(getHardwareLabel(aggEntry({ hw: 'gb200' }))).toBe('GB200');
  });
});

// ===========================================================================
// getDisplayLabel
// ===========================================================================
describe('getDisplayLabel', () => {
  it('combines label and suffix', () => {
    expect(getDisplayLabel({ label: 'H100', suffix: '(vLLM)' })).toBe('H100 (vLLM)');
  });

  it('returns label only when suffix is empty string', () => {
    expect(getDisplayLabel({ label: 'H100', suffix: '' })).toBe('H100');
  });

  it('returns label only when suffix is undefined', () => {
    expect(getDisplayLabel({ label: 'H100' })).toBe('H100');
  });

  it('combines label with complex suffix', () => {
    expect(getDisplayLabel({ label: 'B200', suffix: '(Dynamo TRT, MTP)' })).toBe(
      'B200 (Dynamo TRT, MTP)',
    );
  });
});
