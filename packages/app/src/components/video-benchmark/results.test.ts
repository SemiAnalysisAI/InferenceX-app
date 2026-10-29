import { describe, expect, it } from 'vitest';
import fixture from '../../../cypress/fixtures/api/video-history.json';
import type { VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';
import { videoPoints } from './points';
import {
  DEFAULT_RESULTS_STATE,
  parseResultsState,
  resultProjection,
  resultsSearch,
  type ResultsState,
} from './results';
import type { ResultsEvidence } from './results-evidence';

const points = videoPoints([fixture as unknown as VideoHistoryPage]);
const state = (): ResultsState => structuredClone(DEFAULT_RESULTS_STATE);
const eligible = points.find(
  (p) => p.hardwareKey === 'h200' && p.concurrency === 1 && p.scheduled === 20,
)!;
const evidence = (overrides: Partial<ResultsEvidence> = {}): ResultsEvidence => ({
  workloadHash: 'a'.repeat(64),
  manifestHash: 'b'.repeat(64),
  verified: true,
  engine: 'sglang',
  mode: 't2v',
  attempted: 20,
  notStarted: 0,
  latencies: Array.from({ length: 20 }, (_, i) => i + 1),
  clientP50: 10.5,
  powerValid: true,
  powerSeries: [],
  peakPowerW: 1500,
  gpuMemoryMiB: null,
  warmupSeconds: null,
  failures: null,
  ...overrides,
});

describe('VideoGenX results contract', () => {
  it('uses one complete 20-clip C1 workload, the same ten-sample floor and the requested hardware roster', () => {
    const result = resultProjection(points, state());
    expect(result.cells.map((c) => c.point.hardwareKey).sort()).toEqual(['b200', 'h200']);
    expect(new Set(result.cells.map((c) => c.point.workloadKey)).size).toBe(1);
    expect(result.cells.every((c) => c.point.scheduled === 20 && c.point.concurrency === 1)).toBe(
      true,
    );
    for (const change of [
      { samples: 9 },
      { scheduled: 4 },
      { concurrency: 2 },
      { workloadKey: null },
      { workloadKey: 'unverified-label' },
    ])
      expect(resultProjection([{ ...eligible, ...change }], state()).cells).toEqual([]);
    expect(resultProjection([], state()).cells).toEqual([]);
  });

  it('preserves unknown allocation and planned measures rather than synthesizing values', () => {
    const point: VideoPoint = { ...eligible, allocated: null, energyKj: null };
    const row = resultProjection([point], state()).cells[0];
    expect(row.cost.participating).not.toBeNull();
    expect(row.cost.allocated).toBeNull();
    expect(row.profit.allocated).toBeNull();
    expect(row.profit.participating).toBeNull();
    expect(row.joulesPerClip).toBeNull();
    expect(row.p95).toBeNull();
    expect(row.deadlineAttainment).toBeNull();
    expect(row.metadata.mode).toBeNull();
  });

  it('computes both cost bases from measured throughput and charges reserved capacity at zero utilization', () => {
    const selection = {
      ...state(),
      utilization: 0,
      apiPrices: { t2v: 0.08, i2v: null, r2v: null },
    };
    const point = { ...eligible, participating: 2, allocated: 8, results: evidence() };
    const row = resultProjection([point], selection).cells[0];
    expect(row.cost.allocated!.perVideo).toBeCloseTo(row.cost.participating!.perVideo * 4);
    expect(row.cost.participating!.perVideoSecond).toBeCloseTo(
      row.cost.participating!.perVideo / point.durationSeconds!,
    );
    expect(row.profit.allocated!.revenuePerHour).toBe(0);
    expect(row.profit.allocated!.profitPerHour).toBe(-row.cost.allocated!.perHour);
    expect(row.profit.allocated!.profitPerGpuHour).toBe(-row.cost.allocated!.perHour / 8);
    const changedMode = { ...point, results: evidence({ mode: 'i2v' }) };
    expect(resultProjection([changedMode], selection).cells[0].profit.participating).toBeNull();
  });

  it('uses complete per-request populations for P95 and deadline metrics without treating late clips as failures', () => {
    const point = { ...eligible, valid: 20, scheduled: 20, wallSeconds: 200, results: evidence() };
    const row = resultProjection([point], { ...state(), deadlineSeconds: 10 }).cells[0];
    expect(row.p95).toBe(19);
    expect(row.deadlineAttainment).toBe(0.5);
    expect(row.deadlineGoodput).toBe(0.05);
    expect(row.point.failed).toBe(point.failed);
    const partial = { ...point, results: evidence({ latencies: [1, 2] }) };
    expect(resultProjection([partial], state()).cells[0].deadlineAttainment).toBeNull();
    expect(resultProjection([partial], state()).cells[0].p95).toBeNull();
  });

  it('keeps official and already-published overlay rows separate and respects every data selector', () => {
    const official = {
      ...eligible,
      id: 'official:c1',
      runId: '100',
      participating: 2,
      results: evidence(),
    };
    const overlay = { ...official, id: 'overlay:c1', runId: '200', participating: 4 };
    const selection = { ...state(), unofficialRun: '200' };
    const result = resultProjection([official, overlay], selection);
    expect(result.cells.map((c) => c.point.id)).toEqual(['official:c1']);
    expect(result.overlayCells.map((c) => c.point.id)).toEqual(['overlay:c1']);
    expect(result.overlayCells[0].overlay).toBe(true);
    expect(result.deploymentCells.map((cell) => cell.point.id)).toEqual(['official:c1']);
    expect(result.workloadMix.map((cell) => cell.point.id)).toEqual(['official:c1']);
    expect(resultProjection([official, overlay], selection, [overlay]).overlayCells).toHaveLength(
      1,
    );
    expect(resultProjection([official], selection).overlayCells).toEqual([]);
    expect(resultProjection([official, overlay], { ...selection, hidden: ['h200'] }).cells).toEqual(
      [],
    );
    expect(resultProjection([official], { ...state(), engine: 'different' }).cells).toEqual([]);
    expect(resultProjection([official], { ...state(), mode: 'i2v' }).cells).toEqual([]);
    expect(
      resultProjection([official, overlay], { ...state(), gpuCount: 2 }).deploymentCells,
    ).toHaveLength(2);
  });

  it('keeps an exact unapproved overlay out of official cells, options for other runs and aggregates', () => {
    const official = { ...eligible, id: 'official:c1', runId: '100', results: evidence() };
    const named = {
      ...official,
      id: 'named:c1',
      runId: '200',
      hardwareKey: 'b200',
      approved: false,
      allocated: null,
    };
    const other = { ...named, id: 'other:c1', runId: '300', model: 'Other model' };
    const selection = { ...state(), unofficialRun: '200' };
    const result = resultProjection([official], selection, [named, other]);
    expect(result.cells.map((cell) => cell.point.id)).toEqual(['official:c1']);
    expect(result.deploymentCells.map((cell) => cell.point.id)).toEqual(['official:c1']);
    expect(result.workloadMix.map((cell) => cell.point.id)).toEqual(['official:c1']);
    expect(result.overlayCells).toHaveLength(1);
    expect(result.overlayCells[0].point).toMatchObject({ id: 'named:c1', approved: false });
    expect(result.overlayCells[0].cost.participating).not.toBeNull();
    expect(result.overlayCells[0].cost.allocated).toBeNull();
    expect(JSON.stringify(result)).not.toContain('other:c1');
    for (const filter of [
      { hidden: ['b200'] },
      { gpuCount: 2 },
      { engine: 'other' },
      { date: '1900-01-01' },
      { model: 'other' },
      { resolution: '1×1' },
      { duration: 1 },
      { mode: 'i2v' },
      { steps: 1 },
    ])
      expect(
        resultProjection([official], { ...selection, ...filter }, [named]).overlayCells,
      ).toEqual([]);
    const cleared = resultProjection([official], state(), [named, other]);
    expect(cleared.overlayCells).toEqual([]);
    expect(cleared.cells.map((cell) => cell.point.id)).toEqual(['official:c1']);
  });

  it('prefers an approved cohort but permits explicit or fallback diagnostic-only selection', () => {
    const identity = JSON.parse(eligible.workloadKey!);
    identity.plan.generation.width = 512;
    const named = {
      ...eligible,
      id: 'diagnostic:c1',
      runId: '200',
      approved: false,
      workloadKey: JSON.stringify(identity),
    };
    const selection = { ...state(), unofficialRun: '200' };
    const preferred = resultProjection([eligible], selection, [named]);
    expect(preferred.workloadKey).toBe(eligible.workloadKey);
    expect(preferred.overlayCells).toEqual([]);
    const explicit = resultProjection([eligible], { ...selection, workload: named.id }, [named]);
    expect(explicit.cells).toEqual([]);
    expect(explicit.overlayCells[0].point.id).toBe(named.id);
    expect(explicit.workloadMix.every((cell) => cell.point.approved === true)).toBe(true);
    const fallback = resultProjection([], selection, [named]);
    expect(fallback.cells).toEqual([]);
    expect(fallback.deploymentCells).toEqual([]);
    expect(fallback.workloadMix).toEqual([]);
    expect(fallback.overlayCells[0].point.id).toBe(named.id);
    expect(fallback.state.workload).toBe(named.id);
    expect(resultProjection([], state(), [named]).options.workloads).toEqual([]);
    for (const change of [
      { samples: 9 },
      { scheduled: 4 },
      { concurrency: 2 },
      { workloadKey: null },
    ])
      expect(resultProjection([], selection, [{ ...named, ...change }]).overlayCells).toEqual([]);
  });

  it('round-trips all controls, including per-mode prices, through the shared URL/API parser', () => {
    const selection: ResultsState = {
      ...state(),
      model: 'MiniMaxAI/MiniMax-H3',
      workload: eligible.workloadKey!,
      resolution: '1344×768',
      duration: 8,
      mode: 't2v',
      steps: 50,
      gpuCount: 4,
      engine: 'sglang',
      date: '2026-10-18',
      hidden: ['mi355x'],
      deadlineSeconds: 60,
      costTier: 'r',
      apiPrice: 0.02,
      apiPrices: { t2v: 0, i2v: 0.1, r2v: null },
      utilization: 0.5,
      unofficialRun: '123',
    };
    expect(parseResultsState(resultsSearch(selection))).toEqual(selection);
    expect(parseResultsState('r_api=NaN&r_deadline=-2&r_utilization=Infinity').apiPrice).toBeNull();
  });
  it('shares a compact source selector while retaining full prompt/seed identity internally', () => {
    const projection = resultProjection(points, state());
    const selected = projection.options.workloads[0].key;
    expect(selected.length).toBeLessThan(100);
    const result = resultProjection(points, { ...state(), workload: selected });
    expect(result.cells.length).toBeGreaterThan(0);
    expect(result.workloadKey).toContain('cases');
    expect(resultsSearch(result.state).length).toBeLessThan(300);
    expect(resultProjection(points, { ...state(), workload: 'missing' }).cells).toEqual([]);
  });
  it('keeps engines and workload-mix cohorts distinct rather than overwriting or pooling them', () => {
    const a = { ...eligible, id: 'first:c1', results: evidence({ engine: 'sglang' }) };
    const b = { ...eligible, id: 'second:c1', results: evidence({ engine: 'vllm-omni' }) };
    const plan = JSON.parse(eligible.workloadKey!);
    plan.plan.generation.height = 512;
    const c = { ...a, id: 'third:c1', workloadKey: JSON.stringify(plan) };
    const result = resultProjection([a, b, c], {
      ...state(),
      apiPrices: { t2v: 0.08, i2v: null, r2v: null },
    });
    expect(result.cells).toHaveLength(2);
    expect(result.workloadMix).toHaveLength(3);
    expect(new Set(result.workloadMix.map((row) => row.point.workloadKey)).size).toBe(2);
    expect(
      result.workloadMix.find((row) => row.point.id === 'first:c1')!.profit.participating,
    ).not.toBeNull();
    expect(result.workloadMix.find((row) => row.point.id === 'third:c1')!.profit).toEqual({
      participating: null,
      allocated: null,
    });
  });
  it('uses the legacy P50 only when its complete identity explicitly records client delivery timing', () => {
    const old = resultProjection([eligible], state()).cells[0];
    expect(old.deliveryP50).toBe(eligible.p50);
    const native = { ...eligible, results: evidence({ clientP50: 42 }) };
    expect(resultProjection([native], state()).cells[0].deliveryP50).toBe(42);
    expect(
      resultProjection([{ ...native, results: evidence({ clientP50: null }) }], state()).cells[0]
        .deliveryP50,
    ).toBeNull();
    const identity = JSON.parse(eligible.workloadKey!);
    identity.semantics.boundary = 'harness_seconds';
    expect(
      resultProjection([{ ...eligible, workloadKey: JSON.stringify(identity) }], state()).cells[0]
        .deliveryP50,
    ).toBeNull();
  });
  it('preserves the single published overlay through the canonical shared-link alias', () => {
    const selected = parseResultsState('unofficialrun=123');
    const shared = resultsSearch(selected);
    expect(new URLSearchParams(shared).get('unofficialruns')).toBe('123');
    expect(parseResultsState(shared).unofficialRun).toBe('123');
    expect(parseResultsState('unofficialruns=123,456').unofficialRun).toBeNull();
  });
});
