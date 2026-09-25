import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHardwareConfig } from '@/lib/constants';
import {
  getInferenceHardwareConfig,
  getInferenceRunLabel,
  getPointHardwareConfig,
  inferenceFrameworkLabelOverride,
} from './inference-labels';

const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34926284365';
const historicalUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34926284364';
const hwKey = 'mi355x_mori-sglang';

describe('temporary UMBP MoRI SGLang label for run 35879254139', () => {
  const targetUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35879254139';
  const expiresAt = Date.parse('2026-10-10T00:00:00-04:00');

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-24T22:39:00-04:00'));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([targetUrl, `${targetUrl}/attempts/1`, `${targetUrl}/attempts/5`])(
    'uses the requested wording in official and overlay display paths: %s',
    (url) => {
      for (const framework of ['mori-sglang', 'sglang-disagg']) {
        expect(inferenceFrameworkLabelOverride(framework, url)).toBe('UMBP MoRI SGLang');
      }
      const key = `${hwKey}_mtp`;
      const generic = getHardwareConfig(key);
      const point = { hwKey: key, framework: 'mori-sglang', run_url: url };
      const config = getInferenceHardwareConfig(key, undefined, [point]);
      expect(config.suffix).toBe('(UMBP MoRI SGLang, MTP)');
      expect(config.gpu).toContain('UMBP MoRI SGLang');
      expect(config.name).toBe(generic.name);
      expect(getHardwareConfig(key).suffix).toBe('(MoRI SGLang, MTP)');
      expect(getPointHardwareConfig(point, generic)).toEqual(config);
      expect(getInferenceRunLabel('✕ gamma6', [point, point])).toBe('✕ gamma6 (UMBP MoRI SGLang)');
    },
  );

  it('does not relabel other runs, missing provenance, or other frameworks', () => {
    for (const id of ['35879254138', '35879254140', '358792541390']) {
      expect(
        inferenceFrameworkLabelOverride('mori-sglang', targetUrl.replace('35879254139', id)),
      ).toBeUndefined();
    }
    for (const framework of ['sglang', 'vllm']) {
      expect(inferenceFrameworkLabelOverride(framework, targetUrl)).toBeUndefined();
    }
    for (const url of [undefined, null, '']) {
      expect(inferenceFrameworkLabelOverride('mori-sglang', url)).toBeUndefined();
    }
    expect(inferenceFrameworkLabelOverride('mori-sglang', runUrl)).toBe('MoRI UMBP SGLang');
  });

  it('keeps mixed-run curve labels deterministic and point labels run-specific', () => {
    const points = [targetUrl, historicalUrl, runUrl, targetUrl].map((run_url) => ({
      hwKey,
      framework: 'mori-sglang',
      run_url,
    }));
    const config = getInferenceHardwareConfig(hwKey, undefined, points);
    expect(config.suffix).toBe('(MoRI SGLang / MoRI UMBP SGLang / UMBP MoRI SGLang)');
    expect(getInferenceHardwareConfig(hwKey, undefined, points.toReversed())).toEqual(config);
    expect(getPointHardwareConfig(points[0], config).suffix).toBe('(UMBP MoRI SGLang)');
    expect(getPointHardwareConfig(points[1], config).suffix).toBe('(MoRI SGLang)');
    expect(getPointHardwareConfig(points[2], config).suffix).toBe('(MoRI UMBP SGLang)');
    expect(getInferenceRunLabel('✕ mixed', points)).toBe(
      '✕ mixed (MoRI UMBP SGLang / UMBP MoRI SGLang)',
    );
    expect(getInferenceRunLabel('✕ mixed', points.toReversed())).toBe(
      getInferenceRunLabel('✕ mixed', points),
    );
  });

  it('keeps the label through October 9 Eastern and expires at midnight October 10', () => {
    const point = { hwKey, framework: 'mori-sglang', run_url: targetUrl };
    const generic = getHardwareConfig(hwKey);
    for (const now of [Date.parse('2026-10-09T12:00:00-04:00'), expiresAt - 1]) {
      vi.mocked(Date.now).mockReturnValue(now);
      expect(getInferenceHardwareConfig(hwKey, undefined, [point]).suffix).toBe(
        '(UMBP MoRI SGLang)',
      );
      expect(getInferenceRunLabel('✕ gamma6', [point])).toBe('✕ gamma6 (UMBP MoRI SGLang)');
    }
    for (const now of [expiresAt, expiresAt + 1, expiresAt + 86_400_000]) {
      vi.mocked(Date.now).mockReturnValue(now);
      expect(inferenceFrameworkLabelOverride('mori-sglang', targetUrl)).toBeUndefined();
      expect(getInferenceHardwareConfig(hwKey, undefined, [point])).toBe(generic);
      expect(getPointHardwareConfig(point, generic)).toBe(generic);
      expect(getInferenceRunLabel('✕ gamma6', [point])).toBe('✕ gamma6');
    }
  });
});

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

