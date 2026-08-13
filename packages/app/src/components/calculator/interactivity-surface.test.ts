import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Sequence } from '@/lib/data-mappings';

import {
  bestSoFarProgression,
  groupHistoryByHwKeyAndDate,
  mergeProgressionsByChip,
} from './historical-best';
import {
  buildSurfaceGrid,
  logSpacedSlices,
  measuredInteractivitySpan,
  prepareFrontier,
  prepareGroups,
  stepsAtInteractivity,
} from './interactivity-surface';
import { interpolateForGPU } from './interpolation';
import { getTpPerMwForType } from './ThroughputBarChart';
import type { InterpolatedResult } from './types';

const MODE = 'interactivity_to_throughput' as const;
const COST_PROVIDER = 'costh' as const;
const COST_TYPE = 'total' as const;

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 8,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 8,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 8,
    offload_mode: 'off',
    image: 'sglang:test',
    metrics: {
      median_intvty: 50,
      tput_per_gpu: 900,
      output_tput_per_gpu: 300,
      input_tput_per_gpu: 600,
    },
    date: '2026-07-19',
    run_url: null,
    ...overrides,
  };
}

function sweep(
  date: string,
  interactivity: number,
  tputPerGpu: number,
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return makeRow({
    id: Math.round(interactivity * 1000 + tputPerGpu),
    date,
    conc: Math.round(tputPerGpu / interactivity),
    metrics: {
      median_intvty: interactivity,
      tput_per_gpu: tputPerGpu,
      output_tput_per_gpu: tputPerGpu * 0.3,
      input_tput_per_gpu: tputPerGpu * 0.7,
    },
    ...overrides,
  });
}

/** Two frameworks on one chip, three dates, overlapping but unequal ranges. */
const ROWS: BenchmarkRow[] = [
  // b300 + sglang: covers 20..80
  sweep('2026-01-05', 20, 1000),
  sweep('2026-01-05', 50, 700),
  sweep('2026-01-05', 80, 350),
  sweep('2026-03-05', 20, 1200),
  sweep('2026-03-05', 50, 900),
  sweep('2026-03-05', 80, 500),
  // b300 + TRT-LLM (the framework name normalises to `trt`, so the hwKey is
  // `b300_trt`): only fast interactivity, 60..140 — wins the top of the range
  sweep('2026-02-10', 60, 800, { framework: 'trtllm' }),
  sweep('2026-02-10', 100, 600, { framework: 'trtllm' }),
  sweep('2026-02-10', 140, 300, { framework: 'trtllm' }),
  // b200 + sglang: a second chip, narrow range
  sweep('2026-02-01', 40, 600, { hardware: 'b200' }),
  sweep('2026-02-01', 70, 380, { hardware: 'b200' }),
];

function groupsOf(rows: BenchmarkRow[] = ROWS) {
  return groupHistoryByHwKeyAndDate({
    rows,
    sequence: Sequence.OneK_OneK,
    precisions: ['fp4'],
  });
}

const rank = (r: InterpolatedResult) => getTpPerMwForType(r, COST_TYPE);

/** The canonical 1D pipeline: what the 2D chart plots at one interactivity. */
function canonicalChips(rows: BenchmarkRow[], target: number) {
  const progressions = bestSoFarProgression(groupsOf(rows), {
    targetValue: target,
    mode: MODE,
    costProvider: COST_PROVIDER,
    rank,
  });
  return mergeProgressionsByChip(progressions);
}

