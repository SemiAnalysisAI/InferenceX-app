import { describe, expect, it } from 'vitest';

import {
  compareVendors,
  DEFAULT_FIRST_TOKEN_CAPS,
  formatFirstTokenCaps,
  hardwareVendor,
  MAX_FIRST_TOKEN_CAPS,
  parseFirstTokenCaps,
  selectFirstTokenWinners,
  UNKNOWN_VENDOR,
  ZH_MEDIAN,
  zhStatPhrase,
} from './first-token-limits';
import type { GPUDataPoint } from './types';

function makePoint(overrides: Partial<GPUDataPoint> = {}): GPUDataPoint {
  return {
    hwKey: 'b200_sglang',
    interactivity: 160,
    ttft: 1.5,
    throughput: 1000,
    outputThroughput: 300,
    inputThroughput: 700,
    concurrency: 8,
    tp: 8,
    precision: 'fp4',
    costh: 0.1,
    costr: 0.2,
    costhi: 0.05,
    costri: 0.1,
    costhOutput: 0.3,
    costrOutput: 0.6,
    tpPerMw: 1000,
    inputTpPerMw: 700,
    outputTpPerMw: 300,
    ...overrides,
  };
}

const CAPS = [2, 5, 10];

/** The article's Figure 3 shape: B200 wins tight caps, GB300 wins looser ones. */
const OFFICIAL = {
  b200_sglang: [
    makePoint({ hwKey: 'b200_sglang', ttft: 1.6, costh: 0.067 }),
    // Cheaper but too slow to start — must only appear under caps ≥ 5 s.
    makePoint({ hwKey: 'b200_sglang', ttft: 4.2, costh: 0.06 }),
  ],
  'gb300_dynamo-trt': [
    makePoint({ hwKey: 'gb300_dynamo-trt', ttft: 8.9, costh: 0.045 }),
    // Fails the interactivity floor: never eligible, however cheap.
    makePoint({ hwKey: 'gb300_dynamo-trt', ttft: 0.9, costh: 0.01, interactivity: 90 }),
  ],
  mi355x_sglang: [makePoint({ hwKey: 'mi355x_sglang', ttft: 1.4, costh: 0.127 })],
};
const OFFICIAL_META = {
  b200_sglang: { hwKey: 'b200_sglang' },
  'gb300_dynamo-trt': { hwKey: 'gb300_dynamo-trt' },
  mi355x_sglang: { hwKey: 'mi355x_sglang' },
};

const select = (extra: Partial<Parameters<typeof selectFirstTokenWinners>[0]> = {}) =>
  selectFirstTokenWinners({
    official: OFFICIAL,
    officialMeta: OFFICIAL_META,
    caps: CAPS,
    minInteractivity: 150,
    costProvider: 'costh',
    costType: 'total',
    ...extra,
  });

const winnerOf = (
  result: ReturnType<typeof selectFirstTokenWinners>,
  cap: number,
  seriesKey: string,
) => result.cells.find((c) => c.cap === cap && c.series.key === seriesKey)?.winner ?? null;

describe('parseFirstTokenCaps', () => {
  it('parses, de-duplicates, sorts, and drops junk', () => {
    expect(parseFirstTokenCaps('10, 2,5,2,abc,-1,0')).toEqual([2, 5, 10]);
  });

  it('returns null when nothing is usable so callers fall back to the default', () => {
    expect(parseFirstTokenCaps('')).toBeNull();
    expect(parseFirstTokenCaps(undefined)).toBeNull();
    expect(parseFirstTokenCaps('x,y')).toBeNull();
  });

  it('caps the ladder length', () => {
    const many = Array.from({ length: MAX_FIRST_TOKEN_CAPS + 4 }, (_, i) => i + 1).join(',');
    expect(parseFirstTokenCaps(many)).toHaveLength(MAX_FIRST_TOKEN_CAPS);
  });

  it('round-trips the default ladder through the URL form', () => {
    expect(parseFirstTokenCaps(formatFirstTokenCaps(DEFAULT_FIRST_TOKEN_CAPS))).toEqual([
      ...DEFAULT_FIRST_TOKEN_CAPS,
    ]);
  });
});

describe('zhStatPhrase', () => {
  it('puts the median after its noun and a percentile before it', () => {
    expect(zhStatPhrase('交互性', ZH_MEDIAN)).toBe('交互性中位数');
    expect(zhStatPhrase('TTFT', ZH_MEDIAN)).toBe('TTFT 中位数');
    expect(zhStatPhrase('交互性', 'P90')).toBe('P90 交互性');
  });

  it('spaces the phrase off the preceding text only when it starts with Latin', () => {
    expect(zhStatPhrase('交互性', 'P90', '最低')).toBe('最低 P90 交互性');
    expect(zhStatPhrase('交互性', ZH_MEDIAN, '最低')).toBe('最低交互性中位数');
  });
});

