import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import agenticMatrix from './__fixtures__/required-power-agentic-matrix.json';
import {
  assertRequiredPowerPointsRetained,
  verifyRequiredPowerArtifacts,
  verifyRequiredPowerPublication,
} from './required-power-publication';
import {
  isBenchmarkPointPurged,
  PURGED_BENCHMARK_POINTS,
  type PurgedBenchmarkPoint,
} from './run-overrides';

// Ordinary planner output for Qwen3.5/H100 8K1K; fingerprints include the full recipe.
const fingerprint = 'fa0645b4dec181eafda7472c891e90d9a5bf7bad7ee764aa0fdcc41ff841adf1';
const source = { runId: 123, runAttempt: 2, headSha: 'abc123' };
const required = {
  'recipe-fingerprint': fingerprint,
  conc: 1,
  isl: 8192,
  osl: 1024,
  'require-power': true,
};
const row = {
  infmax_model_prefix: 'qwen3.5',
  hw: 'h100',
  framework: 'sglang',
  precision: 'fp8',
  recipe_fingerprint: fingerprint,
  conc: 1,
  isl: 8192,
  osl: 1024,
  tp: 8,
  ep: 1,
  power_valid: 1,
  power_metric_schema_version: 2,
  avg_power_w: 500,
  avg_total_gpu_power_w: 4000,
  total_gpu_energy_j: 8000,
  joules_per_output_token: 2,
};
const manifest = (entries = [required]) => ({
  head: source.headSha,
  'run-id': source.runId,
  'run-attempt': source.runAttempt,
  // full-sweep is a Klaud policy field: fail-fast runs may legitimately set it false.
  'full-sweep': false,
  matrix: {
    single_node: { '8k1k': entries },
    multi_node: {},
    evals: [{ ...required, 'eval-only': true }],
  },
});
const artifacts = (rows: unknown[] = [row]) => [{ path: 'bmk_qwen/agg.json', rows }];
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('required power publication preflight', () => {
  it.each([true, false, undefined])(
    'requires the manifest when changelog metadata declares power: %s',
    (declaredRequired) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'required-power-'));
      dirs.push(dir);
      fs.mkdirSync(path.join(dir, 'changelog-metadata'));
      fs.writeFileSync(
        path.join(dir, 'changelog-metadata', 'changelog_metadata.json'),
        JSON.stringify({ 'require-power': declaredRequired, entries: [] }),
      );
      if (declaredRequired)
        expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('sweep manifest missing');
      else expect(verifyRequiredPowerArtifacts(dir, source)).toEqual([]);
    },
  );

  it('matches the canonical AgentX users value instead of a conflicting raw conc', () => {
    const scope = {
      ...manifest(),
      matrix: { single_node: { agentic: [required] }, multi_node: {} },
    };
    const conflicting = { ...row, scenario_type: 'agentic-coding', conc: 1, users: 2 };
    expect(() => verifyRequiredPowerPublication(scope, artifacts([conflicting]), source)).toThrow(
      'missing benchmark point',
    );
    expect(
      verifyRequiredPowerPublication(
        scope,
        artifacts([{ ...conflicting, conc: 2, users: 1 }]),
        source,
      ),
    ).toHaveLength(1);
  });

  it('accepts exact ordinary source points, including fail-fast manifests and identical aggregate copies', () => {
    expect(
      verifyRequiredPowerPublication(
        manifest(),
        [...artifacts(), { path: 'results_bmk/agg_bmk.json', rows: [{ ...row }] }],
        source,
      ),
    ).toHaveLength(1);
  });

  it('fails required coverage after a point purge even when an optional point is retained', () => {
    const requiredPoints = verifyRequiredPowerPublication(manifest(), artifacts(), source);
    const candidates = [requiredPoints[0], { ...requiredPoints[0], conc: 2 }];
    const purged: PurgedBenchmarkPoint = {
      githubRunId: source.runId,
      runAttempt: source.runAttempt,
      configId: 999999,
      benchmarkType: 'single_turn',
      isl: 8192,
      osl: 1024,
      conc: 1,
      offloadMode: 'off',
      recipeFingerprint: fingerprint,
    };
    const registry = PURGED_BENCHMARK_POINTS as PurgedBenchmarkPoint[];
    registry.push(purged);
    try {
      const retained = candidates.filter(
        (point) =>
          !isBenchmarkPointPurged(source.runId, source.runAttempt, {
            ...point,
            configId: purged.configId,
          }),
      );
      expect(retained.map((point) => point.conc)).toEqual([2]);
      expect(() => assertRequiredPowerPointsRetained(requiredPoints, retained)).toThrow(
        'missing benchmark point after ingest',
      );
      expect(isBenchmarkPointPurged(source.runId, source.runAttempt, purged)).toBe(true);
      expect(() => assertRequiredPowerPointsRetained([], retained)).not.toThrow();
    } finally {
      registry.splice(registry.indexOf(purged), 1);
    }
  });

  it('accepts retained aggregate copies but cannot replace a filtered required point with another identity', () => {
    const requiredPoints = verifyRequiredPowerPublication(manifest(), artifacts(), source);
    expect(() =>
      assertRequiredPowerPointsRetained(requiredPoints, [
        requiredPoints[0],
        { ...requiredPoints[0] },
      ]),
    ).not.toThrow();
    expect(() =>
      assertRequiredPowerPointsRetained(requiredPoints, [
        { ...requiredPoints[0], recipeFingerprint: 'other-recipe' },
      ]),
    ).toThrow('missing benchmark point after ingest');
  });

  it('fails before ingestion when any declared concurrency, fingerprint or scenario is missing', () => {
    for (const candidate of [
      [],
      [{ ...row, conc: 2 }],
      [{ ...row, recipe_fingerprint: '' }],
      [{ ...row, isl: 1024 }],
    ]) {
      expect(() =>
        verifyRequiredPowerPublication(manifest(), artifacts(candidate), source),
      ).toThrow('missing benchmark point');
    }
  });

  it('does not retroactively require optional matrix points or legacy results', () => {
    const scope = manifest([required, { ...required, conc: 2, 'require-power': false }]);
    expect(
      verifyRequiredPowerPublication(scope, artifacts([row, { conc: 2, power_valid: 0 }]), source),
    ).toHaveLength(1);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'required-power-'));
    dirs.push(dir);
    expect(verifyRequiredPowerArtifacts(dir, { ...source, headSha: null })).toHaveLength(0);
  });

  it.each([
    { power_valid: 0 },
    { power_valid: '1' },
    { power_metric_schema_version: '2' },
    { avg_power_w: 0 },
    { avg_total_gpu_power_w: -1 },
    { total_gpu_energy_j: NaN },
    { joules_per_output_token: Infinity },
    { joules_per_output_token: undefined },
    { benchmark_outcome: { status: 'failed' } },
  ])('rejects invalid required measurements: %j', (change) => {
    expect(() =>
      verifyRequiredPowerPublication(manifest(), artifacts([{ ...row, ...change }]), source),
    ).toThrow('Required power:');
  });

  it('rejects conflicting copies and duplicate rows inside either source or aggregate file', () => {
    expect(() =>
      verifyRequiredPowerPublication(
        manifest(),
        [...artifacts(), { path: 'results_bmk/agg.json', rows: [{ ...row, avg_power_w: 501 }] }],
        source,
      ),
    ).toThrow('conflicting');
    expect(() => verifyRequiredPowerPublication(manifest(), artifacts([row, row]), source)).toThrow(
      'duplicate',
    );
    expect(() =>
      verifyRequiredPowerPublication(
        manifest(),
        [...artifacts(), { path: 'results_bmk/agg.json', rows: [row, row] }],
        source,
      ),
    ).toThrow('duplicate');
  });

  it('rejects stale source run, attempt or head, an empty scope, and duplicate planned points', () => {
    for (const changed of [
      { runId: 999 },
      { runAttempt: 1 },
      { headSha: 'stale' },
      { headSha: null },
    ])
      expect(() =>
        verifyRequiredPowerPublication(manifest(), artifacts(), { ...source, ...changed }),
      ).toThrow('manifest source');
    expect(() => verifyRequiredPowerPublication(manifest([]), [], source)).toThrow('no required');
    expect(() =>
      verifyRequiredPowerPublication(manifest([required, required]), artifacts(), source),
    ).toThrow('duplicate matrix');
  });

  it('reuses the declared scope from a successful earlier attempt of the same run and head', () => {
    expect(
      verifyRequiredPowerPublication({ ...manifest(), 'run-attempt': 1 }, artifacts(), source),
    ).toHaveLength(1);
  });

  it('expands real ordinary AgentX planner concurrency arrays and fixed-sequence batches', () => {
    // First B200 recipe from the ordinary Kimi K3 required-power planner, 2026-09-13.
    const entry = agenticMatrix.multi_node.agentic[0];
    expect(
      verifyRequiredPowerPublication(
        { ...manifest(), matrix: agenticMatrix },
        artifacts([
          {
            ...row,
            infmax_model_prefix: 'kimik3',
            hw: 'b200',
            framework: 'dynamo-vllm',
            precision: 'fp4',
            recipe_fingerprint: entry['recipe-fingerprint'],
            conc: entry.conc[0],
            scenario_type: 'agentic-coding',
          },
        ]),
        source,
      ),
    ).toHaveLength(1);
    const fixedMatrix = {
      single_node: {},
      multi_node: { '8k1k': [{ ...required, conc: [1, 2, 4] }] },
    };
    expect(
      verifyRequiredPowerPublication(
        { ...manifest(), matrix: fixedMatrix },
        artifacts([1, 2, 4].map((conc) => ({ ...row, conc }))),
        source,
      ),
    ).toHaveLength(3);
    expect(() =>
      verifyRequiredPowerPublication({ ...manifest(), matrix: fixedMatrix }, artifacts(), source),
    ).toThrow('missing benchmark');
  });

  it('accepts AgentX and requires both energy roles only for a declared disaggregated recipe', () => {
    const scope = manifest();
    const agentic = { ...required, 'scenario-type': 'agentic-coding', disagg: true };
    const agenticManifest = {
      ...scope,
      matrix: { single_node: {}, multi_node: { agentic: [agentic] } },
    };
    const split = {
      ...row,
      isl: undefined,
      osl: undefined,
      scenario_type: 'agentic-coding',
      disagg: true,
      prefill_gpu_energy_j: 3000,
      decode_gpu_energy_j: 5000,
      prefill_joules_per_input_token: 1,
      decode_joules_per_output_token: 1.25,
    };
    expect(
      verifyRequiredPowerPublication(agenticManifest, artifacts([split]), source),
    ).toHaveLength(1);
    expect(() =>
      verifyRequiredPowerPublication(
        agenticManifest,
        artifacts([{ ...split, decode_gpu_energy_j: undefined }]),
        source,
      ),
    ).toThrow('decode_gpu_energy_j');
    const aggregate = {
      ...agenticManifest,
      matrix: { single_node: {}, multi_node: { agentic: [{ ...agentic, disagg: false }] } },
    };
    expect(
      verifyRequiredPowerPublication(
        aggregate,
        artifacts([{ ...row, scenario_type: 'agentic-coding' }]),
        source,
      ),
    ).toHaveLength(1);
  });

  it('reads the producer artifact and checks all rows before the ingest entry point writes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'required-power-'));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, 'required-power-sweep-manifest'));
    fs.writeFileSync(
      path.join(dir, 'required-power-sweep-manifest', 'sweep_manifest.json'),
      JSON.stringify(manifest()),
    );
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('missing benchmark');
    fs.mkdirSync(path.join(dir, 'bmk_qwen'));
    fs.writeFileSync(path.join(dir, 'bmk_qwen', 'agg.json'), JSON.stringify(row));
    expect(verifyRequiredPowerArtifacts(dir, source)).toHaveLength(1);
  });
});