describe('prepareFrontier', () => {
  it('reads the same values interpolateForGPU does, at every target inside the range', () => {
    // The whole point of the prepared reader is to be the 1D read without paying
    // for ten splines per slice. If it ever disagrees, the surface is lying.
    const groups = groupsOf();
    for (const [hwKey, dated] of groups.byHwKey) {
      for (const sweepAt of dated) {
        const reader = prepareFrontier(sweepAt.points, MODE, COST_TYPE);
        expect(reader, hwKey).not.toBeNull();
        for (const target of [20, 33.3, 50, 62.5, 80, 100, 140]) {
          const canonical = interpolateForGPU(sweepAt.points, target, MODE, COST_PROVIDER);
          const mine = reader!.read(target);
          if (!canonical || canonical.clamped) {
            expect(mine, `${hwKey} @ ${target}`).toBeNull();
            continue;
          }
          expect(mine, `${hwKey} @ ${target}`).not.toBeNull();
          expect(mine!.value).toBeCloseTo(canonical.value, 6);
          expect(mine!.tput).toBeCloseTo(canonical.value, 6);
          expect(mine!.outputTput).toBeCloseTo(canonical.outputTputValue, 6);
          expect(mine!.rank).toBeCloseTo(rank(canonical), 6);
        }
      }
    }
  });

  it('refuses to extrapolate past the measured range', () => {
    const reader = prepareFrontier(
      groupsOf().byHwKey.get('b300_sglang')![0]!.points,
      MODE,
      COST_TYPE,
    )!;
    expect(reader.min).toBeCloseTo(20, 6);
    expect(reader.max).toBeCloseTo(80, 6);
    expect(reader.read(19.9)).toBeNull();
    expect(reader.read(80.1)).toBeNull();
    expect(reader.read(20)).not.toBeNull();
    expect(reader.read(80)).not.toBeNull();
  });

  it('reads a single-point frontier only at its own interactivity', () => {
    // Singleton sweeps are a real and common shape in the history, and a grid
    // must not smear one measurement across a whole slice.
    const single = groupsOf([sweep('2026-05-01', 45, 700)]).byHwKey.get('b300_sglang')![0]!;
    const reader = prepareFrontier(single.points, MODE, COST_TYPE)!;
    expect(reader.read(45)).not.toBeNull();
    expect(reader.read(44)).toBeNull();
    expect(reader.read(46)).toBeNull();
  });

  it('returns null when there is nothing to read', () => {
    expect(prepareFrontier([], MODE, COST_TYPE)).toBeNull();
  });
});

describe('stepsAtInteractivity', () => {
  it('agrees with the 1D pipeline slice by slice', () => {
    // The equivalence pin. These selection rules are deliberately duplicated —
    // running the canonical path at 20 slices costs ten splines per sweep per
    // slice — so this test is what stops the two drifting apart.
    const prepared = prepareGroups(groupsOf(), MODE, COST_TYPE);
    for (const target of [20, 25, 40, 50, 65, 70, 80, 100, 130]) {
      const canonical = canonicalChips(ROWS, target);
      const mine = stepsAtInteractivity(prepared, target);

      expect([...mine.keys()].toSorted(), `chips @ ${target}`).toEqual(
        canonical.map((c) => c.key).toSorted(),
      );
      for (const chip of canonical) {
        const steps = mine.get(chip.key)!;
        expect(
          steps.map((s) => `${s.date}|${s.hwKey}`),
          `rungs @ ${target} for ${chip.key}`,
        ).toEqual(chip.steps.map((s) => `${s.date}|${s.result.hwKey}`));
        for (const [i, step] of steps.entries()) {
          expect(step.rank).toBeCloseTo(chip.steps[i]!.rankValue, 6);
        }
      }
    }
  });

  it('drops chips entirely on slices nothing measured', () => {
    const prepared = prepareGroups(groupsOf(), MODE, COST_TYPE);
    // 130 tok/s/user is inside the trtllm sweep only — b200 has no line there.
    const fast = stepsAtInteractivity(prepared, 130);
    expect([...fast.keys()]).toEqual(['b300']);
    expect(fast.get('b300')!.every((s) => s.hwKey === 'b300_trt')).toBe(true);
    // 25 is inside the sglang sweeps only.
    const slow = stepsAtInteractivity(prepared, 25);
    expect(slow.get('b300')!.every((s) => s.hwKey === 'b300_sglang')).toBe(true);
  });

  it('honours legend visibility per hwKey, as the 2D path does', () => {
    const prepared = prepareGroups(groupsOf(), MODE, COST_TYPE);
    const only = stepsAtInteractivity(prepared, 70, new Set(['b300_trt']));
    expect([...only.keys()]).toEqual(['b300']);
    expect(only.get('b300')!.every((s) => s.hwKey === 'b300_trt')).toBe(true);
  });
});

