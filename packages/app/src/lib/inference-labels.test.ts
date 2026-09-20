import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHardwareConfig } from '@/lib/constants';
import {
  getInferenceHardwareConfig,
  getInferenceRunLabel,
  getOverlayLineLabel,
  getPointHardwareConfig,
  inferenceFrameworkLabelOverride,
  shortRunTag,
} from './inference-labels';

const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34926284365';
const historicalUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34926284364';
const hwKey = 'mi355x_mori-sglang';

describe('temporary DSpark UMBP run label', () => {
  const dsparkUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35166686551';
  const expiresAt = Date.parse('2026-10-09T01:32:00Z');

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-18T01:32:00Z'));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([dsparkUrl, `${dsparkUrl}/attempts/1`, `${dsparkUrl}/attempts/5`])(
    'labels the new run without changing identity: %s',
    (url) => {
      expect(inferenceFrameworkLabelOverride('mori-sglang', url)).toBe('MoRI UMBP SGLang');
      expect(inferenceFrameworkLabelOverride('sglang-disagg', url)).toBe('MoRI UMBP SGLang');
      expect(inferenceFrameworkLabelOverride('sglang', url)).toBeUndefined();
      const config = getInferenceHardwareConfig(hwKey, undefined, [{ run_url: url }]);
      expect(config.suffix).toBe('(MoRI UMBP SGLang)');
      expect(config.name).toBe(getHardwareConfig(hwKey).name);
      expect(getPointHardwareConfig({ hwKey, run_url: url }, config)).toEqual(config);
      expect(getInferenceRunLabel('✕ dspark', [{ framework: 'mori-sglang', run_url: url }])).toBe(
        '✕ dspark (MoRI UMBP SGLang)',
      );
    },
  );

  it('leaves neighboring run IDs and mixed historical points correctly labeled', () => {
    for (const id of ['35166686550', '35166686552', '351666865510']) {
      expect(
        inferenceFrameworkLabelOverride('mori-sglang', dsparkUrl.replace('35166686551', id)),
      ).toBeUndefined();
    }
    expect(
      getInferenceHardwareConfig(hwKey, undefined, [
        { run_url: dsparkUrl },
        { run_url: historicalUrl },
      ]).suffix,
    ).toBe('(MoRI SGLang / MoRI UMBP SGLang)');
  });

  it('returns to the standard label at the exact cutoff in all shared display paths', () => {
    vi.mocked(Date.now).mockReturnValue(expiresAt - 1);
    expect(inferenceFrameworkLabelOverride('mori-sglang', dsparkUrl)).toBe('MoRI UMBP SGLang');
    for (const now of [expiresAt, expiresAt + 1, expiresAt + 86_400_000]) {
      vi.mocked(Date.now).mockReturnValue(now);
      expect(inferenceFrameworkLabelOverride('mori-sglang', dsparkUrl)).toBeUndefined();
      const point = { hwKey, framework: 'mori-sglang', run_url: dsparkUrl };
      const generic = getHardwareConfig(hwKey);
      expect(getInferenceHardwareConfig(hwKey, undefined, [point])).toBe(generic);
      expect(getPointHardwareConfig(point, generic)).toBe(generic);
      expect(getInferenceRunLabel('✕ dspark', [point])).toBe('✕ dspark');
      expect(inferenceFrameworkLabelOverride('mori-sglang', runUrl)).toBe('MoRI UMBP SGLang');
    }
  });
});

