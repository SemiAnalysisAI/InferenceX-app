/**
 * Shared fixture factories for the chart-* module test suites (chart-point,
 * roofline, hardware-keys). Split out of the former monolithic
 * chart-utils.test.ts so the per-module suites can share identical builders
 * without duplicating them. Pure builders only — no vi.mock (those are hoisted
 * and must live in each test file).
 */

import type { AggDataEntry, InferenceData } from '@/lib/chart-types';

// ---------------------------------------------------------------------------
// InferenceData fixture — only x/y and roofline metric fields matter
// ---------------------------------------------------------------------------
export function pt(
  x: number,
  y: number,
  hwKey = 'h100',
  opts: {
    tpPerGpuY?: number;
    costhY?: number;
    outputTputY?: number;
    inputTputY?: number;
  } = {},
): InferenceData {
  const tpPerGpuY = opts.tpPerGpuY ?? y * 10;
  return {
    date: '2024-01-01',
    x,
    y,
    tp: 1,
    conc: 1,
    hwKey,
    precision: 'fp16',
    tpPerGpu: { y: tpPerGpuY, roof: false },
    tpPerMw: { y: 5, roof: false },
    costh: { y: opts.costhY ?? 1, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1.2, roof: false },
    costhi: { y: 2, roof: false },
    costni: { y: 2.5, roof: false },
    costri: { y: 2.2, roof: false },
    ...(opts.outputTputY === undefined
      ? {}
      : { outputTputPerGpu: { y: opts.outputTputY, roof: false } }),
    ...(opts.inputTputY === undefined
      ? {}
      : { inputTputPerGpu: { y: opts.inputTputY, roof: false } }),
  } as InferenceData;
}

// ---------------------------------------------------------------------------
// AggDataEntry fixture — for createChartDataPoint / getHardwareKey tests
// ---------------------------------------------------------------------------
export function entry(overrides: Partial<AggDataEntry> = {}): AggDataEntry {
  return {
    hw: 'h100-sxm',
    framework: '',
    mtp: '',
    spec_decoding: 'none',
    hwKey: 'h100' as any,
    tp: 8,
    conc: 64,
    model: 'test-model',
    precision: 'fp8',
    tput_per_gpu: 1000,
    output_tput_per_gpu: 0,
    input_tput_per_gpu: 0,
    mean_ttft: 100,
    median_ttft: 95,
    std_ttft: 10,
    p99_ttft: 200,
    mean_tpot: 5,
    mean_intvty: 50,
    median_tpot: 4,
    median_intvty: 45,
    std_tpot: 1,
    std_intvty: 5,
    p99_tpot: 8,
    p99_intvty: 80,
    mean_itl: 3,
    median_itl: 2.5,
    std_itl: 0.5,
    p99_itl: 5,
    mean_e2el: 500,
    median_e2el: 480,
    std_e2el: 50,
    p99_e2el: 700,
    disagg: false,
    num_prefill_gpu: 0,
    num_decode_gpu: 0,
    date: '2025-01-15',
    ...overrides,
  } as AggDataEntry;
}

// ---------------------------------------------------------------------------
// Minimal InferenceData for pareto front tests (only x/y matter)
// ---------------------------------------------------------------------------
export function paretoPt(
  x: number,
  y: number,
  overrides: Partial<InferenceData> = {},
): InferenceData {
  return {
    date: '2024-01-01',
    x,
    y,
    tp: 1,
    conc: 1,
    hwKey: 'h100',
    precision: 'fp16',
    tpPerGpu: { y: 100, roof: false },
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

/** Assertion helper: extract {x, y} from each point. */
export const xy = (pts: InferenceData[]) => pts.map((p) => ({ x: p.x, y: p.y }));

/**
 * Creates a minimal InferenceData point with all optional roofline fields populated.
 */
export function fullPt(
  x: number,
  hwKey: string,
  vals: {
    tpPerGpuY: number;
    costhY?: number;
    costhOutputY?: number;
    costnOutputY?: number;
    costrOutputY?: number;
    jTotalY?: number;
    jOutputY?: number;
    jInputY?: number;
    outputTputY?: number;
    inputTputY?: number;
    inputTputPerMwY?: number;
    outputTputPerMwY?: number;
  },
): InferenceData {
  return {
    date: '2025-01-15',
    x,
    y: 0,
    tp: 8,
    conc: 64,
    hwKey,
    precision: 'fp8',
    tpPerGpu: { y: vals.tpPerGpuY, roof: false },
    tpPerMw: { y: 5, roof: false },
    costh: { y: vals.costhY ?? 1, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1.2, roof: false },
    costhi: { y: 2, roof: false },
    costni: { y: 2.5, roof: false },
    costri: { y: 2.2, roof: false },
    ...(vals.costhOutputY === undefined
      ? {}
      : { costhOutput: { y: vals.costhOutputY, roof: false } }),
    ...(vals.costnOutputY === undefined
      ? {}
      : { costnOutput: { y: vals.costnOutputY, roof: false } }),
    ...(vals.costrOutputY === undefined
      ? {}
      : { costrOutput: { y: vals.costrOutputY, roof: false } }),
    ...(vals.jTotalY === undefined ? {} : { jTotal: { y: vals.jTotalY, roof: false } }),
    ...(vals.jOutputY === undefined ? {} : { jOutput: { y: vals.jOutputY, roof: false } }),
    ...(vals.jInputY === undefined ? {} : { jInput: { y: vals.jInputY, roof: false } }),
    ...(vals.outputTputY === undefined
      ? {}
      : { outputTputPerGpu: { y: vals.outputTputY, roof: false } }),
    ...(vals.inputTputY === undefined
      ? {}
      : { inputTputPerGpu: { y: vals.inputTputY, roof: false } }),
    ...(vals.inputTputPerMwY === undefined
      ? {}
      : { inputTputPerMw: { y: vals.inputTputPerMwY, roof: false } }),
    ...(vals.outputTputPerMwY === undefined
      ? {}
      : { outputTputPerMw: { y: vals.outputTputPerMwY, roof: false } }),
  } as InferenceData;
}