describe('slice geometry helpers', () => {
  it('spaces slices geometrically across the measured envelope', () => {
    const slices = logSpacedSlices(20, 140, 5);
    expect(slices).toHaveLength(5);
    expect(slices[0]).toBeCloseTo(20, 6);
    expect(slices.at(-1)).toBeCloseTo(140, 6);
    // Equal ratios, not equal differences.
    const ratios = slices.slice(1).map((v, i) => v / slices[i]!);
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0]!, 6);
  });

  it('degrades safely on impossible spans', () => {
    expect(logSpacedSlices(0, 100, 8)).toEqual([]);
    expect(logSpacedSlices(50, 50, 8)).toEqual([50]);
  });

  it('takes the span from the frontiers themselves', () => {
    const span = measuredInteractivitySpan(prepareGroups(groupsOf(), MODE, COST_TYPE));
    expect(span).not.toBeNull();
    expect(span![0]).toBeCloseTo(20, 6);
    expect(span![1]).toBeCloseTo(140, 6);
  });
});

describe('buildSurfaceGrid', () => {
  const anchorMs = Date.parse('2026-01-01T00:00:00Z');
  const assumptions = { mtbiDays: 0, recoveryHours: 0, pricePerMTok: 40, rampMonths: 0 };

  const build = (over: Partial<Parameters<typeof buildSurfaceGrid>[0]> = {}) =>
    buildSurfaceGrid({
      groups: groupsOf(),
      mode: MODE,
      metric: 'margin' as const,
      costProvider: COST_PROVIDER,
      costType: COST_TYPE,
      mw: 10,
      anchorMs,
      horizonMonths: 12,
      assumptions,
      currentZ: 50,
      labelFor: (key) => key.toUpperCase(),
      colorFor: () => '#123456',
      specsFor: () => ({ powerKwPerGpu: 1.2, costPerGpuHour: 3 }),
      ...over,
    });

  it('builds one grid per chip on the shared axes', () => {
    const grid = build()!;
    expect(grid).not.toBeNull();
    expect(grid.chips.map((c) => c.key).toSorted()).toEqual(['b200', 'b300']);
    for (const chip of grid.chips) {
      expect(chip.cells).toHaveLength(grid.zs.length);
      for (const row of chip.cells) expect(row).toHaveLength(grid.times.length);
    }
    // Zero is always in range: which side of break-even a fleet is on is the
    // question the surface exists to answer.
    expect(grid.yMin).toBeLessThanOrEqual(0);
    expect(grid.yMax).toBeGreaterThanOrEqual(0);
  });

  it('leaves holes where nothing was measured rather than filling them', () => {
    const grid = build()!;
    const b200 = grid.chips.find((c) => c.key === 'b200')!;
    // b200 only covers 40..70 of a 20..140 axis, so it cannot cover every slice.
    expect(b200.slicesCovered).toBeGreaterThan(0);
    expect(b200.slicesCovered).toBeLessThan(grid.zs.length);
    const emptyRows = b200.cells.filter((row) => row.every((v) => v === null)).length;
    expect(emptyRows).toBeGreaterThan(0);
    // The top slice is past every b200 sweep: no cell may be invented there.
    expect(b200.cells.at(-1)!.every((v) => v === null)).toBe(true);
  });

  it('names chips it could not size instead of dropping them', () => {
    // No registered power for b200 — same disclosure the 2D section makes.
    const grid = build({
      specsFor: (key) => (key === 'b200' ? null : { powerKwPerGpu: 1.2, costPerGpuHour: 3 }),
    })!;
    expect(grid.chips.map((c) => c.key)).toEqual(['b300']);
    expect(grid.empty).toEqual(['b200']);
  });

  it('refuses to build without a power budget or a horizon', () => {
    expect(build({ mw: 0 })).toBeNull();
    expect(build({ horizonMonths: 0 })).toBeNull();
  });

  it('holds cost flat across both axes, so only throughput moves the surface', () => {
    // Cost is chips × $/chip/hr, and neither term depends on interactivity or on
    // which config won — so a chip's cost floor must be identical on every slice.
    const grid = build({ assumptions: { ...assumptions, pricePerMTok: 0 } })!;
    const b300 = grid.chips.find((c) => c.key === 'b300')!;
    const values = b300.cells.flat().filter((v): v is number => v !== null);
    expect(values.length).toBeGreaterThan(0);
    // At zero price there is no revenue anywhere, so every live cell is exactly
    // the flat cost — one number across the whole surface.
    for (const v of values) expect(v).toBeCloseTo(values[0]!, 6);
  });

  describe('the y-axis metric', () => {
    it('carries the metric on the grid so a view cannot mislabel the axis', () => {
      expect(build()!.metric).toBe('margin');
      expect(build({ metric: 'revenue' })!.metric).toBe('revenue');
    });

    it('separates revenue from margin by exactly the flat cost, everywhere', () => {
      // The two metrics differ by cost alone, and cost does not depend on time,
      // interactivity or which config won — so the gap between the surfaces must be
      // one number per chip. This is the pin that catches the metric being applied
      // somewhere that also moves the throughput steps.
      const margin = build({ metric: 'margin' })!;
      const revenue = build({ metric: 'revenue' })!;
      expect(revenue.chips.map((c) => c.key)).toEqual(margin.chips.map((c) => c.key));

      for (const [ci, chip] of revenue.chips.entries()) {
        const other = margin.chips[ci]!;
        const gaps: number[] = [];
        for (const [zi, row] of chip.cells.entries()) {
          for (const [ti, value] of row.entries()) {
            const marginValue = other.cells[zi]![ti];
            // Holes must fall in the same places: coverage is a property of the
            // run history, not of which rate is being plotted.
            expect(value === null).toBe(marginValue === null);
            if (value === null || marginValue === null) continue;
            gaps.push(value - marginValue);
          }
        }
        expect(gaps.length).toBeGreaterThan(0);
        for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 6);
        expect(gaps[0]!).toBeGreaterThan(0);
      }
    });

    it('keeps revenue non-negative, so zero is the floor rather than a threshold', () => {
      // Which is why the view suppresses the break-even plane on a revenue grid:
      // nothing can cross a line the data never goes below.
      const grid = build({ metric: 'revenue' })!;
      const values = grid.chips
        .flatMap((c) => c.cells.flat())
        .filter((v): v is number => v !== null);
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) expect(v).toBeGreaterThanOrEqual(0);
      expect(grid.yMin).toBe(0);
      expect(grid.yMax).toBeGreaterThan(0);
    });

    it('falls as interactivity rises, within one winning config', () => {
      // The physics: chips are fixed by the power budget and price is one scalar,
      // so revenue tracks tok/s/chip — which drops as batches shrink. A rise along
      // z is therefore never this trend reversing; it is the winner changing at a
      // coverage boundary, so this compares slices that share a winning rung.
      const grid = build({ metric: 'revenue' })!;
      const chip = grid.chips.find((c) => c.key === 'b300')!;
      const lastTime = grid.times.length - 1;
      const readable = chip.cells
        .map((row, zi) => ({ zi, value: row[lastTime] }))
        .filter((r): r is { zi: number; value: number } => r.value !== null);
      expect(readable.length).toBeGreaterThan(2);
      expect(readable.at(-1)!.value).toBeLessThan(readable[0]!.value);
    });
  });
});
