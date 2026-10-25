import { describe, expect, it } from 'vitest';

import { Model, Sequence } from '@/lib/catalog/data-mappings';

import {
  AGE_MAX_RED_DAYS,
  AGENTX_MAX_AGE_DAYS,
  ageColorStyle,
  ageRowStyle,
  baseFramework,
  daysSince,
  earliestSubmission,
  firstSubmissionDates,
  getActualLatestRelease,
  getCurrentImageNodeTypeTooltip,
  imageRowDisplayModel,
  imageRowModel,
  imageRowSequence,
  isActiveImageRow,
  isOutdated,
  isStaleAgentx,
  nightlyCommit,
  resolveSelectedSequence,
  sequenceOptionsForModel,
} from './latest-image-utils';

const lightnessOf = (s: string) =>
  Number(s.match(/oklch\((?<lightness>[\d.]+)/u)?.groups?.lightness ?? Number.NaN);
const alphaOf = (s: string) =>
  Number(s.match(/\/ (?<alpha>[\d.]+)\)/u)?.groups?.alpha ?? Number.NaN);

describe('daysSince', () => {
  it('returns 0 for today', () => {
    const today = new Date('2026-05-27T12:34:56Z');
    expect(daysSince('2026-05-27', today)).toBe(0);
  });

  it('returns whole days for dates strictly in the past', () => {
    const today = new Date('2026-05-27T00:00:00Z');
    expect(daysSince('2026-05-26', today)).toBe(1);
    expect(daysSince('2026-05-20', today)).toBe(7);
    expect(daysSince('2026-03-28', today)).toBe(60);
  });

  it('floors to whole days regardless of intraday hour offset', () => {
    const today = new Date('2026-05-28T00:01:00Z');
    expect(daysSince('2026-05-27', today)).toBe(1);
    const lateToday = new Date('2026-05-28T23:59:00Z');
    expect(daysSince('2026-05-27', lateToday)).toBe(1);
  });

  it('clamps at 0 for future-dated submissions (never returns negative)', () => {
    const today = new Date('2026-05-27T00:00:00Z');
    expect(daysSince('2026-06-01', today)).toBe(0);
  });
});

describe('isStaleAgentx', () => {
  it('flags agentic rows strictly older than the two-week budget', () => {
    expect(isStaleAgentx('agentic_traces', AGENTX_MAX_AGE_DAYS + 1)).toBe(true);
    expect(isStaleAgentx('agentic_traces', 60)).toBe(true);
  });

  it('keeps agentic rows at or under two weeks fresh', () => {
    expect(isStaleAgentx('agentic_traces', 0)).toBe(false);
    expect(isStaleAgentx('agentic_traces', AGENTX_MAX_AGE_DAYS)).toBe(false);
  });

  it('never flags fixed-sequence rows regardless of age', () => {
    expect(isStaleAgentx('single_turn', 365)).toBe(false);
  });
});