describe('hardwareVendor', () => {
  it('reads the vendor off the registry base key, whatever the framework suffix', () => {
    expect(hardwareVendor('b200_dynamo-sglang')).toBe('NVIDIA');
    expect(hardwareVendor('gb300-dynamo-trt')).toBe('NVIDIA');
    expect(hardwareVendor('mi355x_atom')).toBe('AMD');
    expect(hardwareVendor('tpuv7_vllm')).toBe('Google');
  });

  it('falls back for hardware the registry does not know', () => {
    expect(hardwareVendor('mystery_sglang')).toBe(UNKNOWN_VENDOR);
  });

  it('orders NVIDIA, then AMD, then everyone else alphabetically', () => {
    expect(['Google', 'AMD', 'OpenAI', 'NVIDIA'].toSorted(compareVendors)).toEqual([
      'NVIDIA',
      'AMD',
      'Google',
      'OpenAI',
    ]);
  });
});

describe('selectFirstTokenWinners', () => {
  it('lists one official series per vendor, NVIDIA first', () => {
    expect(select().series.map((s) => s.key)).toEqual(['vendor:NVIDIA', 'vendor:AMD']);
  });

  it('picks the cheapest row under each cap that also clears the interactivity floor', () => {
    const result = select();
    // Under 2 s only the fast B200 row qualifies for NVIDIA; the cheap GB300
    // row is too slow to start and the cheaper-still GB300 row is below 150 tok/s.
    expect(winnerOf(result, 2, 'vendor:NVIDIA')).toMatchObject({
      hwKey: 'b200_sglang',
      cost: 0.067,
    });
    // At 5 s the slower-to-start, cheaper B200 row takes over.
    expect(winnerOf(result, 5, 'vendor:NVIDIA')).toMatchObject({
      hwKey: 'b200_sglang',
      cost: 0.06,
    });
    // At 10 s GB300 finally clears the cap and is cheapest of all.
    expect(winnerOf(result, 10, 'vendor:NVIDIA')).toMatchObject({
      hwKey: 'gb300_dynamo-trt',
      cost: 0.045,
    });
    for (const cap of CAPS) {
      expect(winnerOf(result, cap, 'vendor:AMD')).toMatchObject({
        hwKey: 'mi355x_sglang',
        cost: 0.127,
      });
    }
  });

  it('summarizes the cross-vendor gap as a fraction of the runner-up', () => {
    const [two, , ten] = select().summaries;
    expect(two.best?.hwKey).toBe('b200_sglang');
    expect(two.runnerUp?.hwKey).toBe('mi355x_sglang');
    expect(two.pctLower).toBeCloseTo((0.127 - 0.067) / 0.127, 10);
    expect(ten.best?.hwKey).toBe('gb300_dynamo-trt');
    expect(ten.pctLower).toBeCloseTo((0.127 - 0.045) / 0.127, 10);
  });

  it('leaves a vendor column empty rather than dropping the vendor when nothing qualifies', () => {
    const result = select({ caps: [1] });
    expect(result.series.map((s) => s.key)).toEqual(['vendor:NVIDIA', 'vendor:AMD']);
    expect(winnerOf(result, 1, 'vendor:NVIDIA')).toBeNull();
    expect(winnerOf(result, 1, 'vendor:AMD')).toBeNull();
    expect(result.summaries[0]).toMatchObject({ best: null, runnerUp: null, pctLower: null });
  });

  it('has no gap when only one vendor qualifies', () => {
    const result = select({ minInteractivity: 155, official: { ...OFFICIAL, mi355x_sglang: [] } });
    expect(result.summaries[0].best?.hwKey).toBe('b200_sglang');
    expect(result.summaries[0].runnerUp).toBeNull();
    expect(result.summaries[0].pctLower).toBeNull();
  });

  it('respects the legend: hidden hardware is not a candidate', () => {
    const result = select({
      visibleHwKeys: new Set(['gb300_dynamo-trt', 'mi355x_sglang']),
    });
    expect(winnerOf(result, 2, 'vendor:NVIDIA')).toBeNull();
    expect(winnerOf(result, 10, 'vendor:NVIDIA')?.hwKey).toBe('gb300_dynamo-trt');
  });

  it('reads the cost for the selected pricing tier and token type', () => {
    const rental = select({ costProvider: 'costr' });
    expect(winnerOf(rental, 2, 'vendor:NVIDIA')?.cost).toBe(0.2);
    const output = select({ costType: 'output' });
    expect(winnerOf(output, 2, 'vendor:AMD')?.cost).toBe(0.3);
  });

  it('ignores rows with no usable first-token measurement', () => {
    const result = select({
      official: {
        ...OFFICIAL,
        b200_sglang: [
          makePoint({ hwKey: 'b200_sglang', ttft: undefined, costh: 0.001 }),
          makePoint({ hwKey: 'b200_sglang', ttft: 0, costh: 0.002 }),
          makePoint({ hwKey: 'b200_sglang', ttft: Number.NaN, costh: 0.003 }),
        ],
      },
    });
    for (const cap of CAPS)
      expect(winnerOf(result, cap, 'vendor:NVIDIA')?.hwKey).toBe(
        cap >= 10 ? 'gb300_dynamo-trt' : undefined,
      );
    // The unreadable rows are not counted as measured either.
    expect(result.measuredRows).toBe(3);
  });

  it('breaks cost ties toward the shorter first token, then the faster stream', () => {
    const result = select({
      official: {
        a: [
          makePoint({ hwKey: 'b200_sglang', ttft: 1.9, costh: 0.05, interactivity: 160 }),
          makePoint({ hwKey: 'b200_sglang', ttft: 1.2, costh: 0.05, interactivity: 155 }),
          makePoint({ hwKey: 'b200_sglang', ttft: 1.2, costh: 0.05, interactivity: 170 }),
        ],
      },
      officialMeta: { a: { hwKey: 'b200_sglang' } },
    });
    expect(winnerOf(result, 2, 'vendor:NVIDIA')).toMatchObject({ ttft: 1.2, interactivity: 170 });
  });

  it('counts qualifying and measured rows for the subtitle', () => {
    const result = select();
    expect(result.measuredRows).toBe(5);
    // The 90 tok/s GB300 row fails the floor.
    expect(result.qualifyingRows).toBe(4);
  });

  describe('unofficial-run overlays', () => {
    const OVERLAY = {
      b200_sglang__run0: [makePoint({ hwKey: 'b200_sglang', ttft: 1.1, costh: 0.03 })],
      mi355x_sglang__run0: [makePoint({ hwKey: 'mi355x_sglang', ttft: 1, costh: 0.02 })],
      b300_sglang__run1: [makePoint({ hwKey: 'b300_sglang', ttft: 7, costh: 0.01 })],
    };
    const OVERLAY_META = {
      b200_sglang__run0: { hwKey: 'b200_sglang', runIndex: 0 },
      mi355x_sglang__run0: { hwKey: 'mi355x_sglang', runIndex: 0 },
      b300_sglang__run1: { hwKey: 'b300_sglang', runIndex: 1 },
    };

    it('adds one series per run after the vendors, labelled with the branch', () => {
      const result = select({
        overlay: OVERLAY,
        overlayMeta: OVERLAY_META,
        overlayLabels: { 0: 'perf/faster-prefill' },
      });
      expect(result.series.map((s) => s.key)).toEqual([
        'vendor:NVIDIA',
        'vendor:AMD',
        'run:0',
        'run:1',
      ]);
      expect(result.series[2]).toMatchObject({ label: '✕ perf/faster-prefill', runIndex: 0 });
      expect(result.series[3].label).toBe('✕ run 2');
    });

    it('picks a run’s cheapest qualifying row across every vendor it touched', () => {
      const result = select({ overlay: OVERLAY, overlayMeta: OVERLAY_META });
      expect(winnerOf(result, 2, 'run:0')).toMatchObject({ hwKey: 'mi355x_sglang', cost: 0.02 });
      expect(winnerOf(result, 2, 'run:1')).toBeNull();
      expect(winnerOf(result, 10, 'run:1')).toMatchObject({ hwKey: 'b300_sglang', runIndex: 1 });
    });

    it('never lets an overlay row into the official vendor bars or the gap summary', () => {
      const result = select({ overlay: OVERLAY, overlayMeta: OVERLAY_META });
      expect(winnerOf(result, 2, 'vendor:AMD')?.cost).toBe(0.127);
      expect(result.summaries[0].best?.cost).toBe(0.067);
    });

    it('hides overlay rows for hardware the legend has switched off', () => {
      const result = select({
        overlay: OVERLAY,
        overlayMeta: OVERLAY_META,
        visibleHwKeys: new Set(['b200_sglang', 'gb300_dynamo-trt']),
      });
      expect(winnerOf(result, 2, 'run:0')).toMatchObject({ hwKey: 'b200_sglang', cost: 0.03 });
      expect(result.series.map((s) => s.key)).not.toContain('run:1');
    });
  });
});