describe('temporary UMBP linker gamma-6 run label', () => {
  const linkerUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35879254139';
  const dsparkUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35166686551';
  const expiresAt = Date.parse('2026-10-10T04:00:00Z');

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-25T02:00:00Z'));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([linkerUrl, `${linkerUrl}/attempts/1`, `${linkerUrl}/attempts/3`])(
    'labels the new run without changing identity: %s',
    (url) => {
      expect(inferenceFrameworkLabelOverride('mori-sglang', url)).toBe('UMBP MoRI SGLang');
      expect(inferenceFrameworkLabelOverride('sglang-disagg', url)).toBe('UMBP MoRI SGLang');
      expect(inferenceFrameworkLabelOverride('sglang', url)).toBeUndefined();
      const config = getInferenceHardwareConfig(hwKey, undefined, [{ run_url: url }]);
      expect(config.suffix).toBe('(UMBP MoRI SGLang)');
      expect(config.name).toBe(getHardwareConfig(hwKey).name);
      expect(getPointHardwareConfig({ hwKey, run_url: url }, config)).toEqual(config);
      expect(
        getInferenceRunLabel('✕ amd/agentx-v1.0-th-dspark-gamma6-lowcon', [
          { framework: 'mori-sglang', run_url: url },
        ]),
      ).toBe('✕ amd/agentx-v1.0-th-dspark-gamma6-lowcon (UMBP MoRI SGLang)');
    },
  );

  it('leaves neighboring run IDs and mixed historical points correctly labeled', () => {
    for (const id of ['35879254138', '35879254140', '358792541390']) {
      expect(
        inferenceFrameworkLabelOverride('mori-sglang', linkerUrl.replace('35879254139', id)),
      ).toBeUndefined();
    }
    expect(
      getInferenceHardwareConfig(hwKey, undefined, [
        { run_url: linkerUrl },
        { run_url: historicalUrl },
      ]).suffix,
    ).toBe('(MoRI SGLang / UMBP MoRI SGLang)');
  });

  it('preserves both display names when mixing the new run with earlier UMBP runs', () => {
    expect(
      getInferenceHardwareConfig(hwKey, undefined, [
        { run_url: linkerUrl },
        { run_url: dsparkUrl },
        { run_url: runUrl },
      ]).suffix,
    ).toBe('(MoRI UMBP SGLang / UMBP MoRI SGLang)');
  });

  it('returns to the standard label at the exact cutoff in all shared display paths', () => {
    vi.mocked(Date.now).mockReturnValue(expiresAt - 1);
    expect(inferenceFrameworkLabelOverride('mori-sglang', linkerUrl)).toBe('UMBP MoRI SGLang');
    for (const now of [expiresAt, expiresAt + 1, expiresAt + 86_400_000]) {
      vi.mocked(Date.now).mockReturnValue(now);
      expect(inferenceFrameworkLabelOverride('mori-sglang', linkerUrl)).toBeUndefined();
      const point = { hwKey, framework: 'mori-sglang', run_url: linkerUrl };
      const generic = getHardwareConfig(hwKey);
      expect(getInferenceHardwareConfig(hwKey, undefined, [point])).toBe(generic);
      expect(getPointHardwareConfig(point, generic)).toBe(generic);
      expect(getInferenceRunLabel('✕ gamma6', [point])).toBe('✕ gamma6');
      expect(inferenceFrameworkLabelOverride('mori-sglang', runUrl)).toBe('MoRI UMBP SGLang');
    }
  });

  it('keeps the earlier DSpark window independent of the new cutoff', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-09T01:32:00Z'));
    expect(inferenceFrameworkLabelOverride('mori-sglang', dsparkUrl)).toBeUndefined();
    expect(inferenceFrameworkLabelOverride('mori-sglang', linkerUrl)).toBe('UMBP MoRI SGLang');
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