describe('run-specific MoRI UMBP labels', () => {
  it('retains the unofficial marker and branch while labeling only the target overlay', () => {
    expect(
      getInferenceRunLabel('✕ mori-test', [{ framework: 'mori-sglang', run_url: runUrl }]),
    ).toBe('✕ mori-test (MoRI UMBP SGLang)');
    expect(
      getInferenceRunLabel('✕ historical', [{ framework: 'mori-sglang', run_url: historicalUrl }]),
    ).toBe('✕ historical');
    expect(getInferenceRunLabel('✕ sglang-test', [{ framework: 'sglang', run_url: runUrl }])).toBe(
      '✕ sglang-test',
    );
  });

  it.each([runUrl, `${runUrl}/attempts/2`])(
    'labels target run %s and legacy framework aliases',
    (url) => {
      expect(inferenceFrameworkLabelOverride('mori-sglang', url)).toBe('MoRI UMBP SGLang');
      expect(inferenceFrameworkLabelOverride('sglang-disagg', url)).toBe('MoRI UMBP SGLang');
      expect(inferenceFrameworkLabelOverride('sglang', url)).toBeUndefined();
      expect(inferenceFrameworkLabelOverride('vllm', url)).toBeUndefined();
    },
  );

  it.each([undefined, null, '', historicalUrl, `${runUrl}0`])(
    'leaves other or unknown runs unchanged: %s',
    (url) => {
      expect(inferenceFrameworkLabelOverride('mori-sglang', url)).toBeUndefined();
      expect(getInferenceHardwareConfig(hwKey, undefined, [{ run_url: url }])).toBe(
        getHardwareConfig(hwKey),
      );
    },
  );

  it('preserves hardware identity, spec suffixes and generic cached metadata', () => {
    const key = `${hwKey}_mtp`;
    const generic = getHardwareConfig(key);
    const config = getInferenceHardwareConfig(key, undefined, [{ run_url: runUrl }]);
    expect(config.name).toBe(generic.name);
    expect(config.label).toBe('MI355X');
    expect(config.suffix).toBe('(MoRI UMBP SGLang, MTP)');
    expect(config.gpu).toContain('MoRI UMBP SGLang');
    expect(getHardwareConfig(key).suffix).toBe('(MoRI SGLang, MTP)');
  });

  it('names mixed-run curves deterministically without mislabeling historical points', () => {
    const points = [{ run_url: runUrl }, { run_url: historicalUrl }];
    const config = getInferenceHardwareConfig(hwKey, undefined, points);
    expect(config.suffix).toBe('(MoRI SGLang / MoRI UMBP SGLang)');
    expect(getInferenceHardwareConfig(hwKey, undefined, points.toReversed())).toEqual(config);
    expect(getPointHardwareConfig({ hwKey, ...points[0] }, config).suffix).toBe(
      '(MoRI UMBP SGLang)',
    );
    expect(getPointHardwareConfig({ hwKey, ...points[1] }, config).suffix).toBe('(MoRI SGLang)');
    expect(getInferenceHardwareConfig(hwKey, undefined, []).suffix).toBe('(MoRI SGLang)');
  });
});

describe('overlay line labels', () => {
  const klaud = {
    id: 35319969159,
    branch: 'klaud/qwen3.5-fp8-gb300-dynamo-sglang-nightly-dev-cu13-20260918-20518d85',
  };

  it('names the hardware and leaves the branch to the legend when one run draws it', () => {
    expect(getOverlayLineLabel('GB300 NVL72 (Dynamo SGLang)', klaud, false)).toBe(
      '✕ GB300 NVL72 (Dynamo SGLang)',
    );
  });

  it('adds a short run tag only when several runs draw the same hardware', () => {
    expect(getOverlayLineLabel('GB200 NVL72 (Dynamo SGLang)', klaud, true)).toBe(
      '✕ GB200 NVL72 (Dynamo SGLang) · …20260918-20518d85',
    );
    expect(getOverlayLineLabel('B300', { id: 31756025413, branch: 'main' }, true)).toBe(
      '✕ B300 · main',
    );
  });

  it.each([
    ['main', 'main'],
    ['feat/short-name', 'feat/short-name'],
    ['release/2026-09-18-hotfix', '2026-09-18-hotfix'],
    [klaud.branch, '…20260918-20518d85'],
    ['', 'run 42'],
    [null, 'run 42'],
  ])('shortens branch %j to %j', (branch, expected) => {
    expect(shortRunTag({ id: 42, branch })).toBe(expected);
  });
});