describe('ageColorStyle', () => {
  it('returns undefined for 0-day rows so the muted-foreground class wins', () => {
    expect(ageColorStyle(0)).toBeUndefined();
  });

  it('returns an oklch color for 1d and ramps toward darker red at AGE_MAX_RED_DAYS', () => {
    const oneDay = ageColorStyle(1);
    const maxDay = ageColorStyle(AGE_MAX_RED_DAYS);
    expect(oneDay?.color).toMatch(/^oklch\(/u);
    expect(maxDay?.color).toMatch(/^oklch\(/u);
    expect(lightnessOf(maxDay!.color as string)).toBeLessThan(lightnessOf(oneDay!.color as string));
  });

  it('clamps anything past AGE_MAX_RED_DAYS to the same color (no extrapolation past the ramp)', () => {
    const at60 = ageColorStyle(AGE_MAX_RED_DAYS);
    const at365 = ageColorStyle(365);
    expect(at60).toEqual(at365);
  });
});

describe('ageRowStyle', () => {
  it('returns undefined for 0-day rows', () => {
    expect(ageRowStyle(0)).toBeUndefined();
  });

  it('returns a low-alpha oklch background that ramps from ~0.04 to ~0.28', () => {
    const oneDay = ageRowStyle(1);
    const maxDay = ageRowStyle(AGE_MAX_RED_DAYS);
    const a1 = alphaOf(oneDay!.backgroundColor as string);
    const aMax = alphaOf(maxDay!.backgroundColor as string);
    expect(a1).toBeGreaterThan(0);
    expect(a1).toBeLessThan(0.1);
    expect(aMax).toBeGreaterThan(0.2);
    expect(aMax).toBeLessThanOrEqual(0.3);
  });

  it('clamps past AGE_MAX_RED_DAYS so a 1y-old row looks identical to a 60d row', () => {
    expect(ageRowStyle(AGE_MAX_RED_DAYS)).toEqual(ageRowStyle(365));
  });
});

describe('isOutdated', () => {
  const sglang = { tag: 'v0.5.22', publishedAt: '2026-10-10T08:00:00Z', commits: {} };
  const vllm = { tag: 'v0.32.0', publishedAt: '2026-10-01T00:00:00Z', commits: {} };

  it('compares versioned tags numerically, not by substring', () => {
    expect(isOutdated('lmsysorg/sglang:v0.5.22-cu130', sglang, '2026-10-20')).toBe(false);
    expect(isOutdated('lmsysorg/sglang:v0.5.2-cu130', sglang, '2026-10-20')).toBe(true);
    expect(isOutdated('lmsysorg/sglang:v0.5.19-cu130', sglang, '2026-10-20')).toBe(true);
    expect(isOutdated('lmsysorg/sglang:v0.5.23', sglang, '2026-10-20')).toBe(false);
    expect(isOutdated('lmsysorg/sglang:v0.5.22.post1', sglang, '2026-10-20')).toBe(false);
  });

  it('treats current ROCm and sgl-dev builds by their version', () => {
    expect(
      isOutdated('lmsysorg/sglang-rocm:v0.5.22-rocm720-mi35x-20261019', sglang, '2026-10-20'),
    ).toBe(false);
    expect(
      isOutdated('lmsysorg/sglang-rocm:v0.5.20-rocm720-mi35x-20260929', sglang, '2026-10-20'),
    ).toBe(true);
    expect(
      isOutdated('rocm/sgl-dev:sglang-0.5.9-rocm720-mi35x-mori-0227-2', sglang, '2026-10-20'),
    ).toBe(true);
  });

  it('ignores CUDA versions and digests when reading a version', () => {
    expect(
      isOutdated('vllm/vllm-openai:nightly-dev-x86_64-cu13.0.1-5894fdf', vllm, '2026-10-02'),
    ).toBe(false);
    expect(isOutdated('vllm/vllm-openai:v0.32.0@sha256:1.2.3', vllm, '2026-10-02')).toBe(false);
  });

  it('compares a dated nightly by its build date against the release date', () => {
    const old = 'lmsysorg/sglang:nightly-dev-cu13-20260914-4358a161';
    const fresh = 'lmsysorg/sglang:nightly-dev-cu13-20261010-4358a161';
    expect(isOutdated(old, sglang, '2026-10-20')).toBe(true);
    expect(isOutdated(fresh, sglang, '2026-10-20')).toBe(false);
  });

  it('bounds an unresolved undated nightly by its submission date', () => {
    const image = 'vllm/vllm-openai:nightly-ac7509e2b1db40fec2f03dde1ed4e9dfdc2338c9@sha256:98ad';
    expect(isOutdated(image, vllm, '2026-09-30')).toBe(true);
    expect(isOutdated(image, vllm, '2026-10-01')).toBe(false);
  });

  it('uses commit ancestry over dates when GitHub resolved the commit', () => {
    const release = {
      ...vllm,
      commits: { af7f9488: 'behind', e68efc68: 'diverged', '83c078d9': 'ahead' } as const,
    };
    expect(isOutdated('vllm/vllm-openai:nightly-af7f9488', release, '2026-10-23')).toBe(true);
    expect(isOutdated('vllm/vllm-openai:nightly-e68efc68', release, '2026-09-01')).toBe(false);
    expect(isOutdated('lmsysorg/sglang:nightly-dev-20260901-83c078d9', release, '2026-09-02')).toBe(
      false,
    );
  });

  it('does not flag custom tags or frameworks without a release stream', () => {
    expect(isOutdated('lmsysorg/sglang:qwen38flashnext', sglang, '2026-01-01')).toBe(false);
    expect(isOutdated('rocm/atom-dev:nightly_202609211553', null, '2026-09-22')).toBe(false);
  });
});

describe('baseFramework', () => {
  it('collapses llmd-vllm into the vLLM engine family', () => {
    expect(baseFramework('llmd-vllm')).toBe('vllm');
  });

  it.each([
    ['dynamo-vllm', 'vllm'],
    ['mori-sglang', 'sglang'],
    ['atom', 'atom'],
    ['vllm', 'vllm'],
  ])('maps %s to the %s engine family', (framework, expected) => {
    expect(baseFramework(framework)).toBe(expected);
  });
});

describe('nightlyCommit', () => {
  it.each([
    [
      'vllm/vllm-openai:nightly-af7f9488c2210d67e1033ecdc845b087ee7fe92b@sha256:8e2f',
      'af7f9488c2210d67e1033ecdc845b087ee7fe92b',
    ],
    ['vllm/vllm-openai:nightly-dev-arm64-cu130-ac9126e58aa7', 'ac9126e58aa7'],
    ['vllm/vllm-openai:nightly-dev-x86_64-cu13.0.1-20ebb28', '20ebb28'],
    ['lmsysorg/sglang:nightly-dev-cu13-20260914-4358a161', '4358a161'],
    [
      'vllm/vllm-openai-rocm:nightly-rocm100-49cb2bbf71cfd36ee5aa33d1e184b1cddff55294',
      '49cb2bbf71cfd36ee5aa33d1e184b1cddff55294',
    ],
  ])('reads the commit from %s', (image, commit) => {
    expect(nightlyCommit(image)).toBe(commit);
  });

  it.each([
    'rocm/atom-dev:nightly_202609211553',
    'vllm/vllm-openai:cu134-nightly-x86_64-dev-20261019-mk',
    'lmsysorg/sglang:v0.5.22-cu130',
    'lmsysorg/sglang:dev-muse-spark-open',
  ])('finds no commit in %s', (image) => {
    expect(nightlyCommit(image)).toBeNull();
  });
});

describe('earliestSubmission', () => {
  const rows = [
    { image: 'vllm/vllm-openai:nightly-dev-x86_64-cu13.0.1-20ebb28', date: '2026-10-21' },
    { image: 'vllm/vllm-openai:nightly-dev-arm64-cu13.0.1-20ebb28', date: '2026-09-28' },
    { image: 'lmsysorg/sglang:nightly', date: '2026-08-01' },
    { image: 'lmsysorg/sglang:nightly', date: '2026-10-22' },
  ];
  const dates = firstSubmissionDates(rows);

  it('bounds a commit build by its first submission on any architecture', () => {
    expect(earliestSubmission(dates, rows[0])).toBe('2026-09-28');
  });

  it('keeps each submission date for a floating tag', () => {
    expect(earliestSubmission(dates, rows[3])).toBe('2026-10-22');
  });
});

describe('getActualLatestRelease', () => {
  const releases = {
    vllm: { tag: 'v0.21.0', publishedAt: '2026-06-01T00:00:00Z', commits: {} },
    sglang: { tag: 'v0.5.12', publishedAt: '2026-06-02T00:00:00Z', commits: {} },
  };

  it.each([
    ['vllm', 'v0.21.0'],
    ['dynamo-vllm', 'v0.21.0'],
    ['llmd-vllm', 'v0.21.0'],
    ['vllm-disagg', 'v0.21.0'],
    ['sglang', 'v0.5.12'],
    ['dynamo-sglang', 'v0.5.12'],
    ['mori-sglang', 'v0.5.12'],
  ])('uses the base engine release for %s', (framework, tag) => {
    expect(getActualLatestRelease(framework, releases)?.tag).toBe(tag);
  });

  it('returns null while loading, for engines without releases, and for missing releases', () => {
    expect(getActualLatestRelease('vllm', undefined)).toBeNull();
    expect(getActualLatestRelease('trt', releases)).toBeNull();
    expect(getActualLatestRelease('vllm', { sglang: releases.sglang })).toBeNull();
  });
});

describe('getCurrentImageNodeTypeTooltip', () => {
  it('preserves the English Mori spelling while using MoRI in Chinese', () => {
    expect(getCurrentImageNodeTypeTooltip('en')).toBe(
      'Single node = non-disaggregated serving. Disaggregated = separate prefill/decode pools, including Dynamo, Mori, and llm-d.',
    );
    expect(getCurrentImageNodeTypeTooltip('zh')).toBe(
      '单节点指非分离式推理；分离式配置使用独立的 prefill/decode 池，包括 Dynamo、MoRI 和 llm-d。',
    );
  });
});

function imageRow(
  model: string,
  scenario: 'agentic' | '1k/1k' | '1k/8k' | '8k/1k' | { isl: number; osl: number },
) {
  if (scenario === 'agentic') {
    return { model, isl: null, osl: null, benchmark_type: 'agentic_traces' };
  }
  const islOsl =
    typeof scenario === 'string'
      ? { '1k/1k': [1024, 1024], '1k/8k': [1024, 8192], '8k/1k': [8192, 1024] }[scenario]
      : [scenario.isl, scenario.osl];
  return { model, isl: islOsl[0], osl: islOsl[1], benchmark_type: 'single_turn' };
}

describe('imageRowDisplayModel / imageRowModel', () => {
  it('maps DB keys to the configured display model, grouping point releases', () => {
    expect(imageRowDisplayModel({ model: 'minimaxm3' })).toBe('MiniMax-M3');
    expect(imageRowModel({ model: 'minimaxm3' })).toBe(Model.MiniMax_M3);
    expect(imageRowModel({ model: 'glm5.1' })).toBe(Model.GLM_5);
    expect(imageRowModel({ model: 'kimik2.7-code' })).toBe(Model.Kimi_K2_5);
  });

  it('keeps unmapped DB keys as raw display names with no configured model', () => {
    expect(imageRowDisplayModel({ model: 'brand-new-model' })).toBe('brand-new-model');
    expect(imageRowModel({ model: 'brand-new-model' })).toBeNull();
  });
});

describe('imageRowSequence', () => {
  it('classifies agentic rows regardless of isl/osl and maps fixed sequences', () => {
    expect(imageRowSequence(imageRow('dsv4', 'agentic'))).toBe(Sequence.AgenticTraces);
    expect(imageRowSequence(imageRow('dsv4', '8k/1k'))).toBe(Sequence.EightK_OneK);
    expect(imageRowSequence(imageRow('dsv4', '1k/1k'))).toBe(Sequence.OneK_OneK);
  });

  it('falls back to the raw isl/osl pair for unmapped fixed-sequence combos', () => {
    expect(imageRowSequence(imageRow('dsv4', { isl: 4096, osl: 512 }))).toBe('4096/512');
  });
});

describe('isActiveImageRow', () => {
  it('keeps active models on scenarios they still sweep', () => {
    expect(isActiveImageRow(imageRow('dsv4', 'agentic'))).toBe(true);
    expect(isActiveImageRow(imageRow('qwen3.5', '8k/1k'))).toBe(true);
    expect(isActiveImageRow(imageRow('qwen3.5', 'agentic'))).toBe(true);
    expect(isActiveImageRow(imageRow('minimaxm3', 'agentic'))).toBe(true);
    expect(isActiveImageRow(imageRow('dsr1', '8k/1k'))).toBe(true);
  });

  it('drops the per-model retired MiniMax M3 and DeepSeek V4 Pro 8K/1K sweeps while keeping 8K/1K elsewhere', () => {
    expect(isActiveImageRow(imageRow('minimaxm3', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('dsv4', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('qwen3.5', '8k/1k'))).toBe(true);
  });

  it('drops globally retired 1K/1K and 1K/8K sweeps for every model', () => {
    expect(isActiveImageRow(imageRow('dsv4', '1k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('qwen3.5', '1k/8k'))).toBe(false);
    expect(isActiveImageRow(imageRow('dsr1', '1k/1k'))).toBe(false);
  });

  it('drops deprecated models on every scenario, including point-release buckets', () => {
    expect(isActiveImageRow(imageRow('kimik2.5', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('kimik2.6', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('minimaxm2.5', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('gptoss120b', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('glm5', '8k/1k'))).toBe(false);
    expect(isActiveImageRow(imageRow('glm5.1', 'agentic'))).toBe(false);
  });

  it('keeps unconfigured models, applying only the global scenario retirements', () => {
    expect(isActiveImageRow(imageRow('brand-new-model', '8k/1k'))).toBe(true);
    expect(isActiveImageRow(imageRow('brand-new-model', 'agentic'))).toBe(true);
    expect(isActiveImageRow(imageRow('brand-new-model', '1k/1k'))).toBe(false);
  });

  it('keeps unmapped isl/osl combos so a new sweep shape is not silently hidden', () => {
    expect(isActiveImageRow(imageRow('dsv4', { isl: 4096, osl: 512 }))).toBe(true);
  });
});

describe('sequenceOptionsForModel', () => {
  const rows = [
    imageRow('dsv4', '8k/1k'),
    imageRow('dsv4', 'agentic'),
    imageRow('minimaxm3', 'agentic'),
    imageRow('kimik3', 'agentic'),
    imageRow('qwen3.5', '8k/1k'),
  ];

  it('unions every scenario across models for the all-models filter', () => {
    expect(sequenceOptionsForModel(rows, 'all')).toEqual([
      Sequence.EightK_OneK,
      Sequence.AgenticTraces,
    ]);
  });

  it('narrows to the scenarios the selected model runs', () => {
    expect(sequenceOptionsForModel(rows, 'MiniMax-M3')).toEqual([Sequence.AgenticTraces]);
    expect(sequenceOptionsForModel(rows, 'Kimi-K3')).toEqual([Sequence.AgenticTraces]);
    expect(sequenceOptionsForModel(rows, 'DeepSeek-V4-Pro')).toEqual([
      Sequence.EightK_OneK,
      Sequence.AgenticTraces,
    ]);
  });

  it('returns no options for a model with no rows', () => {
    expect(sequenceOptionsForModel(rows, 'Qwen3.8-Flash-Next')).toEqual([]);
    expect(sequenceOptionsForModel([], 'all')).toEqual([]);
  });
});

describe('resolveSelectedSequence', () => {
  it('honours the selection when the model still offers it', () => {
    expect(
      resolveSelectedSequence(
        [Sequence.EightK_OneK, Sequence.AgenticTraces],
        Sequence.AgenticTraces,
      ),
    ).toBe(Sequence.AgenticTraces);
  });

  it('falls back to the first offered scenario when the selection is retired for the model', () => {
    expect(resolveSelectedSequence([Sequence.AgenticTraces], Sequence.EightK_OneK)).toBe(
      Sequence.AgenticTraces,
    );
  });

  it('returns the selection unchanged when nothing is offered so the empty state renders', () => {
    expect(resolveSelectedSequence([], Sequence.EightK_OneK)).toBe(Sequence.EightK_OneK);
  });
});
